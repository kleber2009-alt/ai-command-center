"""Оркестрация воронки Threads → Telegram.

День системы: 06:00 метрики и оценка через 48 ч → 06:30 план (темы на слоты) →
07:00 генерация веток и карточки в тему «Threads» → ваши ✅ / правки → выход по
слотам (10/13/18 МСК) → комментарии первые 2 часа → через 48 ч цифры и решение
о перевыпуске → по понедельникам отчёт и новые веса кластеров.

Функции принимают Session и только flush-ат; транзакциями владеют вызывающие
(jobs, бот). Исключение — publish_thread: статус «publishing» коммитится ДО
вызова Threads API, чтобы сбой процесса не привёл к повторной публикации.

Жёсткий гейт: без ✅ ветка не публикуется (кроме FUNNEL_UNANSWERED=publish).
"""
from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, object_session

from app.config import settings
from app.core.security import decrypt_token, encrypt_token
from app.funnel import agents, cards, qa, recycle, schedule
from app.funnel import telegram_api as tg
from app.models.account import Account
from app.models.competitor import Competitor
from app.models.funnel import (
    ChannelJoin,
    FunnelComment,
    FunnelReceiver,
    FunnelState,
    FunnelThread,
    StoryFact,
)
from app.models.viral_post import ViralPost

log = logging.getLogger("funnel")

PENDING = ("planned", "generating", "draft", "approved", "publishing")
DONE = ("published", "handed")
GRACE = timedelta(hours=3)            # опоздание крона, после которого слот считается пропущенным
MATERIALS_DEADLINE = timedelta(hours=1)
LINK_DISPLAY = "[ссылка в канал]"
MAX_COMMENTS_PER_RUN = 20

# Подтверждённые факты автора из брифа — стартовое наполнение банка (jobs seed).
SEED_FACTS = [
    "Аудитория автора — около 300K подписчиков.",
    "На контент-план у автора уходит около 15 минут в неделю.",
    "За 3 года у автора около 5 живых рилсов.",
]


class FunnelError(RuntimeError):
    """Понятная пользователю причина, почему действие не выполнено."""


# ════════════════════════════════════════════════════════════════════════════
#  Общие помощники
# ════════════════════════════════════════════════════════════════════════════
def tz() -> ZoneInfo:
    return ZoneInfo(settings.funnel_tz)


def slots() -> list:
    return schedule.parse_slots(settings.funnel_slots)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def local_today(now: datetime | None = None) -> date:
    return (now or now_utc()).astimezone(tz()).date()


def get_state(db: Session, key: str, default=None):
    row = db.get(FunnelState, key)
    return row.value if row is not None else default


def set_state(db: Session, key: str, value) -> None:
    row = db.get(FunnelState, key)
    if row is None:
        db.add(FunnelState(key=key, value=value))
    else:
        row.value = value
    db.flush()


def cluster_weights(db: Session) -> dict[int, float]:
    raw = get_state(db, "cluster_weights")
    if not raw:
        return schedule.default_weights()
    return {int(k): float(v) for k, v in raw.items()}


def start_date(db: Session) -> date | None:
    if settings.funnel_start_date:
        return date.fromisoformat(settings.funnel_start_date)
    return db.scalar(select(func.min(FunnelThread.plan_date)))


def funnel_account(db: Session) -> Account | None:
    if settings.funnel_account_id:
        return db.get(Account, settings.funnel_account_id)
    return db.scalar(select(Account).where(Account.status != "paused").order_by(Account.id))


def threads_api(db: Session):
    from app.funnel.threads_api import ThreadsAPI

    acc = funnel_account(db)
    if acc is None:
        raise FunnelError("Нет аккаунта Threads: добавьте его в мини-аппе (Аккаунты) с токеном.")
    token = decrypt_token(acc.access_token or "")
    if not token or not acc.threads_user_id:
        raise FunnelError(f"У аккаунта {acc.handle} нет threads_user_id / токена.")
    return acc, ThreadsAPI(access_token=token, user_id=acc.threads_user_id)


def _embed(text: str) -> list[float] | None:
    try:
        from app.core.llm import embed

        vec = embed(text)
    except Exception:  # noqa: BLE001 — без эмбеддингов работаем лексически
        return None
    return vec if vec and len(vec) == settings.embedding_dim else None


def _similarity(query: str, query_vec, text: str, vec) -> float:
    from app.services.rewrite_service import cosine, text_similarity

    if query_vec is not None and vec is not None:
        return cosine(list(query_vec), list(vec))
    return text_similarity(query, text)


def get_thread(db: Session, thread_id: int) -> FunnelThread:
    t = db.get(FunnelThread, thread_id)
    if t is None:
        raise FunnelError(f"Ветка №{thread_id} не найдена.")
    return t


def target() -> tg.Target:
    return tg.funnel_target()


def notify(text: str, reply_to: int | None = None, html: bool = True) -> None:
    try:
        tg.send_message(target(), text, reply_to=reply_to, html=html)
    except tg.TelegramError:
        log.exception("telegram notify failed")


def _card_anchor(t: FunnelThread) -> int | None:
    return (t.card_message_ids or [None])[-1]


# ════════════════════════════════════════════════════════════════════════════
#  Банк фактов, приёмники, доноры
# ════════════════════════════════════════════════════════════════════════════
def add_fact(db: Session, text: str, kind: str = "fact", source: str = "manual") -> StoryFact:
    text = text.strip()
    if not text:
        raise FunnelError("Пустой факт.")
    row = StoryFact(kind=kind, text=text, source=source, verified=True, embedding=_embed(text))
    db.add(row)
    db.flush()
    return row


def facts_texts(db: Session, query: str | None = None, limit: int = 40) -> list[str]:
    rows = db.scalars(select(StoryFact).where(StoryFact.verified.is_(True)).order_by(StoryFact.id)).all()
    if not query or len(rows) <= limit:
        return [r.text for r in rows]
    qv = _embed(query)
    ranked = sorted(rows, key=lambda r: _similarity(query, qv, r.text, r.embedding), reverse=True)
    return [r.text for r in ranked[:limit]]


def receiver_dict(r: FunnelReceiver) -> dict:
    return {"id": r.id, "title": r.title, "contents": r.contents, "kind": r.kind,
            "clusters": r.clusters or [], "url": r.url, "status": r.status}


def receivers_for(db: Session, cluster: int, topic: str, limit: int = 5) -> list[dict]:
    rows = db.scalars(select(FunnelReceiver).where(FunnelReceiver.status == "active")).all()
    fit = [r for r in rows if not r.clusters or cluster in r.clusters]
    qv = _embed(topic or "")
    fit.sort(key=lambda r: (_similarity(topic or "", qv, f"{r.title} {r.contents or ''}", r.embedding),
                            r.created_at or datetime.min.replace(tzinfo=timezone.utc)), reverse=True)
    return [receiver_dict(r) for r in fit[:limit]]


def donor_handles() -> list[str]:
    return [h.strip().lstrip("@").lower() for h in settings.funnel_donors.split(",") if h.strip()]


def donor_posts(db: Session, limit: int = 15) -> list[dict]:
    since = now_utc() - timedelta(days=21)
    handles = donor_handles()
    stmt = select(ViralPost).where(ViralPost.published_at >= since)
    if handles:
        stmt = stmt.where(func.lower(ViralPost.author).in_(handles))
    rows = db.scalars(stmt.order_by(ViralPost.xn_score.desc().nullslast()).limit(limit)).all()
    return [{"text": (p.text or "")[:700], "likes": p.likes, "views": p.views,
             "xn": float(p.xn_score) if p.xn_score is not None else None} for p in rows]


# ── Исследование: что реально залетает (research.py) ─────────────────────────
def research_queries() -> list[str]:
    return [q.strip() for q in settings.funnel_research_queries.split(",") if q.strip()]


