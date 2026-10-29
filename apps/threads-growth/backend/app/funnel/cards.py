"""Карточки и кнопки Telegram-бота воронки. Чистые функции (HTML parse_mode).

Карточка ветки = шапка (№, слот, кластер, шаблон, гипотеза) → активный хук →
весь текст по постам с числом символов → приёмник → что нужно от автора →
итог проверки. Длинная ветка режется на несколько сообщений ≤4096 символов,
кнопки — у последнего.

Проверка:  python -m app.funnel.cards
"""
from __future__ import annotations

import html

TG_LIMIT = 4096

# callback_data: "<p>:<action>:<id>[:<arg>]", p: f — ветка, r — приёмник, c — комментарий.
THREAD_ACTIONS = {
    "ok": "approve", "ed": "edit", "hk": "hooks", "hs": "hook_set", "ot": "other",
    "mt": "materials", "sl": "slots", "ss": "slot_set", "sk": "skip", "no": "noop",
}


def encode(prefix: str, action: str, item_id: int, arg: int | None = None) -> str:
    data = f"{prefix}:{action}:{item_id}" + (f":{arg}" if arg is not None else "")
    assert len(data.encode()) <= 64, data
    return data


def decode(data: str) -> tuple[str, str, int, int | None]:
    parts = data.split(":")
    if len(parts) not in (3, 4):
        raise ValueError(f"bad callback: {data}")
    arg = int(parts[3]) if len(parts) == 4 else None
    return parts[0], parts[1], int(parts[2]), arg


def keyboard(rows: list[list[tuple[str, str]]]) -> dict:
    """[[('текст', 'callback')]] → reply_markup Bot API."""
    return {"inline_keyboard": [[{"text": t, "callback_data": d} for t, d in row] for row in rows]}


def esc(text: str | None) -> str:
    return html.escape(text or "", quote=False)


def _chunks(blocks: list[str], limit: int = TG_LIMIT) -> list[str]:
    out: list[str] = []
    cur = ""
    for b in blocks:
        if len(b) > limit:
            b = b[: limit - 1] + "…"
        candidate = f"{cur}\n\n{b}" if cur else b
        if len(candidate) > limit:
            out.append(cur)
            cur = b
        else:
            cur = candidate
    if cur:
        out.append(cur)
    return out


# ── Ветка ────────────────────────────────────────────────────────────────────
def thread_card(v: dict) -> list[str]:
    """v — представление ветки (service.thread_view). Возвращает сообщения по порядку."""
    kind = "перевыпуск №%d" % v["reissue_no"] if v.get("kind") == "reissue" else "новая"
    head = (
        f"🧵 <b>Ветка №{v['id']}</b> · v{v.get('version', 1)} · {kind}\n"
        f"🕙 {esc(v.get('slot_label'))} · кластер {v['cluster']} «{esc(v.get('cluster_name'))}» · "
        f"шаблон {v['template']} ({esc(v.get('template_name'))})\n"
        f"🎯 {esc(v.get('topic'))}\n"
        f"💡 Гипотеза: {esc(v.get('hypothesis'))}"
    )
    hooks = v.get("hooks") or []
    active = v.get("active_hook", 0)
    mech = hooks[active].get("mechanic", "") if 0 <= active < len(hooks) else ""
    hook_line = f"🎣 Хук {active + 1} из {len(hooks)}" + (f" · {esc(mech)}" if mech else "") + \
        (" · ещё варианты — 🔄 Хук" if len(hooks) > 1 else "")
    blocks = [head]
    if v.get("forecast"):
        blocks.append(forecast_block(v["forecast"]))
    blocks.append(hook_line)
    if v.get("note"):
        blocks.insert(0, f"🔁 {esc(v['note'])}")

    posts = v.get("posts") or []
    n = len(posts)
    for i, p in enumerate(posts, start=1):
        blocks.append(f"<b>{i}/{n}</b> · {len(p)} симв.\n{esc(p)}")

    rec = v.get("receiver")
    if rec and rec.get("status") == "active":
        link = v.get("link_url") or rec.get("url") or ""
        proof = ""
        if rec.get("channel_score") is not None:
            proof = f"\n📊 В канале: ×{rec['channel_score']:.1f} к обычному посту"
            if rec.get("channel_views"):
                proof += f", {rec['channel_views']} просмотров"
        blocks.append(f"📥 Приёмник: {esc(rec.get('title'))}{proof}\n🔗 {esc(link)}")
    elif rec:
        blocks.append(f"📥 Приёмник готовится — черновик №{rec.get('id')} «{esc(rec.get('title'))}» отдельной карточкой")
    else:
        brief = v.get("receiver_brief") or ""
        blocks.append("📥 <b>Нужен приёмник</b>" + (f": {esc(brief)}" if brief else ""))

    if v.get("media_hint"):
        blocks.append(f"🖼 Медиа к посту 1: {esc(v['media_hint'])}")
    need = []
    if v.get("materials_request"):
        got = v.get("materials_count", 0)
        need.append(f"📎 Нужно от вас: {esc(v['materials_request'])}"
                    + (f" (получено фото: {got})" if got else " — за час до слота"))
    for q in v.get("facts_needed") or []:
        need.append(f"❓ {esc(q)}")
    if need:
        blocks.append("\n".join(need))

    blocks.append(qa_block(v.get("qa") or {}))
    if v.get("editor"):
        blocks.append(f"📝 Редактор: {esc(v['editor'][:400])}")
    blocks.append(status_line(v.get("status", "draft"), v.get("autopublish", False)))
    return _chunks(blocks)


