"""Сквозной прогон воронки на живом Postgres без внешних сервисов.

Claude, Telegram и MinIO подменены фейками; Threads API — настоящий клиент
ThreadsAPI поверх httpx.MockTransport (проверяем цепочку reply_to_id, карусель,
ответы, метрики). Всё пишется в отдельную схему funnel_smoke, в конце она удаляется.

    cd backend
    DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/db python -m tests.funnel_smoke
"""
from __future__ import annotations

import itertools
import json
import re
from datetime import date, datetime, time, timedelta
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

import httpx
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, select, text

from app.config import settings

SCHEMA = "funnel_smoke"
TZ = ZoneInfo("Europe/Moscow")
DAY = date(2026, 11, 3)

# ── окружение ────────────────────────────────────────────────────────────────
settings.token_encryption_key = Fernet.generate_key().decode()
settings.anthropic_api_key = "test"
settings.telegram_bot_token = "123:test"
settings.owner_telegram_id = 1
settings.funnel_chat_id = -100999
settings.funnel_topic_id = 5
settings.funnel_autopublish = True
settings.channel_id = -100123
settings.channel_mode = "private"
settings.funnel_voice_level = 3
settings.funnel_start_date = DAY.isoformat()
settings.voyage_api_key = ""
settings.cron_secret = "s3cret"
settings.webapp_auth_disabled = True

engine = create_engine(settings.database_url, future=True,
                       connect_args={"options": f"-csearch_path={SCHEMA},public"})

import app.core.database as database  # noqa: E402

database.get_engine.cache_clear()
database.get_engine = lambda: engine  # type: ignore[assignment]

import app.models  # noqa: E402,F401
from app.core.database import Base, session_scope  # noqa: E402
from app.core.security import encrypt_token  # noqa: E402
from app.funnel import agents, jobs, qa, service, storage  # noqa: E402
from app.funnel import telegram_api as tg  # noqa: E402
from app.funnel import threads_api as tapi  # noqa: E402
from app.models.account import Account  # noqa: E402
from app.models.funnel import FunnelComment, FunnelReceiver, FunnelThread, StoryFact  # noqa: E402

jobs.get_engine = lambda: engine  # type: ignore[assignment]

# ── фейк Claude ──────────────────────────────────────────────────────────────
LLM_CALLS: list[str] = []
FORECASTS: list[str] = []
MECHANICS = ["признание", "заявление", "мольба", "команда", "юмор", "замена"]


def fake_hooks(prefix: str = "") -> list[dict]:
    return [{"text": f"{prefix}ЗА 35 МИНУТ ИИ ПОКАЗАЛ ТО, ЧТО Я НЕ ВИДЕЛ 4 ГОДА ({m})\n"
                     "Разобрал свои заметки — и полчаса сидел молча.\nВот промпт ↓",
             "mechanic": m, "needs_proof": m in ("признание", "замена")} for m in MECHANICS]


BODY = [
    "Вставляете в ChatGPT или Claude: «Ты психолог, работаешь в КПТ и схема-терапии…»",
    "Правило сессии: один вопрос за раз, как детектив.",
    "Принципы: это не слабость, а защитный механизм. 5 форм самосаботажа.",
    "ЭТАП 1–2: вопросы и что искать в ответах.",
    "ЭТАП 3–4: самый сложный этап — диагностика и эксперимент на неделю.",
    "План на неделю после сессии собрал здесь — {link}\nи это ещё не всё, продолжаем промпт:",
    "Правила диалога: наблюдение между строк.",
    "Не потому что вы слабые. Разбор, который работает в связке с этим промптом: {link}",
]