def run_research(db: Session) -> dict:
    """Сбор постов доноров и топа поиска за 30 дней → viral_posts(status='research') с xn."""
    from app.funnel import research

    donors = set(donor_handles())
    donors |= {c.username.lower() for c in db.scalars(select(Competitor).where(
        Competitor.platform == "threads", Competitor.is_active.is_(True))).all()}
    users = research.fresh(research.fetch_users(sorted(donors), 40)) if donors else []
    search = research.fresh(research.fetch_search(research_queries(), 25))
    scores = {**research.score_batch(users), **research.score_batch(search, group_by_author=False)}
    saved = 0
    for p in users + search:
        xn, med = scores.get(p.code, (0.0, 0.0))
        row = db.scalar(select(ViralPost).where(ViralPost.external_id == p.code))
        if row is None:
            row = ViralPost(source="threads", external_id=p.code, status="research")
            db.add(row)
            saved += 1
        elif row.status not in ("research",):
            continue                     # пост уже в другом конвейере — не трогаем
        row.author, row.url, row.published_at = p.author, p.url, p.published_at
        if "\n\n— " not in (row.text or ""):       # развёрнутую ветку не затираем одним хуком
            row.text = p.text
        row.likes, row.comments, row.reposts, row.views = p.likes, p.replies, p.reposts + p.shares, p.views
        row.author_median_views = med
        row.xn_score = xn
        row.category = research.category(xn)
    db.flush()
    # Лучшие посты разворачиваем в ветку целиком: агентам нужна структура, а не только хук.
    expanded = 0
    top = db.scalars(select(ViralPost).where(ViralPost.status == "research", ViralPost.xn_score >= research.PROVEN_XN)
                     .order_by(ViralPost.xn_score.desc()).limit(research.THREAD_EXPAND_TOP * 3)).all()
    for row in [r for r in top if "\n\n— " not in (r.text or "") and r.url][:research.THREAD_EXPAND_TOP]:
        try:
            body = research.fetch_thread_body(row.url)
        except Exception as e:  # noqa: BLE001 — без тела ветки хит всё равно полезен
            log.warning("thread body %s failed: %s", row.url, e)
            continue
        if len(body) > 1:
            row.text = "\n\n— ".join(body)
            expanded += 1
    db.flush()
    return {"donors": len(donors), "posts": len(users) + len(search), "new": saved, "expanded": expanded,
            "hits": len(research_hits(db, 100))}


def _research_row(p: ViralPost, n: int = 900) -> dict:
    return {"id": p.id, "author": p.author, "xn": float(p.xn_score or 0), "likes": p.likes, "replies": p.comments,
            "reposts_shares": p.reposts, "date": p.published_at.date().isoformat() if p.published_at else None,
            "text": (p.text or "")[:n], "url": p.url}


def research_hits(db: Session, limit: int = 25) -> list[dict]:
    from app.funnel.research import PROVEN_XN

    since = now_utc() - timedelta(days=30)
    rows = db.scalars(select(ViralPost).where(
        ViralPost.status == "research", ViralPost.xn_score >= PROVEN_XN,
        (ViralPost.published_at >= since) | ViralPost.published_at.is_(None),
    ).order_by(ViralPost.xn_score.desc()).limit(limit)).all()
    return [_research_row(p) for p in rows]


def research_text(db: Session, res: dict | None = None, limit: int = 5) -> str:
    """Сводка исследования для темы «Threads» и команды /top."""
    hits = research_hits(db, limit)
    head = "🔎 <b>Что залетает в Threads за 30 дней</b>"
    if res:
        head += (f"\nСобрано {res.get('posts', 0)} постов ({res.get('donors', 0)} доноров + поиск), "
                 f"хитов (xn ≥ 2): {res.get('hits', 0)}")
    if not hits:
        return head + "\nХитов пока нет — проверьте APIFY_TOKEN и список доноров (FUNNEL_DONORS)."
    lines = [head]
    for h in hits:
        first = (h["text"] or "").strip().splitlines()[0][:140] if h["text"] else ""
        lines.append(f"• xn {h['xn']:.1f} · {h['likes']} лайков · @{cards.esc(h['author'])}: {cards.esc(first)}"
                     + (f' <a href="{cards.esc(h["url"])}">→</a>' if h.get("url") else ""))
    return "\n".join(lines)


def research_flops(db: Session, limit: int = 8) -> list[dict]:
    since = now_utc() - timedelta(days=30)
    rows = db.scalars(select(ViralPost).where(
        ViralPost.status == "research", ViralPost.xn_score < 0.6, ViralPost.published_at >= since,
    ).order_by(ViralPost.xn_score.asc()).limit(limit)).all()
    return [_research_row(p, 300) for p in rows]


def own_history(db: Session, limit: int = 30) -> list[dict]:
    rows = db.scalars(select(FunnelThread).where(FunnelThread.status == "published",
                                                 FunnelThread.verdict.is_not(None))
                      .order_by(FunnelThread.published_at.desc()).limit(limit)).all()
    return [{"topic": t.topic, "cluster": t.cluster, "hook": qa.first_line(active_hook_text(t)),
             "forecast": ((t.qa or {}).get("forecast") or {}).get("score"), "verdict": t.verdict,
             "metrics": {k: (t.metrics or {}).get(k) for k in ("likes", "replies", "shares", "clicks", "joins")}}
            for t in rows]


def forecast(db: Session, t: FunnelThread) -> dict | None:
    """Прогноз виральности ветки 0–10 → t.qa['forecast']. None, если агент недоступен."""
    ids = set((t.qa or {}).get("evidence_ids") or [])
    hits = research_hits(db, 25)
    hits.sort(key=lambda h: h["id"] not in ids)          # опорные хиты темы — первыми
    try:
        res = agents.forecast_thread(
            {"topic": t.topic, "cluster": t.cluster, "template": t.template, "hypothesis": t.hypothesis,
             "posts": full_posts(t, LINK_DISPLAY)},
            hits=hits, flops=research_flops(db), history=own_history(db))
    except agents.AgentError as e:
        log.warning("forecast %s failed: %s", t.id, e)
        return None
    known = {h["id"]: h for h in hits}
    res["evidence"] = [{**e, **{k: known[e["id"]][k] for k in ("author", "xn", "likes", "url")}}
                       for e in res.get("evidence") or [] if e.get("id") in known]
    t.qa = {**(t.qa or {}), "forecast": res}
    db.flush()
    return res


def add_receiver(db: Session, url: str, description: str) -> FunnelReceiver:
    url = url.strip()
    if not re.match(r"^(https?://)?t\.me/", url):
        raise FunnelError("Нужна ссылка вида t.me/канал/123.")
    if not url.startswith("http"):
        url = "https://" + url
    meta = {"title": description[:80] or url, "kind": "other", "contents": description, "clusters": []}
    if description:
        try:
            meta = agents.classify_receiver(url, description)
        except agents.AgentError:
            log.warning("classify_receiver failed, сохраняем как есть")
    clusters = [c for c in meta.get("clusters") or [] if c in schedule.CLUSTERS]
    r = FunnelReceiver(url=url, title=meta.get("title") or url, contents=meta.get("contents") or description,
                       kind=meta.get("kind"), clusters=clusters, status="active", published_at=now_utc(),
                       embedding=_embed(f"{meta.get('title')} {meta.get('contents')}"))
    db.add(r)
    db.flush()
    return r


def seed(db: Session) -> dict:
    """Стартовое наполнение: факты из брифа и аккаунты-доноры в competitors (Apify)."""
    facts = 0
    if not db.scalar(select(func.count()).select_from(StoryFact)):
        for f in SEED_FACTS:
            add_fact(db, f, source="seed")
            facts += 1
    donors = 0
    for h in donor_handles():
        exists = db.scalar(select(Competitor).where(Competitor.platform == "threads",
                                                    func.lower(Competitor.username) == h))
        if exists is None:
            db.add(Competitor(platform="threads", username=h, profile_url=f"https://www.threads.net/@{h}",
                              niche="funnel-donor", is_active=True))
            donors += 1
    if get_state(db, "cluster_weights") is None:
        set_state(db, "cluster_weights", {str(k): v for k, v in schedule.default_weights().items()})
    db.flush()
    return {"facts_added": facts, "donors_added": donors, "receivers_added": seed_receivers(db)}


RECEIVERS_FILE = Path(__file__).resolve().parent / "data" / "receivers.json"


def seed_receivers(db: Session) -> int:
    """Библиотека приёмников = каталог бесплатных материалов канала (тот же, что у ИИ в Директе).
    Идемпотентно по ссылке; эмбеддинги не считаем (Voyage без оплаты — 3 запроса/мин)."""
    known = set(db.scalars(select(FunnelReceiver.url).where(FunnelReceiver.url.is_not(None))).all())
    added = 0
    for item in json.loads(RECEIVERS_FILE.read_text(encoding="utf-8")):
        if item["url"] in known:
            continue
        access = ("открывается только подписчикам основного канала" if item["channel"] == "main"
                  else "закрытый канал @ai_razbory, открывается по прямой ссылке")
        db.add(FunnelReceiver(
            url=item["url"], title=item["title"], kind=item["kind"], clusters=item["clusters"],
            contents=f"{item['contents']} Когда предлагать: {item['when']}. Доступ: {access}.",
            status="active", published_at=now_utc()))
        added += 1
    db.flush()
    return added


# ════════════════════════════════════════════════════════════════════════════
#  Представление ветки, проверка, ссылка, карточка
# ════════════════════════════════════════════════════════════════════════════
def active_hook_text(t: FunnelThread) -> str:
    hooks = t.hooks or []
    return hooks[t.active_hook]["text"] if 0 <= t.active_hook < len(hooks) else ""


def receiver_post_url(t: FunnelThread) -> str | None:
    """Ссылка на пост-приёмник для {post} (только у опубликованного приёмника)."""
    db = object_session(t)
    rec = db.get(FunnelReceiver, t.receiver_id) if (db is not None and t.receiver_id) else None
    return rec.url if rec is not None and rec.status == "active" else None


