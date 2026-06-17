#!/usr/bin/env python3
"""approval_bot.py — Telegram-апрув (MVP, §1/§6/§9/§10).

Берёт черновики из БД и шлёт владельцу карточками с inline-кнопками:

  • Контент (generated_content, status='draft'):
        ✅ Одобрить  → status='approved' (уйдёт в публикацию по расписанию)
        🚀 Опубликовать → approve + немедленная публикация (Threads API)
        ❌ Отклонить → status='rejected'
  • Реплаи (replies, status='draft'):
        ✅ Одобрить  → status='approved' (опубликует reply_worker)
        🚀 Ответить  → немедленная публикация реплая
        ⏭ Пропустить → status='rejected', цель → 'skipped'

Бот отвечает ТОЛЬКО владельцу (OWNER_TELEGRAM_ID). Гонки/повторные клики
защищены SQL-переходами по статусу (action применяется только из ожидаемого).

Запуск:
    python -m app.bot.approval_bot            # long-running (polling)
    python -m app.bot.approval_bot selftest   # чистые функции (без сети/БД/telegram)

В боте: /start · /drafts · /replies
Опц. REVIEW_DAILY_TIME=HH:MM (UTC) — ежедневный авто-пуш на ревью.
"""
from __future__ import annotations

import asyncio
import html
import logging
import sys
from datetime import time as dtime, timezone

logging.basicConfig(format="%(asctime)s [%(levelname)s] %(name)s: %(message)s", level=logging.INFO)
logger = logging.getLogger("threads-approval-bot")


# ════════════════════════════════════════════════════════════════════════════
#  ЧИСТЫЕ ФУНКЦИИ ПРЕДСТАВЛЕНИЯ  (stdlib only — тестируются без сети/БД/telegram)
# ════════════════════════════════════════════════════════════════════════════
def _snippet(text: str | None, limit: int = 280) -> str:
    full = " ".join((text or "").split())
    return (full[:limit] + ("…" if len(full) > limit else "")) or "(пусто)"


def _num(value, fmt: str = "{:.2f}") -> str:
    return fmt.format(float(value)) if value is not None else "—"


def content_card(row: dict) -> str:
    """Карточка адаптации на ревью (HTML parse_mode)."""
    return (
        f"📝 <b>Адаптация #{row['id']}</b>  ·  аккаунт {row.get('account_id') or '—'}\n"
        f"sem_sim={_num(row.get('similarity_score'))}  text_sim={_num(row.get('text_similarity'))}\n"
        f"\n{html.escape(_snippet(row.get('content'), 480))}"
    )


def reply_card(row: dict) -> str:
    """Карточка реплая на ревью (HTML parse_mode)."""
    return (
        f"💬 <b>Реплай #{row['id']}</b>  ·  аккаунт {row.get('account_id') or '—'}\n"
        f"🎯 цель: @{html.escape(str(row.get('target_author') or '—'))}  "
        f"xn={_num(row.get('xn_score'), '{:.1f}')}\n"
        f"<i>{html.escape(_snippet(row.get('target_text'), 160))}</i>\n"
        f"\n➡️ {html.escape(_snippet(row.get('text'), 480))}"
    )


def encode_cb(action: str, kind: str, item_id: int) -> str:
    """action ∈ approve|publish|reject|skip ; kind ∈ c|r. Укладывается в 64 байта."""
    return f"{action}:{kind}:{item_id}"


def decode_cb(data: str) -> tuple[str, str, int]:
    action, kind, raw_id = data.split(":", 2)
    return action, kind, int(raw_id)


def _parse_hhmm(s: str) -> dtime:
    """'09:30' → time(9,30, UTC). Бросает ValueError на мусоре."""
    hh, mm = (int(x) for x in s.strip().split(":", 1))
    return dtime(hour=hh, minute=mm, tzinfo=timezone.utc)


# ════════════════════════════════════════════════════════════════════════════
#  DB  (синхронный SQLAlchemy; в async-хендлерах оборачивается в to_thread)
# ════════════════════════════════════════════════════════════════════════════
def fetch_pending_content(limit: int) -> list[dict]:
    from sqlalchemy import select

    from app.core.database import session_scope
    from app.models.generated_content import GeneratedContent

    with session_scope() as db:
        rows = db.scalars(
            select(GeneratedContent).where(GeneratedContent.status == "draft")
            .order_by(GeneratedContent.created_at.desc()).limit(limit)
        ).all()
        return [
            {"id": r.id, "account_id": r.account_id, "content": r.content,
             "similarity_score": r.similarity_score, "text_similarity": r.text_similarity}
            for r in rows
        ]


def fetch_pending_replies(limit: int) -> list[dict]:
    from sqlalchemy import select

    from app.core.database import session_scope
    from app.models.reply import Reply
    from app.models.reply_target import ReplyTarget

    with session_scope() as db:
        rows = db.execute(
            select(Reply.id, Reply.account_id, Reply.text,
                   ReplyTarget.author, ReplyTarget.text, ReplyTarget.xn_score)
            .join(ReplyTarget, Reply.target_id == ReplyTarget.id)
            .where(Reply.status == "draft").limit(limit)
        ).all()
        return [
            {"id": r[0], "account_id": r[1], "text": r[2],
             "target_author": r[3], "target_text": r[4], "xn_score": r[5]}
            for r in rows
        ]