def fake_structured(role: str, payload: str, schema: dict, *, effort: str, max_tokens: int = 16000) -> dict:
    LLM_CALLS.append(role)
    if role == "funnel_plan":
        slots = [int(x) for x in re.findall(r'"slot": (\d+)', payload)]
        hit_ids = [int(x) for x in re.findall(r'"id": (\d+)', payload.split("Исследование:", 1)[-1])][:2]
        return {"slots": [{"slot": s, "topic": f"Тема слота {s}: ИИ находит паттерн самосаботажа",
                           "hypothesis": "признание vs юмор", "reserve_id": 0, "evidence": hit_ids} for s in slots]}
    if schema is agents.HOOKS_SCHEMA:
        return {"hooks": fake_hooks("НОВЫЙ УГОЛ: ")}
    if role == "funnel_write":
        return {"hooks": fake_hooks(), "posts": list(BODY), "mid_index": 7, "receiver_id": 0,
                "receiver_brief": "план на неделю после сессии", "materials_request": "скрин ответа ИИ",
                "facts_needed": [], "media_hint": "скрин диалога"}
    if role == "funnel_review":
        data = json.loads(payload.split("Ветка на проверку:\n", 1)[1].split("\n\nПриёмник", 1)[0])
        return {"hooks": data["hooks"], "posts": data["posts"], "mid_index": data["mid_index"] or 7,
                "facts_needed": [], "report": "проверил: ок"}
    if role == "funnel_edit":
        data = json.loads(payload.split(":\n", 1)[1].split("\n\nПравка от автора", 1)[0])
        posts = list(data["posts"])
        posts[0] = posts[0] + " (короче)"
        return {"hook": data["hook"], "posts": posts, "facts_needed": [], "summary": "сократил пост 2"}
    if role == "funnel_receiver":
        if "text" in schema["properties"]:
            return {"title": "План на неделю после сессии", "kind": "prompts",
                    "contents": "3 промпта + чек-лист", "clusters": [1], "text": "Что будет, если…\n«промпт»"}
        return {"title": "Готовый приёмник", "kind": "instruction", "contents": "инструкция", "clusters": [1, 2]}
    if role == "funnel_forecast":
        FORECASTS.append(payload)
        hits = payload.split("Доказанные хиты за 30 дней:\n", 1)[1].split("\n\nПровалы", 1)[0]
        ids = [int(x) for x in re.findall(r'"id": (\d+)', hits)][:1]
        weak = len(FORECASTS) == 1                    # первая ветка дня — слабая, проверяем доработку
        return {"score": 4.5 if weak else 7.6, "verdict": "повторяет механику хита донора",
                "why": ["тема про самого читателя", "хит донора с xn 8"],
                "evidence": [{"id": i, "note": "та же боль и механика признания"} for i in ids] + [{"id": 999999, "note": "выдуманный"}],
                "risks": ["пост 4 длинный"], "boost": "добавить цифру в первую строку"}
    if role == "funnel_reply":
        return {"reply": "Спасибо! Попробуйте второй этап отдельно — там самое интересное.",
                "skip": "спам" in payload}
    raise AssertionError(role)


agents._structured = fake_structured  # type: ignore[assignment]

# ── фейк Telegram ────────────────────────────────────────────────────────────
TG_CALLS: list[tuple[str, dict]] = []
_msg_ids = itertools.count(1000)
_invites = itertools.count(1)


def fake_tg(method: str, payload: dict | None = None, files=None, timeout: float = 30.0):
    payload = payload or {}
    TG_CALLS.append((method, payload))
    if method == "sendMessage":
        text_ = payload["text"]
        assert len(text_) <= 4096, len(text_)
        return {"message_id": next(_msg_ids)}
    if method == "createChatInviteLink":
        return {"invite_link": f"https://t.me/+FakeInvite{next(_invites):04d}"}
    return True


tg._call = fake_tg  # type: ignore[assignment]
tg.get_file_bytes = lambda file_id: (b"\xff\xd8fakejpeg", f"photos/{file_id}.jpg")  # type: ignore[assignment]
tg.link_is_live = lambda url: True  # type: ignore[assignment]
storage.configured = lambda: True  # type: ignore[assignment]