def full_posts(t: FunnelThread, placeholder: str | None = None) -> list[str]:
    return qa.render_posts(active_hook_text(t), list(t.posts or []), t.link_url, placeholder,
                           post=receiver_post_url(t))


def thread_view(db: Session, t: FunnelThread, note: str | None = None) -> dict:
    rec = db.get(FunnelReceiver, t.receiver_id) if t.receiver_id else None
    cl = schedule.CLUSTERS.get(t.cluster)
    return {
        "id": t.id, "version": t.version, "kind": t.kind, "reissue_no": t.reissue_no,
        "slot_label": schedule.fmt_slot(t.slot_at, tz()),
        "cluster": t.cluster, "cluster_name": cl.name if cl else "",
        "template": t.template, "template_name": schedule.TEMPLATE_NAMES.get(t.template, ""),
        "topic": t.topic, "hypothesis": t.hypothesis,
        "hooks": t.hooks or [], "active_hook": t.active_hook,
        "posts": full_posts(t, LINK_DISPLAY),
        "receiver": receiver_dict(rec) if rec else None, "receiver_brief": t.receiver_brief,
        "materials_request": t.materials_request, "materials_count": len(t.materials or []),
        "facts_needed": t.facts_needed or [], "qa": t.qa or {}, "status": t.status,
        "autopublish": settings.funnel_autopublish, "link_url": t.link_url,
        "permalink": t.permalink, "note": note,
        "media_hint": (t.qa or {}).get("media_hint"), "editor": (t.qa or {}).get("editor"),
        "forecast": (t.qa or {}).get("forecast"),
    }


def run_qa(db: Session, t: FunnelThread, check_link: bool = False) -> dict:
    rec = db.get(FunnelReceiver, t.receiver_id) if t.receiver_id else None
    live = tg.link_is_live(t.link_url) if (check_link and t.link_url) else None
    checks = qa.run_checks(active_hook_text(t), list(t.posts or []), link=t.link_url, post=receiver_post_url(t),
                           voice_level=settings.funnel_voice_level,
                           has_receiver=bool(rec and rec.status == "active"), link_live=live)
    result = qa.summarize(checks)
    for key in ("editor", "media_hint", "evidence_ids", "forecast"):   # заметки агентов переживают перепроверку
        if (t.qa or {}).get(key):
            result[key] = t.qa[key]
    t.qa = result
    db.flush()
    return result


def ensure_link(db: Session, t: FunnelThread) -> None:
    """Своя ссылка под ветку. Закрытый канал — ссылка-приглашение (бот считает по ней
    вступления); публичный — пост-приёмник. Пока ничего нет — общая ссылка на канал."""
    rec = db.get(FunnelReceiver, t.receiver_id) if t.receiver_id else None
    if settings.channel_mode == "public":
        if rec and rec.status == "active" and rec.url:
            t.link_url = rec.url
        elif not t.link_url:
            t.link_url = settings.channel_fallback_link or None
    elif settings.channel_id and not t.invite_link:
        try:
            t.invite_link = tg.create_invite_link(settings.channel_id, f"thr{t.id} {t.plan_date:%d.%m}")
            t.link_url = t.invite_link
        except tg.TelegramError as e:
            log.warning("invite link for thread %s failed: %s", t.id, e)
            t.link_url = t.link_url or settings.channel_fallback_link or None
    elif t.invite_link:
        t.link_url = t.invite_link
    elif not t.link_url:
        t.link_url = settings.channel_fallback_link or None
    db.flush()


def send_card(db: Session, t: FunnelThread, note: str | None = None) -> None:
    """Новая версия карточки; у старой кнопки меняются на «есть новая версия»."""
    if t.card_message_ids and t.card_chat_id:
        try:
            tg.edit_reply_markup(t.card_chat_id, t.card_message_ids[-1], cards.stale_keyboard(t.id))
        except tg.TelegramError:
            log.warning("не удалось погасить старую карточку ветки %s", t.id)
    t.version = (t.version or 0) + 1
    tgt = target()
    ids = tg.send_messages(tgt, cards.thread_card(thread_view(db, t, note)), cards.thread_keyboard(t.id))
    t.card_chat_id = tgt.chat_id
    t.card_message_ids = ids
    db.flush()


def refresh_card(db: Session, t: FunnelThread) -> None:
    """Обновить карточку на месте (статус, ссылка), если число сообщений не изменилось."""
    if not t.card_message_ids or not t.card_chat_id:
        return
    chunks = cards.thread_card(thread_view(db, t))
    if len(chunks) != len(t.card_message_ids):
        return
    # В запасе кнопки остаются: позднее ✅ возвращает ветку в ближайший прогон.
    keyboard = cards.thread_keyboard(t.id) if t.status in ("draft", "approved", "failed", "reserve") else None
    try:
        tg.edit_message_text(t.card_chat_id, t.card_message_ids[-1], chunks[-1], keyboard)
        if len(chunks) > 1:
            for mid, text in zip(t.card_message_ids[:-1], chunks[:-1]):
                tg.edit_message_text(t.card_chat_id, mid, text)
    except tg.TelegramError:
        log.warning("refresh_card %s failed", t.id)


def find_by_message(db: Session, message_id: int):
    """Чья карточка: ('thread'|'receiver'|'comment', объект) или (None, None)."""
    t = db.scalar(select(FunnelThread).where(FunnelThread.card_message_ids.contains([message_id]))
                  .order_by(FunnelThread.id.desc()))
    if t is not None:
        return "thread", t
    r = db.scalar(select(FunnelReceiver).where(FunnelReceiver.card_message_ids.contains([message_id])))
    if r is not None:
        return "receiver", r
    c = db.scalar(select(FunnelComment).where(FunnelComment.card_message_id == message_id))
    if c is not None:
        return "comment", c
    return None, None


# ════════════════════════════════════════════════════════════════════════════
#  План дня
# ════════════════════════════════════════════════════════════════════════════
def day_threads(db: Session, day: date) -> list[FunnelThread]:
    return db.scalars(
        select(FunnelThread).where(FunnelThread.plan_date == day,
                                   FunnelThread.status.notin_(("replaced",)))
        .order_by(FunnelThread.slot_at, FunnelThread.id)
    ).all()


def _family(db: Session, root: FunnelThread) -> list[FunnelThread]:
    return db.scalars(
        select(FunnelThread).where((FunnelThread.id == root.id) | (FunnelThread.parent_id == root.id))
        .order_by(FunnelThread.slot_at, FunnelThread.id)
    ).all()


def reissue_candidates(db: Session, day: date) -> list[tuple[FunnelThread, list[FunnelThread], bool]]:
    """Тела, которые пора вернуть: (первый выпуск, выпуски, возврат из архива)."""
    roots = db.scalars(select(FunnelThread).where(FunnelThread.kind == "new",
                                                  FunnelThread.status.in_(DONE),
                                                  FunnelThread.verdict.is_not(None))).all()
    out = []
    for root in roots:
        family = _family(db, root)
        if any(r.status in PENDING for r in family):
            continue
        releases = [r for r in family if r.status == "published" and r.published_at]
        if not releases or any(r.verdict is None for r in releases):
            continue
        from_archive = False
        if root.archived_until:
            if root.archived_until > day:
                continue
            from_archive = True
        elif recycle.family_decision([r.verdict for r in releases]) != "reissue":
            continue
        last = releases[-1].published_at.astimezone(tz()).date()
        if recycle.reissue_window(last, day) == "early":
            continue
        won = any(r.verdict == "winner" for r in releases)
        eng = (releases[-1].metrics or {}).get("shares", 0) + (releases[-1].metrics or {}).get("replies", 0)
        out.append((won, eng, root, releases, from_archive))
    out.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return [(root, releases, fa) for _, _, root, releases, fa in out]


def _make_reissue(db: Session, root: FunnelThread, releases: list[FunnelThread], slot_at: datetime,
                  from_archive: bool) -> FunnelThread:
    last = releases[-1]
    hooks = [dict(h) for h in (root.hooks or [])]
    used = {r.active_hook for r in releases}
    avail = [i for i in range(len(hooks)) if i not in used]
    if from_archive or not avail:
        fresh = agents.fresh_hooks(
            {"topic": root.topic, "template": root.template, "posts": last.posts},
            [h["text"] for h in hooks], facts=facts_texts(db, root.topic),
            voice_level=settings.funnel_voice_level)
        start = len(hooks)
        hooks.extend(dict(h) for h in fresh)
        avail = list(range(start, len(hooks)))
        root.hooks = hooks
        root.archived_until = None
    last_mech = (hooks[last.active_hook].get("mechanic") if last.active_hook < len(hooks) else "") or ""
    pick = next((i for i in avail if hooks[i].get("mechanic") != last_mech), avail[0])
    t = FunnelThread(
        account_id=root.account_id, plan_date=slot_at.astimezone(tz()).date(), slot_at=slot_at,
        cluster=root.cluster, template=root.template, topic=root.topic,
        hypothesis=f"перевыпуск: хук «{hooks[pick].get('mechanic')}» вместо «{last_mech}»",
        kind="reissue", parent_id=root.id, reissue_no=len(releases),
        hooks=hooks, active_hook=pick, posts=list(last.posts or []), mid_index=last.mid_index,
        receiver_brief=root.receiver_brief, materials_request=root.materials_request,
        materials=list(root.materials or []), facts_needed=[], status="planned",
    )
    db.add(t)
    db.flush()
    return t