def score_bar(score: float) -> str:
    full = int(round(score))
    return "●" * full + "○" * (10 - full)


def forecast_block(fc: dict) -> str:
    """Прогноз виральности: оценка, почему, на какие хиты опирается, риски, как поднять."""
    score = float(fc.get("score") or 0)
    lines = [f"🔥 <b>Прогноз виральности: {score:.1f}/10</b>  {score_bar(score)}"]
    if fc.get("verdict"):
        lines.append(esc(fc["verdict"]))
    for w in fc.get("why") or []:
        lines.append(f"• {esc(w)}")
    ev = fc.get("evidence") or []
    if ev:
        lines.append("Опора — посты, которые залетели:")
        for e in ev[:3]:
            stats = f"xn {e.get('xn', 0):.1f}, {e.get('likes', 0)} лайков"
            who = f"@{esc(e.get('author'))}" if e.get("author") else f"пост {e.get('id')}"
            link = f' <a href="{esc(e["url"])}">открыть</a>' if e.get("url") else ""
            lines.append(f"  ↳ {who} ({stats}) — {esc(e.get('note'))}{link}")
    else:
        lines.append("Опоры в исследовании нет — оценка по механике скилла.")
    for r in (fc.get("risks") or [])[:3]:
        lines.append(f"⚠️ {esc(r)}")
    if fc.get("boost"):
        lines.append(f"↑ Как поднять: {esc(fc['boost'])}")
    return "\n".join(lines)


def qa_block(qa: dict) -> str:
    checks = qa.get("checks") or []
    if not checks:
        return "🧪 Проверка: не выполнялась"
    bad = [c for c in checks if not c.get("ok")]
    good = len(checks) - len(bad)
    lines = [f"🧪 Проверка: {good}/{len(checks)} ✅"]
    for c in bad:
        icon = "⛔" if c.get("hard") else "⚠️"
        note = f" — {esc(c.get('note'))}" if c.get("note") else ""
        lines.append(f"{icon} {esc(c.get('name'))}{note}")
    for c in checks:
        if c.get("ok") and c.get("note") and c.get("name") == "Ссылка живая":
            lines.append(f"ℹ️ Ссылка: {esc(c.get('note'))}")
    return "\n".join(lines)


def status_line(status: str, autopublish: bool) -> str:
    return {
        "draft": "Статус: ждёт вашего ✅",
        "approved": "Статус: ✅ одобрена — выйдет в свой слот" if autopublish
        else "Статус: ✅ одобрена — в слот пришлю посты для публикации",
        "published": "Статус: 🚀 опубликована",
        "handed": "Статус: 📤 передана на ручную публикацию",
        "reserve": "Статус: 🗑 пропущена, тема в запасе",
        "replaced": "Статус: ♻️ заменена другой веткой",
        "failed": "Статус: ⚠️ ошибка публикации",
    }.get(status, f"Статус: {status}")


def thread_keyboard(thread_id: int) -> dict:
    return keyboard([
        [("✅ Одобрить", encode("f", "ok", thread_id)), ("✏️ Править", encode("f", "ed", thread_id))],
        [("🔄 Хук", encode("f", "hk", thread_id)), ("♻️ Другая", encode("f", "ot", thread_id)),
         ("📎 Материалы", encode("f", "mt", thread_id))],
        [("⏰ Слот", encode("f", "sl", thread_id)), ("🗑 Пропустить", encode("f", "sk", thread_id))],
    ])


def stale_keyboard(thread_id: int, label: str = "⤵️ Есть новая версия") -> dict:
    return keyboard([[(label, encode("f", "no", thread_id))]])