def _set_content_status(content_id: int, new_status: str, allowed: tuple[str, ...]) -> bool:
    """Race-safe переход: применяется только из ожидаемого статуса."""
    from sqlalchemy import update

    from app.core.database import session_scope
    from app.models.generated_content import GeneratedContent

    with session_scope() as db:
        res = db.execute(
            update(GeneratedContent)
            .where(GeneratedContent.id == content_id, GeneratedContent.status.in_(allowed))
            .values(status=new_status)
        )
        return res.rowcount > 0


def _set_reply_status(reply_id: int, new_status: str, allowed: tuple[str, ...]) -> bool:
    from sqlalchemy import update

    from app.core.database import session_scope
    from app.models.reply import Reply

    with session_scope() as db:
        res = db.execute(
            update(Reply).where(Reply.id == reply_id, Reply.status.in_(allowed))
            .values(status=new_status)
        )
        return res.rowcount > 0


def approve_content(content_id: int) -> bool:
    return _set_content_status(content_id, "approved", ("draft", "rejected"))


def reject_content(content_id: int) -> bool:
    return _set_content_status(content_id, "rejected", ("draft", "approved"))


def approve_reply(reply_id: int) -> bool:
    return _set_reply_status(reply_id, "approved", ("draft",))


def skip_reply(reply_id: int) -> bool:
    """Реплай → rejected, цель → skipped."""
    from sqlalchemy import update

    from app.core.database import session_scope
    from app.models.reply import Reply
    from app.models.reply_target import ReplyTarget

    with session_scope() as db:
        reply = db.get(Reply, reply_id)
        if reply is None or reply.status not in ("draft", "approved"):
            return False
        reply.status = "rejected"
        if reply.target_id:
            db.execute(update(ReplyTarget).where(ReplyTarget.id == reply.target_id).values(status="skipped"))
        return True


def publish_content_now(content_id: int) -> str:
    """Approve (если черновик) + немедленная публикация. Возвращает threads_post_id.
    Бросает RuntimeError при невозможности (гейт/ошибка API)."""
    from app.core.database import session_scope
    from app.models.generated_content import GeneratedContent
    from app.services.publishing_service import publish_content

    with session_scope() as db:
        gc = db.get(GeneratedContent, content_id)
        if gc is None:
            raise RuntimeError("контент не найден")
        if gc.status in ("draft", "rejected"):
            gc.status = "approved"
            db.flush()
        pub = publish_content(db, content_id)
        return pub.threads_post_id or "ok"


def publish_reply_now(reply_id: int) -> str:
    from app.core.database import session_scope
    from app.models.reply import Reply
    from app.services.publishing_service import publish_reply

    with session_scope() as db:
        reply = db.get(Reply, reply_id)
        if reply is None:
            raise RuntimeError("реплай не найден")
        if reply.status == "draft":
            reply.status = "approved"
            db.flush()
        pub = publish_reply(db, reply_id)
        return pub.threads_post_id or "ok"


# ════════════════════════════════════════════════════════════════════════════
#  TELEGRAM  (импорты ленивые — модуль грузится без python-telegram-bot)
# ════════════════════════════════════════════════════════════════════════════
def _content_keyboard(content_id: int):
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup

    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Одобрить", callback_data=encode_cb("approve", "c", content_id)),
        InlineKeyboardButton("🚀 Опубликовать", callback_data=encode_cb("publish", "c", content_id)),
        InlineKeyboardButton("❌ Отклонить", callback_data=encode_cb("reject", "c", content_id)),
    ]])


def _reply_keyboard(reply_id: int):
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup

    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Одобрить", callback_data=encode_cb("approve", "r", reply_id)),
        InlineKeyboardButton("🚀 Ответить", callback_data=encode_cb("publish", "r", reply_id)),
        InlineKeyboardButton("⏭ Пропустить", callback_data=encode_cb("skip", "r", reply_id)),
    ]])


def _is_owner(update) -> bool:
    from app.config import settings

    user = update.effective_user
    return bool(user and settings.owner_telegram_id and user.id == settings.owner_telegram_id)


async def cmd_start(update, context) -> None:
    if not _is_owner(update):
        return
    await update.message.reply_text(
        "Бот апрува AI Threads Growth Agent.\n"
        "/drafts — адаптации постов на ревью\n"
        "/replies — реплаи на ревью"
    )


async def _push_content(bot, chat_id: int) -> int:
    from app.config import settings

    rows = await asyncio.to_thread(fetch_pending_content, settings.review_batch)
    for row in rows:
        await bot.send_message(chat_id=chat_id, text=content_card(row),
                               reply_markup=_content_keyboard(row["id"]), parse_mode="HTML")
    return len(rows)


async def _push_replies(bot, chat_id: int) -> int:
    from app.config import settings

    rows = await asyncio.to_thread(fetch_pending_replies, settings.review_batch)
    for row in rows:
        await bot.send_message(chat_id=chat_id, text=reply_card(row),
                               reply_markup=_reply_keyboard(row["id"]), parse_mode="HTML")
    return len(rows)