def plan_day(db: Session, day: date) -> list[FunnelThread]:
    """Темы на слоты дня. Идемпотентно: если план есть — возвращает его."""
    existing = day_threads(db, day)
    if existing:
        return existing
    tzinfo = tz()
    slot_dts = schedule.slot_datetimes(day, slots(), tzinfo)
    acc = funnel_account(db)
    n_re = schedule.reissue_quota(day, start_date(db) or day, len(slot_dts))
    candidates = reissue_candidates(db, day)[:n_re] if n_re else []

    # Перевыпуски — в середину дня, потом вечер, потом утро.
    order = [1, 2, 0] + list(range(3, len(slot_dts)))
    order = [i for i in order if i < len(slot_dts)]
    re_slots = order[: len(candidates)]
    created: list[FunnelThread] = []
    for idx, (root, releases, from_archive) in zip(re_slots, candidates):
        created.append(_make_reissue(db, root, releases, slot_dts[idx], from_archive))

    new_idx = [i for i in range(len(slot_dts)) if i not in re_slots]
    if new_idx:
        exclude = tuple(t.cluster for t in created)
        clusters = schedule.pick_clusters(cluster_weights(db), len(new_idx), exclude=exclude, seed=day.isoformat())
        spec = []
        for i, c in zip(new_idx, clusters):
            spec.append({"slot": i, "time": f"{slot_dts[i].astimezone(tzinfo):%H:%M}", "cluster": c,
                         "cluster_name": schedule.CLUSTERS[c].name,
                         "template": schedule.pick_template(c, seed=f"{day}-{i}")})
        recent = db.scalars(select(FunnelThread.topic).where(
            FunnelThread.plan_date >= day - timedelta(days=14), FunnelThread.status.in_(DONE + PENDING))).all()
        reserve_rows = db.scalars(select(FunnelThread).where(FunnelThread.status == "reserve")
                                  .order_by(FunnelThread.id.desc()).limit(10)).all()
        reserve = [{"id": r.id, "topic": r.topic, "cluster": r.cluster} for r in reserve_rows]
        topics = agents.plan_topics(
            day.isoformat(), spec, recent_topics=[t for t in recent if t], reserve=reserve,
            donor_posts=research_hits(db), receivers=[receiver_dict(r) for r in db.scalars(
                select(FunnelReceiver).where(FunnelReceiver.status == "active")).all()],
            facts=facts_texts(db))
        by_slot = {int(x.get("slot", -1)): x for x in topics}
        reserve_ids = {r.id: r for r in reserve_rows}
        for s in spec:
            got = by_slot.get(s["slot"]) or {}
            rid = int(got.get("reserve_id") or 0)
            if rid in reserve_ids:
                reserve_ids[rid].status = "replaced"     # тема ушла из запаса в план
            t = FunnelThread(
                account_id=acc.id if acc else None, plan_date=day, slot_at=slot_dts[s["slot"]],
                cluster=s["cluster"], template=s["template"],
                topic=got.get("topic") or f"[тема не предложена] {s['cluster_name']}",
                hypothesis=got.get("hypothesis") or "", kind="new", status="planned",
                qa={"evidence_ids": [int(x) for x in got.get("evidence") or []][:3]},
            )
            db.add(t)
            created.append(t)
    db.flush()
    return sorted(created, key=lambda t: t.slot_at)


def plan_text(db: Session, day: date, threads: list[FunnelThread]) -> str:
    lines = [f"🗓 <b>План на {day:%d.%m}</b>"]
    for t in threads:
        kind = f"перевыпуск №{t.reissue_no}" if t.kind == "reissue" else "новая"
        lines.append(f"• {t.slot_at.astimezone(tz()):%H:%M} · кл. {t.cluster} · {t.template} · {kind} — "
                     f"{cards.esc(t.topic)}")
    return "\n".join(lines)


# ════════════════════════════════════════════════════════════════════════════
#  Генерация ветки
# ════════════════════════════════════════════════════════════════════════════
def _thread_payload(t: FunnelThread) -> dict:
    return {"topic": t.topic, "cluster": t.cluster, "template": t.template,
            "hooks": t.hooks or [], "posts": t.posts or [], "mid_index": t.mid_index,
            "facts_needed": t.facts_needed or [], "materials_request": t.materials_request}


def _apply_review(t: FunnelThread, rev: dict) -> None:
    hooks = rev.get("hooks") or []
    if len(hooks) == len(t.hooks or []):
        t.hooks = [dict(h) for h in hooks]
    if rev.get("posts"):
        t.posts = list(rev["posts"])
    t.mid_index = rev.get("mid_index") or t.mid_index
    t.facts_needed = list(rev.get("facts_needed") or [])
    t.qa = {**(t.qa or {}), "editor": rev.get("report") or ""}


def _shorten_if_needed(db: Session, t: FunnelThread, result: dict) -> dict:
    long = [c for c in result["checks"] if c["name"].startswith("Каждый пост") and not c["ok"]]
    if not long:
        return result
    res = agents.edit_thread(
        {"hook": active_hook_text(t), "posts": t.posts, "facts_needed": t.facts_needed},
        f"Сократи посты до 480 символов с учётом ссылки ~40 символов ({long[0]['note']}). Смысл и ссылки сохрани.",
        facts=facts_texts(db, t.topic), voice_level=settings.funnel_voice_level)
    _apply_edit_result(t, res)
    return run_qa(db, t)


def _apply_edit_result(t: FunnelThread, res: dict) -> None:
    hooks = [dict(h) for h in (t.hooks or [])]
    if res.get("hook") and 0 <= t.active_hook < len(hooks):
        hooks[t.active_hook]["text"] = res["hook"]
    t.hooks = hooks
    if res.get("posts"):
        t.posts = list(res["posts"])
    t.facts_needed = list(res.get("facts_needed") or [])


def draft_receiver_for(db: Session, t: FunnelThread) -> FunnelReceiver:
    data = agents.draft_receiver(_thread_payload(t) | {"posts": full_posts(t, LINK_DISPLAY)},
                                 t.receiver_brief or "", facts=facts_texts(db, t.topic))
    clusters = [c for c in data.get("clusters") or [] if c in schedule.CLUSTERS] or [t.cluster]
    r = FunnelReceiver(title=data.get("title") or (t.topic or "")[:80], contents=data.get("contents"),
                       kind=data.get("kind"), clusters=clusters, text=data.get("text"), status="draft",
                       for_thread_id=t.id)
    db.add(r)
    db.flush()
    t.receiver_id = r.id
    send_receiver_card(db, r)
    return r


def send_receiver_card(db: Session, r: FunnelReceiver) -> None:
    ids = tg.send_messages(target(), cards.receiver_card({
        "id": r.id, "for_thread_id": r.for_thread_id, "title": r.title, "kind": r.kind,
        "contents": r.contents, "text": r.text}), cards.receiver_keyboard(r.id))
    r.card_message_ids = ids
    db.flush()