def hooks_message(v: dict) -> tuple[str, dict]:
    hooks = v.get("hooks") or []
    active = v.get("active_hook", 0)
    lines = [f"🔄 <b>Хуки ветки №{v['id']}</b> — выберите кнопкой:"]
    buttons = []
    for i, h in enumerate(hooks):
        star = "★ " if i == active else ""
        mech = f" <i>({esc(h.get('mechanic'))})</i>" if h.get("mechanic") else ""
        text = h.get("text", "")
        lines.append(f"\n<b>{star}{i + 1}.</b>{mech}\n{esc(text[:600])}")
        if i != active:
            buttons.append((str(i + 1), encode("f", "hs", v["id"], i)))
    text = "\n".join(lines)
    if len(text) > TG_LIMIT:
        text = text[: TG_LIMIT - 1] + "…"
    return text, keyboard([buttons] if buttons else [])


def slots_message(thread_id: int, choices: list[tuple[str, int]]) -> tuple[str, dict]:
    """choices: [(подпись, минуты от эпохи)]."""
    rows = [[(label, encode("f", "ss", thread_id, minutes))] for label, minutes in choices]
    return f"⏰ Ветка №{thread_id}: на какое время перенести?", keyboard(rows)


def handoff_messages(v: dict) -> list[str]:
    """Этап 1 (публикуете сами): шапка + каждый пост отдельным сообщением для копирования."""
    n = len(v.get("posts") or [])
    head = (f"⏰ Время ветки №{v['id']} — {v.get('slot_label')}\n"
            f"Публикуйте пост 1, остальные — ответами на предыдущий ({n} постов).")
    if v.get("materials_count"):
        head += f"\nК посту 1 — фото из карточки ({v['materials_count']} шт.)."
    return [head, *v.get("posts", [])]


# ── Приёмник ─────────────────────────────────────────────────────────────────
def receiver_card(r: dict) -> list[str]:
    head = (f"📥 <b>Черновик поста-приёмника №{r['id']}</b>"
            + (f" для ветки №{r['for_thread_id']}" if r.get("for_thread_id") else "")
            + f"\n«{esc(r.get('title'))}» · {esc(r.get('kind') or '')}\n"
            f"Что внутри: {esc(r.get('contents'))}\n"
            "После ✅ бот опубликует пост в канал и вставит ссылку в ветку.")
    return _chunks([head, esc(r.get("text"))])


def receiver_keyboard(receiver_id: int) -> dict:
    return keyboard([[("✅ В канал", encode("r", "ok", receiver_id)),
                      ("✏️ Править", encode("r", "ed", receiver_id)),
                      ("🗑 Не нужен", encode("r", "no", receiver_id))]])


# ── Комментарии ──────────────────────────────────────────────────────────────
def comment_card(c: dict) -> str:
    return (f"💬 Комментарий к ветке №{c['thread_id']} от @{esc(c.get('author') or '—')}:\n"
            f"<i>{esc((c.get('text') or '')[:800])}</i>\n\n"
            f"➡️ Черновик ответа ({len(c.get('draft') or '')} симв.):\n{esc(c.get('draft'))}")


def comment_keyboard(comment_id: int) -> dict:
    return keyboard([[("✅ Отправить", encode("c", "ok", comment_id)),
                      ("✏️ Править", encode("c", "ed", comment_id)),
                      ("🗑 Пропустить", encode("c", "no", comment_id))]])


# ── Отчёты ───────────────────────────────────────────────────────────────────
METRIC_LABELS = [("views", "просмотры"), ("likes", "лайки"), ("replies", "ответы"),
                 ("reposts", "репосты"), ("quotes", "цитаты"), ("shares", "шеры"),
                 ("clicks", "клики"), ("joins", "подписки")]

VERDICT_LABELS = {"winner": "🏆 победитель", "below": "📉 ниже медианы", "neutral": "➖ около медианы"}
DECISION_LABELS = {
    "reissue": "вернётся через 3–10 дней с другим хуком и свежим приёмником",
    "archive": "тело уходит в архив на 30–45 дней",
    "hold": "перевыпуск не планируем",
}


def metrics_line(m: dict) -> str:
    return " · ".join(f"{label} {m.get(key, 0)}" for key, label in METRIC_LABELS if m.get(key) is not None)


def report_48h(v: dict, metrics: dict, verdict: str, decision: str) -> str:
    link = f"\n🔗 {esc(v['permalink'])}" if v.get("permalink") else ""
    fc = (v.get("forecast") or {}).get("score")
    pred = f"Прогноз был {fc:.1f}/10.\n" if fc is not None else ""
    return (f"📊 <b>48 часов: ветка №{v['id']}</b> — {esc(v.get('topic'))}{link}\n"
            f"{metrics_line(metrics)}\n{pred}"
            f"Итог: {VERDICT_LABELS.get(verdict, verdict)} → {DECISION_LABELS.get(decision, decision)}")