async def cmd_drafts(update, context) -> None:
    if not _is_owner(update):
        return
    n = await _push_content(context.bot, update.effective_chat.id)
    if n == 0:
        await update.message.reply_text("Черновиков адаптаций нет.")


async def cmd_replies(update, context) -> None:
    if not _is_owner(update):
        return
    n = await _push_replies(context.bot, update.effective_chat.id)
    if n == 0:
        await update.message.reply_text("Черновиков реплаев нет.")


async def daily_job(context) -> None:
    from app.config import settings

    try:
        c = await _push_content(context.bot, settings.owner_telegram_id)
        r = await _push_replies(context.bot, settings.owner_telegram_id)
        logger.info("daily review push: %s drafts, %s replies", c, r)
    except Exception:  # noqa: BLE001
        logger.exception("daily review job failed")


async def on_callback(update, context) -> None:
    query = update.callback_query
    if not _is_owner(update):
        await query.answer("Нет доступа.", show_alert=True)
        return
    await query.answer()

    action, kind, item_id = decode_cb(query.data)
    base = query.message.text_html or query.message.text or ""

    async def _edit(prefix: str, keyboard=None) -> None:
        await query.edit_message_text(prefix + "\n\n" + base, parse_mode="HTML", reply_markup=keyboard)

    # — Немедленная публикация —
    if action == "publish":
        fn = publish_content_now if kind == "c" else publish_reply_now
        keyboard = _content_keyboard(item_id) if kind == "c" else _reply_keyboard(item_id)
        try:
            media_id = await asyncio.to_thread(fn, item_id)
        except RuntimeError as e:  # гейт/ошибка API — оставляем кнопки, сообщаем
            await _edit(f"⚠️ Не опубликовано: {html.escape(str(e))}", keyboard)
            return
        await _edit(f"🚀 Опубликовано (id={html.escape(str(media_id))}).")
        return

    # — Статусные действия (race-safe) —
    if kind == "c":
        changed = await asyncio.to_thread(approve_content if action == "approve" else reject_content, item_id)
        ok = "✅ Одобрено." if action == "approve" else "❌ Отклонено."
    else:
        fn = approve_reply if action == "approve" else skip_reply
        changed = await asyncio.to_thread(fn, item_id)
        ok = "✅ Одобрено." if action == "approve" else "⏭ Пропущено."
    await _edit(ok if changed else "ℹ️ Уже обработано.")


def run() -> None:
    from app.config import settings

    if not settings.telegram_bot_token or not settings.owner_telegram_id:
        raise SystemExit("Не заданы TELEGRAM_BOT_TOKEN / OWNER_TELEGRAM_ID в .env")

    from telegram.ext import Application, CallbackQueryHandler, CommandHandler

    app = Application.builder().token(settings.telegram_bot_token).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("drafts", cmd_drafts))
    app.add_handler(CommandHandler("replies", cmd_replies))
    app.add_handler(CallbackQueryHandler(on_callback))

    if settings.review_daily_time:
        app.job_queue.run_daily(daily_job, time=_parse_hhmm(settings.review_daily_time))
        logger.info("daily review push scheduled at %s UTC", settings.review_daily_time)

    logger.info("approval-bot started; owner=%s", settings.owner_telegram_id)
    app.run_polling(allowed_updates=["message", "callback_query"])


# ════════════════════════════════════════════════════════════════════════════
#  SELFTEST
# ════════════════════════════════════════════════════════════════════════════
def _selftest() -> None:
    content = {"id": 7, "account_id": 1, "content": "  Как AI-агент привёл\n10k подписчиков  ",
               "similarity_score": 0.61, "text_similarity": 0.12}
    card = content_card(content)
    assert "Адаптация #7" in card
    assert "Как AI-агент привёл 10k подписчиков" in card  # схлопывает пробелы/переводы строк
    assert "sem_sim=0.61" in card and "text_sim=0.12" in card

    reply = {"id": 3, "account_id": 2, "text": "На деле решает дистрибуция, а не модель.",
             "target_author": "guru", "target_text": "AI changes everything", "xn_score": 7.4}
    rcard = reply_card(reply)
    assert "Реплай #3" in rcard and "@guru" in rcard and "xn=7.4" in rcard

    # callback кодирование/раскодирование, влезает в лимит 64 байта
    for action in ("approve", "publish", "reject", "skip"):
        data = encode_cb(action, "c", 12345)
        assert len(data.encode()) <= 64
        assert decode_cb(data) == (action, "c", 12345)

    # HTML-экранирование пользовательского контента
    assert "&lt;b&gt;" in content_card({"id": 1, "content": "<b>x</b>"})

    assert _parse_hhmm("09:05") == dtime(9, 5, tzinfo=timezone.utc)
    try:
        _parse_hhmm("oops")
        raise AssertionError("должно было упасть")
    except ValueError:
        pass

    print(card)
    print("\napproval_bot selftest OK")


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "selftest":
        _selftest()
    else:
        run()


if __name__ == "__main__":
    main()