def generate_thread(db: Session, t: FunnelThread) -> FunnelThread:
    """planned → draft: текст (новая) или подготовка перевыпуска, приёмник, ссылка,
    проверка, карточка."""
    if t.status not in ("planned", "gen_failed"):
        return t
    t.status = "generating"
    db.flush()
    facts = facts_texts(db, t.topic)
    voice = settings.funnel_voice_level
    recs = receivers_for(db, t.cluster, t.topic or "")
    if t.kind == "new":
        cl = schedule.CLUSTERS[t.cluster]
        ids = set((t.qa or {}).get("evidence_ids") or [])
        spec = {"topic": t.topic, "hypothesis": t.hypothesis, "cluster": t.cluster, "cluster_name": cl.name,
                "template": t.template, "template_name": schedule.TEMPLATE_NAMES.get(t.template),
                "proven_hits_to_mirror": [h for h in research_hits(db, 50) if h["id"] in ids]}
        res = agents.write_thread(spec, facts=facts, receivers=recs, voice_level=voice)
        t.hooks = [dict(h) for h in (res.get("hooks") or [])][:6]
        t.active_hook = 0
        t.posts = list(res.get("posts") or [])
        t.mid_index = res.get("mid_index") or None
        t.materials_request = (res.get("materials_request") or "").strip() or None
        t.facts_needed = list(res.get("facts_needed") or [])
        rid = int(res.get("receiver_id") or 0)
        t.receiver_id = rid if rid in {r["id"] for r in recs} else None
        t.receiver_brief = (res.get("receiver_brief") or "").strip() or None
        if res.get("media_hint"):
            t.qa = {**(t.qa or {}), "media_hint": res["media_hint"]}
        if not t.hooks or not t.posts:
            raise agents.AgentError("агент вернул пустую ветку")
        rec = db.get(FunnelReceiver, t.receiver_id) if t.receiver_id else None
        rev = agents.review_thread(_thread_payload(t), facts=facts,
                                   receiver=receiver_dict(rec) if rec else None, voice_level=voice,
                                   donor_texts=[h["text"] for h in research_hits(db, 8)])
        _apply_review(t, rev)
    else:
        t.receiver_id = recs[0]["id"] if recs else None   # свежий приёмник под перевыпуск
    db.flush()
    ensure_link(db, t)
    result = run_qa(db, t, check_link=True)
    try:
        _shorten_if_needed(db, t, result)
    except agents.AgentError as e:   # останется ⛔ в проверке — автор сократит правкой
        log.warning("shorten %s failed: %s", t.id, e)
    fc = forecast(db, t)
    if fc and fc["score"] < settings.funnel_min_score and t.kind == "new" and fc.get("boost"):
        # Слабую ветку агент один раз дорабатывает по главной подсказке аналитика.
        try:
            before = (list(t.posts), [dict(h) for h in t.hooks])
            _apply_edit_result(t, agents.edit_thread(
                {"topic": t.topic, "hook": active_hook_text(t), "posts": t.posts, "facts_needed": t.facts_needed},
                f"Подними виральность ветки (сейчас {fc['score']}/10): {fc['boost']}",
                facts=facts, voice_level=voice))
            run_qa(db, t)
            fc2 = forecast(db, t)
            if fc2 is None or fc2["score"] < fc["score"] or not t.qa.get("passed", True):
                t.posts, t.hooks = before                # доработка не помогла — оставляем первую версию
                t.qa = {**t.qa, "forecast": fc}
                run_qa(db, t)
        except agents.AgentError as e:
            log.warning("boost %s failed: %s", t.id, e)
    t.status = "draft"
    t.error = None
    db.flush()
    if t.receiver_id is None:
        try:
            draft_receiver_for(db, t)
        except agents.AgentError as e:
            log.warning("receiver draft for %s failed: %s", t.id, e)
    send_card(db, t)
    return t


def mark_generation_failed(db: Session, thread_id: int, err: str) -> None:
    t = db.get(FunnelThread, thread_id)
    if t is None:
        return
    t.status = "gen_failed"
    t.error = err[:1000]
    db.flush()
    notify(f"⚠️ Ветка на {schedule.fmt_slot(t.slot_at, tz())} не сгенерирована: {cards.esc(err[:300])}\n"
           "Повторю при следующем запуске генерации.")


# ════════════════════════════════════════════════════════════════════════════
#  Кнопки карточки
# ════════════════════════════════════════════════════════════════════════════
def approve(db: Session, thread_id: int) -> str:
    t = get_thread(db, thread_id)
    if t.status in ("published", "publishing", "handed"):
        return f"Ветка №{t.id} уже ушла в публикацию."
    if t.status not in ("draft", "approved", "failed", "reserve"):
        return f"Ветка №{t.id} в статусе «{t.status}» — одобрить нельзя."
    blockers = qa.blocking(t.qa)
    if blockers:
        return "⛔ Нельзя одобрить: " + "; ".join(blockers)
    if t.status in ("failed", "reserve"):   # повтор после сбоя или позднее ✅: как можно скорее
        t.slot_at = max(t.slot_at, now_utc())
        t.plan_date = t.slot_at.astimezone(tz()).date()
        db.flush()
    res = db.execute(update(FunnelThread).where(FunnelThread.id == t.id,
                                                FunnelThread.status.in_(("draft", "failed", "reserve")))
                     .values(status="approved"))
    db.refresh(t)
    if res.rowcount == 0:
        return f"Ветка №{t.id} уже одобрена — {schedule.fmt_slot(t.slot_at, tz())}."
    refresh_card(db, t)
    when = schedule.fmt_slot(t.slot_at, tz())
    msg = (f"✅ Ветка №{t.id} в очереди — выйдет {when}." if settings.funnel_autopublish
           else f"✅ Ветка №{t.id} одобрена — {when} пришлю посты для публикации.")
    rec = db.get(FunnelReceiver, t.receiver_id) if t.receiver_id else None
    if rec is not None and rec.status != "active":
        msg += " Приёмник ещё черновик — одобрите его карточку."
    return msg


def _direct_post_edit(text: str, n_posts: int) -> tuple[int, str] | None:
    """«пост 3: текст» / «3/9: текст» / «3) текст» → (3, текст)."""
    m = re.match(r"^\s*(?:пост\s*)?(\d{1,2})\s*(?:/\s*\d{1,2})?\s*[:.)—–-]\s*(.+)$", text, re.S | re.I)
    if not m:
        return None
    n = int(m.group(1))
    return (n, m.group(2).strip()) if 1 <= n <= n_posts else None


def apply_edit(db: Session, thread_id: int, text: str) -> str:
    t = get_thread(db, thread_id)
    if t.status in ("published", "publishing", "handed"):
        return f"Ветка №{t.id} уже вышла — правка не применится."
    if t.status in ("planned", "generating", "gen_failed"):
        return f"Ветка №{t.id} ещё генерируется."
    n = 1 + len(t.posts or [])
    direct = _direct_post_edit(text, n)
    if direct:
        num, body = direct
        if num == 1:
            hooks = [dict(h) for h in t.hooks]
            hooks[t.active_hook]["text"] = body
            t.hooks = hooks
        else:
            posts = list(t.posts)
            # Своя версия без ссылки там, где она была, — ссылку возвращаем в конец.
            if qa.LINK in posts[num - 2] and qa.LINK not in body:
                body = f"{body}\n{qa.LINK}"
            posts[num - 2] = body
            t.posts = posts
        summary = f"пост {num} заменён вашей версией"
    else:
        had_questions = bool(t.facts_needed)
        res = agents.edit_thread(
            {"topic": t.topic, "hook": active_hook_text(t), "posts": t.posts, "facts_needed": t.facts_needed},
            text, facts=facts_texts(db, t.topic), voice_level=settings.funnel_voice_level)
        _apply_edit_result(t, res)
        summary = res.get("summary") or "правка применена"
        if had_questions and re.search(r"\d", text):
            add_fact(db, text, kind="fact", source="card")   # ответ автора про цифры — в банк
    t.status = "draft"
    run_qa(db, t)
    forecast(db, t)
    send_card(db, t, note=f"Правка: {summary}. Новая версия — нужен ✅")
    return f"✏️ Ветка №{t.id}: {summary}."


def weave_story(db: Session, thread_id: int, story: str) -> str:
    add_fact(db, story, kind="story", source="card")
    return apply_edit(db, thread_id, f"Вплети в ветку историю автора (его словами, без приукрашивания):\n{story}")


def swap_hook(db: Session, thread_id: int, idx: int) -> str:
    t = get_thread(db, thread_id)
    if t.status not in ("draft", "approved", "failed"):
        return f"Ветка №{t.id} в статусе «{t.status}» — хук не поменять."
    if not 0 <= idx < len(t.hooks or []):
        return "Нет такого хука."
    t.active_hook = idx
    t.status = "draft"
    run_qa(db, t)
    forecast(db, t)
    send_card(db, t, note=f"Хук {idx + 1} ({t.hooks[idx].get('mechanic', '')}). Нужен ✅")
    return f"🔄 Ветка №{t.id}: хук {idx + 1}."


def replace_thread(db: Session, thread_id: int) -> FunnelThread:
    """♻️ Другая: новая ветка в тот же слот из другого кластера; старая — в запас."""
    old = get_thread(db, thread_id)
    if old.status not in ("draft", "approved", "failed", "gen_failed"):
        raise FunnelError(f"Ветка №{old.id} в статусе «{old.status}» — заменить нельзя.")
    old.status = "reserve"
    if old.card_message_ids and old.card_chat_id:
        try:
            tg.edit_reply_markup(old.card_chat_id, old.card_message_ids[-1],
                                 cards.stale_keyboard(old.id, "♻️ Заменена — тема в запасе"))
        except tg.TelegramError:
            pass
    busy = tuple(t.cluster for t in day_threads(db, old.plan_date))
    cluster = schedule.pick_clusters(cluster_weights(db), 1, exclude=busy + (old.cluster,),
                                     seed=f"{old.id}-{old.version}")[0]
    template = schedule.pick_template(cluster, seed=old.id)
    spec = [{"slot": 0, "time": f"{old.slot_at.astimezone(tz()):%H:%M}", "cluster": cluster,
             "cluster_name": schedule.CLUSTERS[cluster].name, "template": template}]
    recent = [t.topic for t in day_threads(db, old.plan_date) if t.topic]
    topics = agents.plan_topics(old.plan_date.isoformat(), spec, recent_topics=recent, reserve=[],
                                donor_posts=research_hits(db), receivers=[], facts=facts_texts(db))
    got = topics[0] if topics else {}
    new = FunnelThread(account_id=old.account_id, plan_date=old.plan_date, slot_at=old.slot_at,
                       cluster=cluster, template=template, topic=got.get("topic") or schedule.CLUSTERS[cluster].name,
                       hypothesis=got.get("hypothesis") or "", kind="new", status="planned")
    db.add(new)
    db.flush()
    return generate_thread(db, new)