def weekly_report(period: str, totals: dict, best: list[dict], worst: list[dict],
                  clusters: list[dict], weights_old: dict, weights_new: dict,
                  cluster_names: dict[int, str], calibration: str = "") -> str:
    lines = [f"📈 <b>Неделя {esc(period)}</b>", metrics_line(totals) or "публикаций нет"]
    if calibration:
        lines.append(f"🎯 Точность прогноза: {esc(calibration)}")
    if best:
        lines.append("\n<b>Лучшие хуки</b>")
        lines += [f"• №{b['id']} {esc(b.get('mechanic'))}: {esc(b.get('hook'))[:140]} — {metrics_line(b['m'])}"
                  for b in best]
    if worst:
        lines.append("\n<b>Худшие хуки</b>")
        lines += [f"• №{w['id']} {esc(w.get('mechanic'))}: {esc(w.get('hook'))[:140]} — {metrics_line(w['m'])}"
                  for w in worst]
    if clusters:
        lines.append("\n<b>Кластеры</b> (веток · клики · подписки · шеры+ответы)")
        lines += [f"• {c['cluster']}. {esc(cluster_names.get(c['cluster'], ''))}: {c['threads']} · "
                  f"{c['clicks']} · {c['joins']} · {c['engagement']}" for c in clusters]
    if weights_new:
        lines.append("\n<b>Веса кластеров на следующую неделю</b>")
        for c in sorted(weights_new):
            old = weights_old.get(c, 0)
            new = weights_new[c]
            arrow = "↑" if new > old + 0.005 else "↓" if new < old - 0.005 else "="
            lines.append(f"• {c}. {esc(cluster_names.get(c, ''))}: {old:.0%} → {new:.0%} {arrow}")
    return "\n".join(lines)[:TG_LIMIT]


def _selftest() -> None:
    data = encode("f", "ss", 123456, 29612345)
    assert decode(data) == ("f", "ss", 123456, 29612345)
    assert decode("r:ok:5") == ("r", "ok", 5, None)

    long_post = "П" * 490
    v = {
        "id": 7, "version": 2, "kind": "new", "reissue_no": 0, "slot_label": "вт 03.11 10:00",
        "cluster": 1, "cluster_name": "ИИ как психолог", "template": "A", "template_name": "промпт-сессия",
        "topic": "Самосаботаж <тест>", "hypothesis": "признание vs юмор",
        "hooks": [{"text": "ХУК 1", "mechanic": "признание"}, {"text": "ХУК 2", "mechanic": "юмор"}],
        "active_hook": 0, "posts": ["ХУК 1", *[long_post] * 8],
        "receiver": None, "receiver_brief": "план на неделю", "materials_request": "скрин",
        "facts_needed": ["Сколько лет вы ведёте блог?"], "status": "draft",
        "qa": {"checks": [{"name": "Каждый пост ≤500 символов", "ok": True},
                          {"name": "В хуке ≥2 числа", "ok": False, "note": "чисел: 0"}]},
    }
    msgs = thread_card(v)
    assert len(msgs) >= 2 and all(len(m) <= TG_LIMIT for m in msgs)
    joined = "\n".join(msgs)
    assert "Ветка №7" in joined and "&lt;тест&gt;" in joined
    assert "<b>9/9</b> · 490 симв." in joined
    assert "Нужен приёмник" in joined and "⚠️ В хуке ≥2 числа" in joined
    assert "Сколько лет" in joined

    kb = thread_keyboard(7)
    datas = [b["callback_data"] for row in kb["inline_keyboard"] for b in row]
    assert datas == ["f:ok:7", "f:ed:7", "f:hk:7", "f:ot:7", "f:mt:7", "f:sl:7", "f:sk:7"]
    text, kb = hooks_message(v)
    assert "★ 1." in text and kb["inline_keyboard"][0][0]["callback_data"] == "f:hs:7:1"

    fc = {"score": 7.4, "verdict": "Повторяет механику двух хитов", "why": ["тема про читателя"],
          "evidence": [{"id": 3, "note": "та же боль", "author": "anna", "xn": 6.2, "likes": 900, "url": "https://t/1"}],
          "risks": ["длинный пост 4"], "boost": "добавить цифру в первую строку"}
    with_fc = "\n".join(thread_card({**v, "forecast": fc}))
    assert "Прогноз виральности: 7.4/10" in with_fc and "@anna" in with_fc and "●●●●●●●○○○" in with_fc

    out = handoff_messages({**v, "posts": ["a", "b"], "materials_count": 2})
    assert out[1:] == ["a", "b"] and "фото" in out[0]
    rep = report_48h({"id": 7, "topic": "x", "permalink": "https://threads.net/p/1"},
                     {"likes": 30, "shares": 9, "joins": 4}, "winner", "reissue")
    assert "победитель" in rep and "подписки 4" in rep
    print(joined[:600])
    print("\ncards selftest OK")


if __name__ == "__main__":
    _selftest()