# ── фейк Apify: исследование ──────────────────────────────────────────────────
from app.funnel import research  # noqa: E402

_now = datetime.now(ZoneInfo("UTC"))


def _rp(code, author, likes, text, shares=0, query=""):
    return research.Post(code, author, text, f"https://www.threads.com/@{author}/post/{code}",
                         _now - timedelta(days=3), likes=likes, replies=likes // 10, shares=shares, query=query)


research.fetch_users = lambda users, n=40: (  # type: ignore[assignment]
    [_rp(f"d{i}", "petkova_anjela", 10, f"обычный пост {i}") for i in range(8)]
    + [_rp("hit1", "petkova_anjela", 900, "Я РЕАЛЬНО ОФИГЕЛА, КОГДА ИИ ПОКАЗАЛ ПАТТЕРН САМОСАБОТАЖА", shares=400),
       _rp("flop1", "petkova_anjela", 1, "как продвигаться в Threads")])
research.fetch_search = lambda kws, n=25: [_rp(f"s{i}", f"user{i}", 20, "промпт для ChatGPT", query="ChatGPT")
                                           for i in range(5)] + [_rp("shit", "x", 600, "ChatGPT разобрал мой гардероб", query="ChatGPT")]
research.fetch_thread_body = lambda url: ["хук ветки", "пост 2: промпт", "пост 3: финал"]  # type: ignore[assignment]
storage.put_image = lambda key, data, ct="image/jpeg": key  # type: ignore[assignment]
storage.public_url = lambda key, ttl=None: f"https://minio.example/{key}?sig=1"  # type: ignore[assignment]

# ── фейк Threads Graph API (настоящий клиент поверх MockTransport) ────────────
API_LOG: list[tuple[str, str, dict]] = []
_media = itertools.count(1)
CONTAINERS: dict[str, dict] = {}


def threads_handler(request: httpx.Request) -> httpx.Response:
    params = {k: v[0] for k, v in parse_qs(urlparse(str(request.url)).query).items()}
    path = request.url.path.replace("/v1.0", "")
    API_LOG.append((request.method, path, params))
    assert params.get("access_token") == "tok-123"
    if request.method == "POST" and path.endswith("/threads"):
        cid = f"c{next(_media)}"
        CONTAINERS[cid] = params
        return httpx.Response(200, json={"id": cid})
    if request.method == "POST" and path.endswith("/threads_publish"):
        return httpx.Response(200, json={"id": "m" + params["creation_id"][1:]})
    if path.endswith("/threads_publishing_limit"):
        return httpx.Response(200, json={"data": [{"quota_usage": 3, "config": {"quota_total": 250}}]})
    if path.endswith("/conversation"):
        root = path.split("/")[1]
        return httpx.Response(200, json={"data": [
            {"id": "m_own", "text": "наш пост", "username": "ilia.paliy"},
            {"id": f"cm1-{root}", "text": "Где взять план на неделю?", "username": "anna"},
            {"id": f"cm2-{root}", "text": "спам купи подписчиков", "username": "bot"},
        ]})
    if path.endswith("/insights") and "/threads_insights" not in path:
        root = path.split("/")[1]
        big = root == WINNER_ROOT.get("id")
        vals = {"views": 50000 if big else 900, "likes": 400 if big else 8, "replies": 60 if big else 2,
                "reposts": 10, "quotes": 3, "shares": 120 if big else 1}
        return httpx.Response(200, json={"data": [{"name": k, "values": [{"value": v}]} for k, v in vals.items()]})
    if path.endswith("/threads_insights"):
        return httpx.Response(200, json={"data": [{"name": "clicks", "link_total_values": [
            {"value": 77, "link_url": CLICK_URL.get("url", "")}]}]})
    if path.startswith("/m") and params.get("fields") == "permalink":
        return httpx.Response(200, json={"permalink": f"https://www.threads.net/@ilia.paliy/post/{path[1:]}"})
    if params.get("fields") == "status,error_message":
        return httpx.Response(200, json={"status": "FINISHED"})
    if path.endswith("/refresh_access_token"):
        return httpx.Response(200, json={"access_token": "tok-123", "expires_in": 5184000})
    return httpx.Response(404, json={"error": {"message": f"unexpected {request.method} {path}"}})


WINNER_ROOT: dict[str, str] = {}
CLICK_URL: dict[str, str] = {}
_transport = httpx.MockTransport(threads_handler)
tapi.ThreadsAPI._http = lambda self: httpx.Client(base_url=self.base, transport=_transport)  # type: ignore[assignment]
_real_get = httpx.get


def _fake_get(url, *a, **kw):
    if "graph.threads.net" in str(url):
        with httpx.Client(transport=_transport) as c:
            return c.get(url, params=kw.get("params"))
    return _real_get(url, *a, **kw)


httpx.get = _fake_get  # type: ignore[assignment]


def at(day: date, hh: int, mm: int = 0) -> datetime:
    return datetime.combine(day, time(hh, mm), tzinfo=TZ)


def cards_sent() -> list[str]:
    return [p["text"] for m, p in TG_CALLS if m == "sendMessage"]


def main() -> None:
    with engine.begin() as conn:
        conn.execute(text(f"drop schema if exists {SCHEMA} cascade"))
        conn.execute(text(f"create schema {SCHEMA}"))
        conn.execute(text("create extension if not exists vector"))
    # checkfirst=False: таблицы из public видны через search_path — создаём свои в схеме.
    Base.metadata.create_all(engine, checkfirst=False)
    try:
        run()
    finally:
        with engine.begin() as conn:
            conn.execute(text(f"drop schema if exists {SCHEMA} cascade"))


def run() -> None:
    # 0. seed + аккаунт
    print(jobs.run("seed"))
    res = jobs.run("research")
    print(res)
    assert res["hits"] >= 2 and res["expanded"] >= 1, res
    with session_scope() as db:
        hits = service.research_hits(db)
        assert hits[0]["xn"] > 5 and "\n\n— " in hits[0]["text"]       # хит развёрнут в ветку
        assert any(h["author"] == "x" for h in hits)                        # хит из поиска тоже найден
        assert service.research_flops(db)
    with session_scope() as db:
        db.add(Account(handle="ilia.paliy", threads_user_id="u1", access_token=encrypt_token("tok-123"),
                       status="active"))
        assert len(service.facts_texts(db)) == 3

    # 1. 06:30 план
    res = jobs.run("plan", day=DAY)
    assert len(res["threads"]) == 3, res
    with session_scope() as db:
        ts = service.day_threads(db, DAY)
        assert [t.slot_at.astimezone(TZ).hour for t in ts] == [10, 13, 18]
        assert len({t.cluster for t in ts}) == 3            # кластеры не повторяются
        assert all(t.kind == "new" for t in ts)              # первые 2 недели — только новые
        ids = [t.id for t in ts]
    assert jobs.run("plan", day=DAY)["threads"] == ids       # идемпотентно

    # 2. 07:00 генерация → карточки
    TG_CALLS.clear()
    res = jobs.run("generate", day=DAY)
    assert res["generated"] == ids and not res["failed"], res
    with session_scope() as db:
        for tid in ids:
            t = db.get(FunnelThread, tid)
            assert t.status == "draft" and len(t.hooks) == 6 and t.version == 1
            assert t.invite_link and t.link_url == t.invite_link     # своя ссылка-приглашение
            rec = db.get(FunnelReceiver, t.receiver_id)
            assert rec is not None and rec.status == "draft"          # приёмника не было → черновик
            assert t.qa["passed"], qa.blocking(t.qa)
            assert t.qa.get("editor") == "проверил: ок"
    with session_scope() as db:
        for tid in ids:
            t = db.get(FunnelThread, tid)
            fc = t.qa["forecast"]
            assert fc["score"] == 7.6, fc                                  # слабую (4.5) доработали до 7.6
            assert fc["evidence"] and all(e["id"] != 999999 for e in fc["evidence"])   # выдуманные id отброшены
            assert t.qa["evidence_ids"], t.qa
    texts = cards_sent()
    assert any("Прогноз виральности: 7.6/10" in x for x in texts)
    assert any("Ветка №%d" % ids[0] in x for x in texts)
    assert any("Черновик поста-приёмника" in x for x in texts)
    assert any("<b>9/9</b>" in x for x in texts)
    kb = [p for m, p in TG_CALLS if m == "sendMessage" and p.get("reply_markup")]
    assert all(p["message_thread_id"] == 5 for m, p in TG_CALLS if m == "sendMessage")
    assert kb, "у карточки должны быть кнопки"
    print("generate OK:", res)

    t1, t2, t3 = ids
    # 3. кнопки
    with session_scope() as db:
        r1 = db.get(FunnelThread, t1).receiver_id
        msg = service.publish_receiver(db, r1)
        assert "опубликован" in msg, msg
        assert db.get(FunnelReceiver, r1).url.startswith("https://t.me/c/123/")
    with session_scope() as db:
        assert db.get(FunnelThread, t1).qa["passed"]
        assert "Приёмник в канале есть" not in [c["name"] for c in db.get(FunnelThread, t1).qa["checks"]
                                                if not c["ok"]]
        print(service.attach_photo(db, t1, "photoA"))
        print(service.attach_photo(db, t1, "photoB"))
        print(service.approve(db, t1))
        assert db.get(FunnelThread, t1).status == "approved"
        assert "уже одобрена" in service.approve(db, t1)

    with session_scope() as db:
        # своя версия поста 3 и правка инструкцией
        print(service.apply_edit(db, t2, "пост 3: Правило сессии: только один вопрос за раз."))
        t = db.get(FunnelThread, t2)
        assert t.posts[1] == "Правило сессии: только один вопрос за раз." and t.version == 2
        print(service.apply_edit(db, t2, "короче, без капса в хуке"))
        assert db.get(FunnelThread, t2).posts[0].endswith("(короче)")
        print(service.swap_hook(db, t2, 4))
        t = db.get(FunnelThread, t2)
        assert t.active_hook == 4 and t.version == 4 and t.status == "draft"
        print(service.approve(db, t2))
        kind, obj = service.find_by_message(db, t.card_message_ids[-1])
        assert kind == "thread" and obj.id == t2

    with session_scope() as db:
        opts = service.slot_options(db, t3)
        assert opts and all(isinstance(m, int) for _, m in opts)
        # ♻️ Другая: старая в запас, новая — в тот же слот из другого кластера
        old = db.get(FunnelThread, t3)
        new = service.replace_thread(db, t3)
        assert db.get(FunnelThread, t3).status == "reserve"
        assert new.slot_at == old.slot_at and new.cluster != old.cluster and new.status == "draft"
        t3 = new.id

    # 5. слот 10:00 — выходит t1 (карусель из 2 фото + цепочка ответов)
    API_LOG.clear()
    res = jobs.run("publish", now=at(DAY, 10, 1))
    assert res["due"] == {t1: "published"}, res
    with session_scope() as db:
        t = db.get(FunnelThread, t1)
        assert t.status == "published" and len(t.threads_media_ids) == 9
        assert t.permalink.startswith("https://www.threads.net/")
        WINNER_ROOT["id"] = t.threads_media_ids[0]
        CLICK_URL["url"] = t.link_url
        posts = service.full_posts(t)
        assert all(len(p) <= 500 for p in posts) and t.link_url in posts[-1]
    created = [p for m, path, p in API_LOG if m == "POST" and path.endswith("/threads")]
    assert [c["media_type"] for c in created[:3]] == ["IMAGE", "IMAGE", "CAROUSEL"]
    assert created[0]["is_carousel_item"] == "true" and created[0]["image_url"].startswith("https://minio")
    chain = created[3:]
    assert len(chain) == 8 and all(c["media_type"] == "TEXT" and c.get("reply_to_id") for c in chain)
    # каждый следующий пост — ответ на предыдущий опубликованный
    published = [f"m{c[1:]}" for c in list(CONTAINERS)[2:]]
    assert chain[0]["reply_to_id"] == published[0]
    assert any(m == "pinChatMessage" for m, _ in TG_CALLS)   # закрытый канал: приёмник сверху
    print("publish chain OK")

    # 4. за час до слота материалов нет → фолбэк хука без доказательства
    with session_scope() as db:
        t = db.get(FunnelThread, t2)
        assert t.materials_request and not t.materials
        before = t.active_hook
    print(jobs.run("publish", now=at(DAY, 12, 10)))
    with session_scope() as db:
        t = db.get(FunnelThread, t2)
        assert t.materials_fallback
        assert not t.hooks[t.active_hook]["needs_proof"]
        assert t.status == "approved", t.status
        print("materials fallback: hook", before, "→", t.active_hook)

    # 6. t3 без ✅ к слоту 18:00 → пропуск, тема в запас; t2 — выходит в 13:00
    res = jobs.run("publish", now=at(DAY, 13, 1))
    assert res["due"] == {t2: "published"}, res
    res = jobs.run("publish", now=at(DAY, 18, 1))
    assert res["due"] == {t3: "unanswered"}, res
    with session_scope() as db:
        assert db.get(FunnelThread, t3).status == "reserve"
        # позднее ✅: ветка из запаса выходит при ближайшем прогоне
        assert "в очереди" in service.approve(db, t3)
        assert db.get(FunnelThread, t3).status == "approved"
        db.get(FunnelThread, t3).status = "reserve"      # для сценария дальше оставляем в запасе

    # 7. комментарии первые 2 часа: черновики на апрув, спам — мимо
    TG_CALLS.clear()
    res = jobs.run("comments", now=at(DAY, 14, 5))
    assert res["drafts"] == 1, res     # t2 (13:01) ещё в окне; у t1 (10:01) окно закрылось в 12:01
    with session_scope() as db:
        rows = db.scalars(select(FunnelComment)).all()
        assert {r.status for r in rows} == {"draft", "skipped"}
        draft = next(r for r in rows if r.status == "draft")
        assert draft.card_message_id
        print(service.set_comment_draft(db, draft.id, "Спасибо! План — в канале по ссылке в ветке."))
        print(service.publish_comment(db, draft.id))
        assert db.get(FunnelComment, draft.id).reply_media_id
    assert any("Комментарий к ветке" in p["text"] for m, p in TG_CALLS if m == "sendMessage")

    # 8. вступление по ссылке ветки
    with session_scope() as db:
        link = db.get(FunnelThread, t1).invite_link
        assert service.record_join(db, link, 555)
        assert not service.record_join(db, link, 555)    # повтор не считается

    # 9. 06:00 через 2 дня: метрики + оценка 48 ч
    TG_CALLS.clear()
    res = jobs.run("metrics", now=at(DAY + timedelta(days=2), 6, 0) + timedelta(hours=10))
    print(res)
    with session_scope() as db:
        t = db.get(FunnelThread, t1)
        assert t.metrics["clicks"] == 77 and t.metrics["joins"] == 1 and t.metrics["shares"] == 120
        assert t.verdict == "winner", t.verdict
        assert db.get(FunnelThread, t2).verdict in ("below", "neutral")
    assert any("48 часов" in p["text"] for m, p in TG_CALLS if m == "sendMessage")

    # 10. через 2 недели: план с перевыпуском победителя (новый хук, свежая ссылка)
    later = DAY + timedelta(days=15)
    res = jobs.run("plan", day=DAY + timedelta(days=5))     # окно 3–10 дней, но первые 2 недели — только новые
    with session_scope() as db:
        assert all(t.kind == "new" for t in service.day_threads(db, DAY + timedelta(days=5)))
        root = db.get(FunnelThread, t1)
        root.published_at = at(later - timedelta(days=4), 10)   # сдвигаем выпуск, чтобы окно было открыто
    res = jobs.run("plan", day=later)
    with session_scope() as db:
        ts = service.day_threads(db, later)
        re_ = [t for t in ts if t.kind == "reissue"]
        assert len(re_) == 1, [(t.kind, t.topic) for t in ts]
        r = re_[0]
        assert r.parent_id == t1 and r.active_hook != db.get(FunnelThread, t1).active_hook
        assert r.slot_at.astimezone(TZ).hour == 13
        assert r.posts == db.get(FunnelThread, t1).posts
    res = jobs.run("generate", day=later)
    with session_scope() as db:
        r = db.get(FunnelThread, re_[0].id)
        assert r.status == "draft" and r.invite_link and r.invite_link != db.get(FunnelThread, t1).invite_link
    print("reissue OK")

    # 11. неделя: отчёт и новые веса
    TG_CALLS.clear()
    jobs.run("report", day=DAY + timedelta(days=6))
    rep = next(p["text"] for m, p in TG_CALLS if m == "sendMessage")
    assert "Веса кластеров" in rep and "Лучшие хуки" in rep, rep
    with session_scope() as db:
        w = service.cluster_weights(db)
        assert abs(sum(w.values()) - 1) < 0.01

    # 12. токен, банк историй, /receiver
    print(jobs.run("token"))
    with session_scope() as db:
        service.add_fact(db, "Первый запуск принёс 2,4 млн выручки.", kind="story", source="story")
        assert db.scalar(select(StoryFact).where(StoryFact.source == "story"))
        r = service.add_receiver(db, "t.me/mychannel/42", "3 промпта для разбора самосаботажа")
        assert r.url == "https://t.me/mychannel/42" and r.clusters == [1, 2]
        assert service.receivers_for(db, 1, "самосаботаж")[0]["id"] == r.id

    # 13. HTTP: кроны n8n и API мини-аппы
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    assert client.post("/cron/funnel/plan", headers={"X-Cron-Secret": "wrong"}).status_code == 401
    assert client.post("/cron/funnel/nope", headers={"X-Cron-Secret": "s3cret"}).status_code == 404
    assert client.post("/cron/funnel/seed", headers={"X-Cron-Secret": "s3cret"}).status_code == 202
    data = client.get("/api/funnel/threads", params={"day": DAY.isoformat()}).json()
    assert len(data) >= 3 and "{link}" not in json.dumps(data, ensure_ascii=False)
    assert client.get("/api/funnel/weights").status_code == 200

    # 14. бот: обработчики регистрируются в Application
    from telegram.ext import Application

    from app.bot import funnel_bot

    tg_app = Application.builder().token("123:test").build()
    funnel_bot.register(tg_app)
    assert len(tg_app.handlers[0]) == 9

    # 15. этап 1 (публикуете сами) + остальные кнопки + слой бота
    stage1(later + timedelta(days=1))

    print(f"\nLLM calls: {len(LLM_CALLS)} · Telegram calls: {len(TG_CALLS)}")
    print("funnel smoke OK")


def stage1(day: date) -> None:
    import asyncio
    from types import SimpleNamespace

    from app.bot import funnel_bot

    settings.funnel_autopublish = False
    jobs.run("generate", day=day)
    with session_scope() as db:
        a, b, c = [t.id for t in service.day_threads(db, day)]
        assert "Ответьте на карточку фото" in service.materials_prompt(db, a)
        print(service.weave_story(db, a, "В 2019 я 3 месяца вёл таблицу привычек вручную."))
        assert db.scalar(select(StoryFact).where(StoryFact.text.like("В 2019%")))
        when = at(day, 18, 30)
        assert "перенесена" in service.move_slot(db, c, when)
        assert db.get(FunnelThread, c).slot_at == when
        r = service.draft_receiver_for(db, db.get(FunnelThread, b)).id   # агент пишет новый приёмник
        print(service.edit_receiver(db, r, "добавь чек-лист"))
        print(service.reject_receiver(db, r))
        assert db.get(FunnelThread, b).receiver_id is None
        assert "Приёмник в канале есть" in [x["name"] for x in db.get(FunnelThread, b).qa["checks"] if not x["ok"]]
        print(service.skip_thread(db, b))
        print(service.approve(db, a))

    # Бот: кнопка ✅ и правка ответом на карточку — на фейковых апдейтах.
    replies: list[str] = []

    async def reply_text(text, **kw):
        replies.append(text)

    def update_for(user_id: int, data: str | None = None, reply_to: int | None = None, text_: str | None = None):
        msg = SimpleNamespace(reply_text=reply_text, text=text_, caption=None, photo=None, voice=None, audio=None,
                              reply_to_message=SimpleNamespace(message_id=reply_to) if reply_to else None)

        async def answer(*a, **kw):
            pass

        q = SimpleNamespace(data=data, message=msg, answer=answer) if data else None
        return SimpleNamespace(effective_user=SimpleNamespace(id=user_id), callback_query=q,
                               effective_message=msg, effective_chat=SimpleNamespace(id=settings.funnel_chat_id))

    ctx = SimpleNamespace(bot_data={}, args=[])
    asyncio.run(funnel_bot.on_callback(update_for(42, f"f:ok:{c}"), ctx))     # чужой — нет доступа
    with session_scope() as db:
        assert db.get(FunnelThread, c).status == "draft"
        card = db.get(FunnelThread, c).card_message_ids[-1]
    asyncio.run(funnel_bot.on_callback(update_for(1, f"f:ok:{c}"), ctx))
    with session_scope() as db:
        assert db.get(FunnelThread, c).status == "approved"
    asyncio.run(funnel_bot.on_message(update_for(1, reply_to=card, text_="пост 2: Своя версия второго поста."), ctx))
    with session_scope() as db:
        t = db.get(FunnelThread, c)
        assert t.posts[0] == "Своя версия второго поста." and t.status == "draft", (t.posts[0], t.status)
    asyncio.run(funnel_bot.on_callback(update_for(1, f"f:ed:{c}"), ctx))
    asyncio.run(funnel_bot.on_message(update_for(1, text_="короче"), ctx))   # без ответа — по ожидающей правке
    assert any("Правлю ветку" in r for r in replies) and any("сократил" in r for r in replies), replies
    ctx.args = ["Мой", "первый", "клиент", "заплатил", "50К."]
    asyncio.run(funnel_bot.cmd_story(update_for(1), ctx))
    assert any("банк историй" in r for r in replies)

    # Этап 1: в слот бот присылает посты по одному, без HTML-разметки.
    TG_CALLS.clear()
    res = jobs.run("publish", now=at(day, 10, 1))
    assert res["due"][a] == "handed", res
    assert all(v == "missed" for k, v in res["due"].items() if k != a), res   # старые без ✅ — мимо
    sent = [p for m, p in TG_CALLS if m == "sendMessage"]
    plain = [p for p in sent if p.get("parse_mode") is None]
    with session_scope() as db:
        t = db.get(FunnelThread, a)
        assert t.status == "handed" and len(plain) == len(t.posts) + 1
        assert plain[0]["text"].startswith("ЗА 35 МИНУТ") and t.link_url in plain[-1]["text"]
        fc = FunnelComment(thread_id=t.id, comment_id="manual-1", author="x", text="?", draft="!", status="draft")
        db.add(fc)
        db.flush()
        try:
            service.publish_comment(db, fc.id)
            raise AssertionError("в этапе 1 ответы не публикуются")
        except service.FunnelError:
            pass
    print("stage 1 + bot OK")


if __name__ == "__main__":
    main()