def materials_prompt(db: Session, thread_id: int) -> str:
    t = get_thread(db, thread_id)
    need = t.materials_request or "картинка к посту 1 (результат работы промпта) или ваша история"
    got = len(t.materials or [])
    return (f"📎 Ветка №{t.id} — нужно: {need}.\n"
            f"Ответьте на карточку фото (прикреплю к посту 1, до 20 шт.) или голосом — вплету историю в текст."
            + (f"\nУже получено фото: {got}." if got else "")
            + f"\nСрок — за час до слота ({schedule.fmt_slot(t.slot_at - MATERIALS_DEADLINE, tz())}).")


def attach_photo(db: Session, thread_id: int, file_id: str) -> str:
    t = get_thread(db, thread_id)
    if t.status in ("published", "publishing", "handed"):
        return f"Ветка №{t.id} уже вышла."
    mats = list(t.materials or [])
    if len(mats) >= 20:
        return "В карусели максимум 20 картинок."
    mats.append({"type": "photo", "file_id": file_id})
    t.materials = mats
    t.materials_fallback = False
    db.flush()
    refresh_card(db, t)
    return f"📎 Фото прикреплено к посту 1 ветки №{t.id} (всего {len(mats)})."


def move_slot(db: Session, thread_id: int, when: datetime) -> str:
    t = get_thread(db, thread_id)
    if t.status not in ("draft", "approved", "failed"):
        return f"Ветка №{t.id} в статусе «{t.status}» — перенести нельзя."
    t.slot_at = when
    t.plan_date = when.astimezone(tz()).date()
    t.materials_fallback = False
    db.flush()
    refresh_card(db, t)
    return f"⏰ Ветка №{t.id} перенесена на {schedule.fmt_slot(when, tz())}."


def slot_options(db: Session, thread_id: int) -> list[tuple[str, int]]:
    t = get_thread(db, thread_id)
    choices = schedule.slot_choices(now_utc(), slots(), tz(), current=t.slot_at)
    return [(schedule.fmt_slot(c, tz()), int(c.timestamp() // 60)) for c in choices]


def skip_thread(db: Session, thread_id: int) -> str:
    t = get_thread(db, thread_id)
    if t.status not in ("planned", "draft", "approved", "failed", "gen_failed"):
        return f"Ветка №{t.id} в статусе «{t.status}» — пропустить нельзя."
    t.status = "reserve"
    db.flush()
    refresh_card(db, t)
    return (f"🗑 Ветка №{t.id}: слот {schedule.fmt_slot(t.slot_at, tz())} пустой, тема в запасе. "
            "Передумали — ✅ на карточке, выйдет при ближайшем прогоне.")


# ════════════════════════════════════════════════════════════════════════════
#  Приёмники: черновик агента → канал
# ════════════════════════════════════════════════════════════════════════════
def publish_receiver(db: Session, receiver_id: int) -> str:
    r = db.get(FunnelReceiver, receiver_id)
    if r is None:
        raise FunnelError("Приёмник не найден.")
    if r.status == "active":
        return f"Приёмник №{r.id} уже в канале: {r.url}"
    if not settings.channel_id:
        raise FunnelError("Канал не настроен (CHANNEL_ID). Опубликуйте текст сами и добавьте ссылку: "
                          "/receiver t.me/канал/123 описание")
    msg_id = tg.post_to_channel(settings.channel_id, r.text or r.title)
    r.channel_message_id = msg_id
    r.url = tg.channel_post_url(settings.channel_id, msg_id,
                                settings.channel_username if settings.channel_mode == "public" else "")
    r.status = "active"
    r.published_at = now_utc()
    r.embedding = _embed(f"{r.title} {r.contents or ''}")
    db.flush()
    if r.card_message_ids:
        try:
            tg.edit_reply_markup(target().chat_id, r.card_message_ids[-1], None)
        except tg.TelegramError:
            pass
    linked = db.scalars(select(FunnelThread).where(FunnelThread.receiver_id == r.id,
                                                   FunnelThread.status.in_(("draft", "approved", "failed")))).all()
    for t in linked:
        ensure_link(db, t)
        run_qa(db, t, check_link=True)
        refresh_card(db, t)
    nums = ", ".join(f"№{t.id}" for t in linked)
    return f"📥 Приёмник №{r.id} опубликован: {r.url}" + (f" — привязан к ветке {nums}." if nums else "")


def reject_receiver(db: Session, receiver_id: int) -> str:
    r = db.get(FunnelReceiver, receiver_id)
    if r is None:
        raise FunnelError("Приёмник не найден.")
    r.status = "rejected"
    for t in db.scalars(select(FunnelThread).where(FunnelThread.receiver_id == r.id,
                                                   FunnelThread.status.in_(PENDING + ("failed",)))).all():
        t.receiver_id = None
        run_qa(db, t)
        refresh_card(db, t)
    db.flush()
    return f"🗑 Черновик приёмника №{r.id} отклонён. Добавьте свой: /receiver t.me/канал/123 описание"


def edit_receiver(db: Session, receiver_id: int, instruction: str) -> str:
    r = db.get(FunnelReceiver, receiver_id)
    if r is None or r.status != "draft":
        raise FunnelError("Править можно только черновик приёмника.")
    data = agents.edit_receiver({"title": r.title, "kind": r.kind, "contents": r.contents,
                                 "clusters": r.clusters, "text": r.text}, instruction, facts=facts_texts(db))
    r.title = data.get("title") or r.title
    r.kind = data.get("kind") or r.kind
    r.contents = data.get("contents") or r.contents
    r.text = data.get("text") or r.text
    if r.card_message_ids:
        try:
            tg.edit_reply_markup(target().chat_id, r.card_message_ids[-1], None)
        except tg.TelegramError:
            pass
    send_receiver_card(db, r)
    return f"✏️ Приёмник №{r.id} переписан."


# ════════════════════════════════════════════════════════════════════════════
#  Слоты: материалы за час, публикация
# ════════════════════════════════════════════════════════════════════════════
def materials_deadline(db: Session, now: datetime) -> int:
    """За час до слота материалов нет → без картинки, хук без доказательства."""
    rows = db.scalars(select(FunnelThread).where(
        FunnelThread.status.in_(("draft", "approved")),
        FunnelThread.materials_request.is_not(None),
        FunnelThread.materials_fallback.is_(False),
        FunnelThread.slot_at <= now + MATERIALS_DEADLINE,
        FunnelThread.slot_at > now,
    )).all()
    n = 0
    for t in rows:
        if t.materials:
            continue
        t.materials_fallback = True
        hooks = t.hooks or []
        note = f"📎 Материалы к ветке №{t.id} не пришли — выйдет без картинки"
        if hooks and hooks[t.active_hook].get("needs_proof"):
            alt = next((i for i, h in enumerate(hooks) if not h.get("needs_proof") and i != t.active_hook), None)
            if alt is not None:
                t.active_hook = alt
                run_qa(db, t)
                note += f", хук заменён на {alt + 1} ({hooks[alt].get('mechanic', '')}) — ему доказательство не нужно"
        db.flush()
        refresh_card(db, t)
        notify(note + ".", reply_to=_card_anchor(t))
        n += 1
    return n


def due_thread_ids(db: Session, now: datetime) -> list[int]:
    return list(db.scalars(select(FunnelThread.id).where(
        FunnelThread.status.in_(("draft", "approved")), FunnelThread.slot_at <= now,
    ).order_by(FunnelThread.slot_at)).all())


def _image_urls(t: FunnelThread) -> tuple[list[str], str | None]:
    """Фото из Telegram → MinIO → временные публичные ссылки для Threads."""
    photos = [m for m in (t.materials or []) if m.get("type") == "photo"]
    if not photos:
        return [], None
    from app.funnel import storage

    if not storage.configured():
        return [], "MinIO не настроен — ветка выходит без картинок"
    urls = []
    for i, m in enumerate(photos[:20]):
        data, path = tg.get_file_bytes(m["file_id"])
        ext = "png" if path.lower().endswith(".png") else "jpg"
        key = storage.put_image(f"funnel/{t.id}/{i}.{ext}", data, "image/png" if ext == "png" else "image/jpeg")
        urls.append(storage.public_url(key))
    return urls, None


def process_due(db: Session, thread_id: int, now: datetime) -> str:
    """Слот наступил: одобренная — выходит; без ответа — по FUNNEL_UNANSWERED."""
    t = get_thread(db, thread_id)
    if t.status not in ("draft", "approved") or t.slot_at > now:
        return "skip"
    if now - t.slot_at > GRACE:
        t.status = "reserve"
        db.flush()
        notify(f"⏭ Ветка №{t.id}: слот {schedule.fmt_slot(t.slot_at, tz())} пропущен (крон не успел) — "
               "тема в запасе.", reply_to=_card_anchor(t))
        return "missed"
    if t.status == "draft":
        if settings.funnel_unanswered != "publish" or qa.blocking(t.qa):
            t.status = "reserve"
            db.flush()
            refresh_card(db, t)
            notify(f"⏭ Ветка №{t.id} без ✅ к слоту — не вышла, тема в запасе. "
                   "✅ на карточке — выйдет при ближайшем прогоне.", reply_to=_card_anchor(t))
            return "unanswered"
        t.status = "approved"
    if not settings.funnel_autopublish:
        return handoff(db, t)
    return publish_thread(db, t, now)


def handoff(db: Session, t: FunnelThread) -> str:
    """Этап 1: публикуете сами — бот присылает посты по одному для копирования."""
    v = thread_view(db, t)
    v["posts"] = full_posts(t, LINK_DISPLAY)
    msgs = cards.handoff_messages(v)
    tgt = target()
    tg.send_message(tgt, cards.esc(msgs[0]), reply_to=_card_anchor(t))
    photos = [m["file_id"] for m in (t.materials or []) if m.get("type") == "photo"]
    if photos:
        try:
            tg.send_photo_group(tgt, photos, caption=f"Ветка №{t.id}: к посту 1")
        except tg.TelegramError:
            log.warning("handoff photos failed for %s", t.id)
    tg.send_messages(tgt, msgs[1:], html=False)
    t.status = "handed"
    t.published_at = now_utc()
    db.flush()
    refresh_card(db, t)
    return "handed"


def publish_thread(db: Session, t: FunnelThread, now: datetime) -> str:
    from app.funnel.threads_api import ChainError, ThreadsError

    blockers = qa.blocking(t.qa)
    if not t.link_url:
        ensure_link(db, t)
    if not t.link_url:
        blockers.append("нет ссылки в канал (CHANNEL_ID / CHANNEL_FALLBACK_LINK)")
    if blockers:
        return _publish_failed(db, t, "; ".join(blockers))
    try:
        acc, api = threads_api(db)
    except FunnelError as e:
        return _publish_failed(db, t, str(e))
    posts = full_posts(t)
    try:
        lim = api.publishing_limit()
        total = int((lim.get("config") or {}).get("quota_total") or 250)
        if int(lim.get("quota_usage") or 0) + len(posts) - len(t.threads_media_ids or []) > total:
            return _publish_failed(db, t, f"лимит публикаций Threads: {lim.get('quota_usage')}/{total} за 24 ч")
    except ThreadsError:
        log.warning("publishing_limit недоступен — публикуем без проверки")
    try:
        images, img_note = _image_urls(t) if not t.threads_media_ids else ([], None)
    except Exception as e:  # noqa: BLE001 — без картинок ветка всё равно выходит
        images, img_note = [], f"картинки не загрузились ({e})"

    # Фиксируем «publishing» до вызова API: при падении процесса не будет дубля.
    t.status = "publishing"
    t.account_id = acc.id
    db.commit()
    try:
        ids = api.publish_chain(posts, images, already=list(t.threads_media_ids or []))
    except ChainError as e:
        t.threads_media_ids = e.published
        db.commit()
        return _publish_failed(db, t, f"вышло {len(e.published)} из {len(posts)} постов: {e}. "
                                      "Нажмите ✅ — допубликую оставшиеся.")
    t.threads_media_ids = ids
    t.status = "published"
    t.published_at = now
    t.replies_until = now + timedelta(hours=settings.funnel_reply_window_hours)
    try:
        t.permalink = api.permalink(ids[0])
    except ThreadsError:
        t.permalink = None
    t.error = img_note
    db.commit()

    rec = db.get(FunnelReceiver, t.receiver_id) if t.receiver_id else None
    if settings.channel_mode == "private" and settings.channel_id and rec and rec.channel_message_id:
        try:
            tg.pin_in_channel(settings.channel_id, rec.channel_message_id)   # закрытый канал: приёмник сверху
        except tg.TelegramError:
            log.warning("pin receiver %s failed", rec.id)
    refresh_card(db, t)
    extra = f"\n⚠️ {cards.esc(img_note)}" if img_note else ""
    notify(f"🚀 Ветка №{t.id} вышла ({len(ids)} постов): {cards.esc(t.permalink or ids[0])}\n"
           f"Черновики ответов на комментарии пришлю в ближайшие {settings.funnel_reply_window_hours} ч."
           + extra, reply_to=_card_anchor(t))
    return "published"


def _publish_failed(db: Session, t: FunnelThread, reason: str) -> str:
    t.status = "failed"
    t.error = reason[:1000]
    db.commit()
    refresh_card(db, t)
    notify(f"⚠️ Ветка №{t.id} не опубликована: {cards.esc(reason)}", reply_to=_card_anchor(t))
    return "failed"


# ════════════════════════════════════════════════════════════════════════════
#  Комментарии: черновики ответов на апрув (решение 6)
# ════════════════════════════════════════════════════════════════════════════
def poll_comments(db: Session, now: datetime) -> dict:
    rows = db.scalars(select(FunnelThread).where(FunnelThread.status == "published",
                                                 FunnelThread.replies_until > now)).all()
    if not rows:
        return {"threads": 0, "drafts": 0}
    acc, api = threads_api(db)
    handle = (acc.handle or "").lstrip("@").lower()
    drafts = 0
    for t in rows:
        if not t.threads_media_ids:
            continue
        own = set(t.threads_media_ids)
        known = set(db.scalars(select(FunnelComment.comment_id).where(FunnelComment.thread_id == t.id)).all())
        try:
            convo = api.conversation(t.threads_media_ids[0])
        except Exception as e:  # noqa: BLE001 — одна ветка не роняет прогон
            log.warning("conversation %s failed: %s", t.id, e)
            continue
        fresh = [c for c in convo
                 if c.get("id") not in own and c.get("id") not in known
                 and (c.get("username") or "").lower() != handle and c.get("text")]
        excerpt = "\n".join(full_posts(t)[:3])
        for c in fresh[:MAX_COMMENTS_PER_RUN]:
            try:
                d = agents.draft_reply(t.topic or "", excerpt, c["text"], c.get("username") or "",
                                       facts=facts_texts(db, t.topic))
            except agents.AgentError as e:
                log.warning("draft_reply failed: %s", e)
                break
            fc = FunnelComment(thread_id=t.id, comment_id=c["id"], author=c.get("username"), text=c["text"],
                               draft=(d.get("reply") or "")[:500], status="skipped" if d.get("skip") else "draft")
            db.add(fc)
            db.flush()
            if fc.status == "skipped":
                continue
            drafts += 1
            if settings.funnel_reply_mode == "auto":
                publish_comment(db, fc.id)
            else:
                fc.card_message_id = tg.send_message(
                    target(), cards.comment_card({"thread_id": t.id, "author": fc.author, "text": fc.text,
                                                  "draft": fc.draft}),
                    cards.comment_keyboard(fc.id), reply_to=_card_anchor(t))["message_id"]
                db.flush()
    return {"threads": len(rows), "drafts": drafts}


def publish_comment(db: Session, comment_id: int) -> str:
    fc = db.get(FunnelComment, comment_id)
    if fc is None:
        raise FunnelError("Комментарий не найден.")
    if fc.status == "published":
        return "Ответ уже отправлен."
    if not settings.funnel_autopublish:
        raise FunnelError("Этап 1: ответы публикуете сами (FUNNEL_AUTOPUBLISH=0). Текст — в карточке.")
    _, api = threads_api(db)
    fc.reply_media_id = api.reply(fc.draft or "", fc.comment_id)
    fc.status = "published"
    fc.published_at = now_utc()
    db.flush()
    if fc.card_message_id:
        try:
            tg.edit_reply_markup(target().chat_id, fc.card_message_id, None)
        except tg.TelegramError:
            pass
    return f"✅ Ответ @{fc.author} отправлен."


def set_comment_draft(db: Session, comment_id: int, text: str) -> str:
    fc = db.get(FunnelComment, comment_id)
    if fc is None or fc.status != "draft":
        raise FunnelError("Этот ответ уже обработан.")
    fc.draft = text.strip()[:500]
    if fc.card_message_id:
        try:
            tg.edit_message_text(target().chat_id, fc.card_message_id,
                                 cards.comment_card({"thread_id": fc.thread_id, "author": fc.author,
                                                     "text": fc.text, "draft": fc.draft}),
                                 cards.comment_keyboard(fc.id))
        except tg.TelegramError:
            pass
    db.flush()
    return f"✏️ Черновик ответа @{fc.author} обновлён — жмите ✅ Отправить."


def skip_comment(db: Session, comment_id: int) -> str:
    fc = db.get(FunnelComment, comment_id)
    if fc is None:
        raise FunnelError("Комментарий не найден.")
    if fc.status == "draft":
        fc.status = "skipped"
    if fc.card_message_id:
        try:
            tg.edit_reply_markup(target().chat_id, fc.card_message_id, None)
        except tg.TelegramError:
            pass
    db.flush()
    return "🗑 Пропущено."


# ════════════════════════════════════════════════════════════════════════════
#  Замер: метрики, 48 часов, неделя
# ════════════════════════════════════════════════════════════════════════════
def record_join(db: Session, invite_link: str, tg_user_id: int) -> bool:
    t = db.scalar(select(FunnelThread).where(FunnelThread.invite_link == invite_link))
    new_id = db.execute(pg_insert(ChannelJoin).values(invite_link=invite_link, tg_user_id=tg_user_id,
                                                      thread_id=t.id if t else None)
                        .on_conflict_do_nothing(constraint="uq_funnel_join")
                        .returning(ChannelJoin.id)).scalar()
    db.flush()
    return new_id is not None


def collect_metrics(db: Session, now: datetime) -> dict:
    rows = db.scalars(select(FunnelThread).where(FunnelThread.status == "published",
                                                 FunnelThread.published_at >= now - timedelta(days=14))).all()
    if not rows:
        return {"threads": 0}
    _, api = threads_api(db)
    clicks: dict[str, int] = {}
    try:
        since = int((min(t.published_at for t in rows) - timedelta(days=1)).timestamp())
        clicks = api.link_clicks(since, int(now.timestamp()))
    except Exception as e:  # noqa: BLE001 — без кликов метрики постов всё равно нужны
        log.warning("link clicks failed: %s", e)
    done = 0
    for t in rows:
        if not t.threads_media_ids:
            continue
        try:
            m = api.media_insights(t.threads_media_ids[0])
        except Exception as e:  # noqa: BLE001
            log.warning("insights %s failed: %s", t.id, e)
            continue
        m["clicks"] = clicks.get(t.link_url, 0) if t.link_url else 0
        m["joins"] = db.scalar(select(func.count()).select_from(ChannelJoin)
                               .where(ChannelJoin.thread_id == t.id)) or 0
        t.metrics = m
        t.metrics_at = now
        done += 1
    # Приёмники: сколько кликов и подписок собрали их ветки.
    for r in db.scalars(select(FunnelReceiver).where(FunnelReceiver.status == "active")).all():
        linked = db.scalars(select(FunnelThread).where(FunnelThread.receiver_id == r.id,
                                                       FunnelThread.status == "published")).all()
        r.clicks = sum((x.metrics or {}).get("clicks", 0) for x in linked)
        r.joins = sum((x.metrics or {}).get("joins", 0) for x in linked)
    db.flush()
    return {"threads": done, "links_with_clicks": len(clicks)}


def _stats(t: FunnelThread) -> recycle.Stats:
    m = t.metrics or {}
    hooks = t.hooks or []
    return recycle.Stats(
        id=t.id, published_at=t.published_at, likes=m.get("likes", 0), replies=m.get("replies", 0),
        reposts=m.get("reposts", 0), quotes=m.get("quotes", 0), shares=m.get("shares", 0),
        views=m.get("views", 0), clicks=m.get("clicks", 0), joins=m.get("joins", 0), cluster=t.cluster,
        mechanic=hooks[t.active_hook].get("mechanic", "") if t.active_hook < len(hooks) else "")


def evaluate(db: Session, now: datetime) -> dict:
    """Через 48 ч: вердикт выпуску и решение по телу (перевыпуск / архив)."""
    targets = db.scalars(select(FunnelThread).where(
        FunnelThread.status == "published", FunnelThread.evaluated_at.is_(None),
        FunnelThread.metrics_at.is_not(None),
        FunnelThread.published_at <= now - timedelta(hours=recycle.EVAL_AFTER_HOURS),
    )).all()
    if not targets:
        return {"evaluated": 0}
    pool_rows = db.scalars(select(FunnelThread).where(
        FunnelThread.status == "published", FunnelThread.metrics_at.is_not(None),
        FunnelThread.published_at >= now - timedelta(days=60))).all()
    pool = [_stats(t) for t in pool_rows]
    start = start_date(db)
    today = local_today(now)
    first_weeks = start is None or (today - start).days < schedule.WARMUP_DAYS
    out = []
    for t in targets:
        st = _stats(t)
        t.verdict = recycle.verdict(st, recycle.population(st, pool, first_weeks))
        t.evaluated_at = now
        db.flush()
        root = t if t.kind == "new" else db.get(FunnelThread, t.parent_id)
        releases = [r for r in _family(db, root) if r.status == "published" and r.verdict]
        decision = recycle.family_decision([r.verdict for r in releases])
        if decision == "archive":
            root.archived_until = recycle.archive_until(today, seed=root.id)
        db.flush()
        v = thread_view(db, t)
        notify(cards.report_48h(v, t.metrics or {}, t.verdict, decision), reply_to=_card_anchor(t))
        out.append({"id": t.id, "verdict": t.verdict, "decision": decision})
    return {"evaluated": len(out), "items": out}


def weekly(db: Session, today: date, update_weights: bool) -> str:
    """Отчёт за 7 дней: хуки, кластеры, клики, подписки; по понедельникам — новые веса."""
    tzinfo = tz()
    start = datetime.combine(today - timedelta(days=7), datetime.min.time(), tzinfo=tzinfo)
    end = datetime.combine(today, datetime.min.time(), tzinfo=tzinfo)
    rows = db.scalars(select(FunnelThread).where(FunnelThread.status == "published",
                                                 FunnelThread.published_at >= start,
                                                 FunnelThread.published_at < end)).all()
    keys = [k for k, _ in cards.METRIC_LABELS]
    totals = {k: sum((t.metrics or {}).get(k, 0) for t in rows) for k in keys}
    ranked = sorted(rows, key=lambda t: recycle.value(_stats(t)), reverse=True)

    def item(t: FunnelThread) -> dict:
        return {"id": t.id, "mechanic": _stats(t).mechanic, "hook": qa.first_line(active_hook_text(t)),
                "m": t.metrics or {}}

    best = [item(t) for t in ranked[:3]]
    worst = [item(t) for t in ranked[-3:][::-1]] if len(ranked) > 3 else []
    by_cluster: dict[int, list[FunnelThread]] = {}
    for t in rows:
        by_cluster.setdefault(t.cluster, []).append(t)
    clusters = [{"cluster": c, "threads": len(ts),
                 "clicks": sum((t.metrics or {}).get("clicks", 0) for t in ts),
                 "joins": sum((t.metrics or {}).get("joins", 0) for t in ts),
                 "engagement": sum(recycle.engagement(_stats(t)) for t in ts)}
                for c, ts in sorted(by_cluster.items())]
    old = cluster_weights(db)
    new = old
    if update_weights and rows:
        new = recycle.recompute_weights(old, {c: [recycle.value(_stats(t)) for t in ts]
                                              for c, ts in by_cluster.items()})
        set_state(db, "cluster_weights", {str(k): v for k, v in new.items()})
    period = f"{start:%d.%m}–{(end - timedelta(days=1)):%d.%m}"
    return cards.weekly_report(period, totals if rows else {}, best, worst, clusters,
                               old, new if update_weights else {},
                               {c: cl.name for c, cl in schedule.CLUSTERS.items()},
                               calibration=forecast_calibration(db))


def forecast_calibration(db: Session, days: int = 30) -> str:
    """Средний прогноз у победителей и у остальных за 30 дней — видно, угадывает ли аналитик."""
    rows = db.scalars(select(FunnelThread).where(FunnelThread.verdict.is_not(None),
                                                 FunnelThread.published_at >= now_utc() - timedelta(days=days))).all()
    pairs = [(((t.qa or {}).get("forecast") or {}).get("score"), t.verdict) for t in rows]
    pairs = [(s, v) for s, v in pairs if s is not None]
    if len(pairs) < 3:
        return ""
    win = [s for s, v in pairs if v == "winner"]
    rest = [s for s, v in pairs if v != "winner"]
    avg = lambda xs: sum(xs) / len(xs) if xs else 0  # noqa: E731
    return (f"победители в среднем получали {avg(win):.1f}/10, остальные {avg(rest):.1f}/10 "
            f"({len(pairs)} веток за {days} дней)")


def refresh_account_token(db: Session) -> dict:
    from app.funnel.threads_api import refresh_token

    acc = funnel_account(db)
    if acc is None or not acc.access_token:
        raise FunnelError("Нет аккаунта с токеном.")
    new_token, expires = refresh_token(decrypt_token(acc.access_token))
    acc.access_token = encrypt_token(new_token)
    set_state(db, "threads_token", {"refreshed_at": now_utc().isoformat(), "expires_in": expires})
    db.flush()
    return {"account": acc.handle, "expires_in_days": round(expires / 86400, 1)}
