#!/usr/bin/env python3
"""
review_bot.py — модуль 2: ревью скоренных постов в Telegram + публикация.

Пайплайн: парсинг → скоринг (tg_viral_parser.py) → [ЭТОТ МОДУЛЬ: ревью в боте → публикация].

Бот берёт топ постов из таблицы parsed_posts (которую наполняет tg_viral_parser.py),
шлёт их владельцу карточками с inline-кнопками «✅ Одобрить / ❌ Отклонить»:

    • Одобрить → текст поста публикуется в твой канал (PUBLISH_CHANNEL),
                 review_status = 'published'. Если задан ANTHROPIC_API_KEY —
                 текст перед публикацией переписывается через Claude (свой пост,
                 а не дословная копия конкурента).
    • Отклонить → review_status = 'rejected'.

Авто-пуш: если задан REVIEW_DAILY_TIME (HH:MM UTC) — бот раз в день сам присылает
топ на ревью (как ручной /review). Пусто = только ручной /review.

Бот отвечает ТОЛЬКО владельцу (OWNER_TELEGRAM_ID) — остальные игнорируются.

────────────────────────────────────────────────────────────────────────────
УСТАНОВКА
────────────────────────────────────────────────────────────────────────────
    pip install -r requirements.txt   # telethon, asyncpg, python-dotenv, python-telegram-bot

.env (в дополнение к переменным tg_viral_parser.py):
────────────────────────── .env ──────────────────────────
    DATABASE_URL=postgresql://user:pass@host:5432/postgres   # ОБЯЗАТЕЛЕН для бота
    TELEGRAM_BOT_TOKEN=        # @BotFather (можно тот же бот, что шлёт дайджесты)
    OWNER_TELEGRAM_ID=         # твой numeric id (только он видит ревью)
    PUBLISH_CHANNEL=@my_channel   # куда публиковать одобренное (@username или -100…)
    REVIEW_BATCH=10            # сколько постов слать за один /review
    REVIEW_DAILY_TIME=06:00   # необязательно: ежедневный авто-пуш топа (HH:MM UTC)
    ANTHROPIC_API_KEY=        # необязательно: рерайт текста через Claude перед публикацией
    ANTHROPIC_MODEL=claude-sonnet-4-6   # модель рерайта (по умолч.)
───────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────────────
ЗАПУСК
────────────────────────────────────────────────────────────────────────────
    python review_bot.py            # long-running bot (polling)
    python review_bot.py selftest   # проверка форматирования карточки (без сети/БД)

В боте:
    /start    — проверка доступа
    /review   — прислать топ необработанных постов на ревью

ВАЖНО: бот должен быть АДМИНОМ канала PUBLISH_CHANNEL (иначе публиковать не сможет).
"""
from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, time as dtime, timezone
from typing import Any, Mapping

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("review-bot")


# ════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ════════════════════════════════════════════════════════════════════════════
class BotConfig:
    token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    owner_id: int = int(os.getenv("OWNER_TELEGRAM_ID", "0"))
    publish_channel: str = os.getenv("PUBLISH_CHANNEL", "")
    database_url: str = os.getenv("DATABASE_URL", "")
    review_batch: int = int(os.getenv("REVIEW_BATCH", "10"))
    # "HH:MM" UTC — ежедневный авто-пуш топа на ревью. Пусто = только ручной /review.
    daily_time: str = os.getenv("REVIEW_DAILY_TIME", "")
    # Рерайт текста через Claude перед публикацией. Пусто = публикуем verbatim.
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

    @classmethod
    def validate(cls) -> None:
        missing = []
        if not cls.token:
            missing.append("TELEGRAM_BOT_TOKEN")
        if not cls.owner_id:
            missing.append("OWNER_TELEGRAM_ID")
        if not cls.publish_channel:
            missing.append("PUBLISH_CHANNEL")
        if not cls.database_url:
            missing.append("DATABASE_URL")
        if missing:
            raise SystemExit("Не заданы в .env: " + ", ".join(missing))


# ════════════════════════════════════════════════════════════════════════════
#  PRESENTATION  (чистые функции — тестируемо без сети/БД/telegram)
# ════════════════════════════════════════════════════════════════════════════
def post_url(channel: str, message_id: int) -> str:
    return f"https://t.me/{str(channel).lstrip('@')}/{message_id}"


def card_text(row: Mapping[str, Any], snippet_len: int = 400) -> str:
    """Карточка поста для ревью. row — Record/dict из parsed_posts."""
    full = " ".join((row["text"] or "").split())
    snippet = full[:snippet_len]
    tail = "…" if len(full) > snippet_len else ""
    media = "🖼 медиа" if row["has_media"] else "📝 текст"
    body = f"{snippet}{tail}" if snippet else "(без текста — только медиа)"
    return (
        f"⭐️ score={row['score']:.2f}  ({media})\n"
        f"📡 {row['channel']}  →  {post_url(row['channel'], row['message_id'])}\n"
        f"👁 {row['views']}   ❤️ {row['reactions_total']}   🔁 {row['forwards']}\n"
        f"\n{body}"
    )


def publish_text(row: Mapping[str, Any]) -> str:
    """Что именно уйдёт в канал при одобрении.

    В parsed_posts хранится только текст поста (не сами медиа-файлы), поэтому
    публикуем текст как черновик. Если текста нет (чистое медиа) — публикуем
    ссылку на оригинал, чтобы человек докрутил вручную.
    """
    text = (row["text"] or "").strip()
    if text:
        return text
    return f"Источник (медиа без текста): {post_url(row['channel'], row['message_id'])}"


# ════════════════════════════════════════════════════════════════════════════
#  REWRITE  (Claude — переписать чужой пост в наш, перед публикацией)
# ════════════════════════════════════════════════════════════════════════════
REWRITE_SYSTEM = (
    "Ты — редактор Telegram-канала. На вход даётся текст чужого вирального поста "
    "конкурента. Перепиши его своими словами на русском как самостоятельный пост для "
    "нашего канала: сохрани цепляющий смысл и структуру (хук → польза → призыв), но не "
    "копируй формулировки дословно; убери чужой брендинг, ссылки и упоминания авторства. "
    "Верни ТОЛЬКО готовый текст поста, без пояснений и кавычек."
)


async def rewrite_text(original: str) -> str:
    """Переписать текст через Claude. Возвращает оригинал, если модель ответила пусто."""
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=BotConfig.anthropic_api_key)
    msg = await client.messages.create(
        model=BotConfig.anthropic_model,
        max_tokens=1024,
        system=REWRITE_SYSTEM,
        messages=[{"role": "user", "content": original}],
    )
    parts = [b.text for b in msg.content if getattr(b, "type", None) == "text"]
    out = "\n".join(p.strip() for p in parts if p).strip()
    return out or original


async def build_publish_text(row: Mapping[str, Any]) -> str:
    """Что уйдёт в канал: рерайт через Claude, если задан ключ и есть авторский текст;
    иначе — verbatim (поведение по умолчанию)."""
    base = publish_text(row)
    if not BotConfig.anthropic_api_key:
        return base
    if not (row["text"] or "").strip():  # чистое медиа — рерайтить нечего
        return base
    return await rewrite_text(base)


def _rewrite_active(row: Mapping[str, Any]) -> bool:
    return bool(BotConfig.anthropic_api_key and (row["text"] or "").strip())


# ════════════════════════════════════════════════════════════════════════════
#  STORAGE  (asyncpg)
# ════════════════════════════════════════════════════════════════════════════
_FETCH_BATCH = """
select id, channel, message_id, posted_at, text, has_media,
       views, reactions_total, forwards, score, review_status
from parsed_posts
where review_status = 'new'
order by score desc
limit $1
"""

_FETCH_ONE = """
select id, channel, message_id, posted_at, text, has_media,
       views, reactions_total, forwards, score, review_status
from parsed_posts
where id = $1
"""

# Помечаем 'sent' только то, что ещё 'new' — защита от гонки между несколькими /review.
_MARK_SENT = "update parsed_posts set review_status='sent' where id = any($1::bigint[]) and review_status='new'"

# Финализируем статус только из необработанных ('new'|'sent') — повторный клик по
# старой кнопке не перезапишет уже опубликованное/отклонённое.
_SET_STATUS = """
update parsed_posts set review_status=$2
where id=$1 and review_status in ('new','sent')
returning id
"""


async def _connect():
    import asyncpg
    return await asyncpg.connect(BotConfig.database_url)


async def fetch_batch(limit: int) -> list[Mapping[str, Any]]:
    conn = await _connect()
    try:
        rows = await conn.fetch(_FETCH_BATCH, limit)
        ids = [r["id"] for r in rows]
        if ids:
            await conn.execute(_MARK_SENT, ids)
        return [dict(r) for r in rows]
    finally:
        await conn.close()


async def fetch_one(post_id: int) -> Mapping[str, Any] | None:
    conn = await _connect()
    try:
        row = await conn.fetchrow(_FETCH_ONE, post_id)
        return dict(row) if row else None
    finally:
        await conn.close()


async def set_status(post_id: int, status: str) -> bool:
    """True — если статус реально сменился (запись была необработанной)."""
    conn = await _connect()
    try:
        res = await conn.fetchrow(_SET_STATUS, post_id, status)
        return res is not None
    finally:
        await conn.close()


# ════════════════════════════════════════════════════════════════════════════
#  HANDLERS  (python-telegram-bot, async)
# ════════════════════════════════════════════════════════════════════════════
def _keyboard(post_id: int):
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Одобрить", callback_data=f"appr:{post_id}"),
        InlineKeyboardButton("❌ Отклонить", callback_data=f"rej:{post_id}"),
    ]])


def _is_owner(update) -> bool:
    user = update.effective_user
    return bool(user and user.id == BotConfig.owner_id)


async def cmd_start(update, context) -> None:
    if not _is_owner(update):
        return
    await update.message.reply_text(
        "Бот ревью виральных постов. /review — прислать топ необработанных постов на ревью."
    )


async def push_review_batch(bot) -> int:
    """Прислать владельцу очередную пачку необработанных постов карточками.
    Общая логика для ручного /review и ежедневного авто-пуша. Возвращает число постов."""
    rows = await fetch_batch(BotConfig.review_batch)
    if not rows:
        return 0
    await bot.send_message(chat_id=BotConfig.owner_id, text=f"На ревью: {len(rows)} постов ↓")
    for row in rows:
        await bot.send_message(
            chat_id=BotConfig.owner_id,
            text=card_text(row),
            reply_markup=_keyboard(row["id"]),
            disable_web_page_preview=False,
        )
    return len(rows)


async def cmd_review(update, context) -> None:
    if not _is_owner(update):
        return
    n = await push_review_batch(context.bot)
    if n == 0:
        await update.message.reply_text("Новых постов на ревью нет.")


async def daily_review_job(context) -> None:
    """JobQueue-колбэк: ежедневный авто-пуш топа на ревью."""
    try:
        n = await push_review_batch(context.bot)
        logger.info("daily review push: %s posts", n)
    except Exception:
        logger.exception("daily review job failed")


async def on_callback(update, context) -> None:
    query = update.callback_query
    if not _is_owner(update):
        await query.answer("Нет доступа.", show_alert=True)
        return
    await query.answer()

    action, _, raw_id = query.data.partition(":")
    post_id = int(raw_id)

    if action == "rej":
        changed = await set_status(post_id, "rejected")
        await query.edit_message_text(
            ("❌ Отклонено.\n\n" if changed else "ℹ️ Уже обработано.\n\n") + (query.message.text or "")
        )
        return

    if action == "appr":
        row = await fetch_one(post_id)
        if row is None:
            await query.edit_message_text("ℹ️ Пост не найден.")
            return
        if row["review_status"] not in ("new", "sent"):
            await query.edit_message_text("ℹ️ Уже обработано.\n\n" + (query.message.text or ""))
            return
        try:
            text_to_publish = await build_publish_text(row)
        except Exception as e:  # рерайт упал — не публикуем чужой текст молча, оставляем кнопки
            logger.exception("rewrite failed for post %s", post_id)
            await query.edit_message_text(
                f"⚠️ Рерайт через Claude не удался: {e}\n\n" + (query.message.text or ""),
                reply_markup=_keyboard(post_id),
            )
            return
        try:
            await context.bot.send_message(chat_id=BotConfig.publish_channel, text=text_to_publish)
        except Exception as e:  # права бота / неверный канал — не теряем статус, сообщаем
            logger.exception("publish failed for post %s", post_id)
            await query.edit_message_text(
                f"⚠️ Не удалось опубликовать: {e}\n\n" + (query.message.text or ""),
                reply_markup=_keyboard(post_id),
            )
            return
        await set_status(post_id, "published")
        note = " (переписано Claude)" if _rewrite_active(row) else ""
        await query.edit_message_text(f"✅ Опубликовано{note}.\n\n" + (query.message.text or ""))


# ════════════════════════════════════════════════════════════════════════════
#  ENTRYPOINT
# ════════════════════════════════════════════════════════════════════════════
def _parse_hhmm(s: str) -> dtime:
    """'06:30' → datetime.time(6, 30, UTC). Бросает ValueError на мусоре."""
    hh, mm = (int(x) for x in s.strip().split(":", 1))
    return dtime(hour=hh, minute=mm, tzinfo=timezone.utc)


def run() -> None:
    BotConfig.validate()
    from telegram.ext import Application, CommandHandler, CallbackQueryHandler

    app = Application.builder().token(BotConfig.token).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("review", cmd_review))
    app.add_handler(CallbackQueryHandler(on_callback))

    if BotConfig.daily_time:
        app.job_queue.run_daily(daily_review_job, time=_parse_hhmm(BotConfig.daily_time))
        logger.info("daily review push scheduled at %s UTC", BotConfig.daily_time)

    logger.info(
        "review-bot started; owner=%s publish_channel=%s rewrite=%s",
        BotConfig.owner_id, BotConfig.publish_channel, bool(BotConfig.anthropic_api_key),
    )
    app.run_polling(allowed_updates=["message", "callback_query"])


def _selftest() -> None:
    """python review_bot.py selftest — проверка чистых функций представления."""
    row = {
        "id": 1, "channel": "smallch", "message_id": 99,
        "posted_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
        "text": "  Как мы выросли x10\nза месяц  ", "has_media": True,
        "views": 4200, "reactions_total": 380, "forwards": 95,
        "score": 40.44, "review_status": "new",
    }
    txt = card_text(row)
    assert "score=40.44" in txt
    assert "https://t.me/smallch/99" in txt
    assert "Как мы выросли x10 за месяц" in txt          # карточка схлопывает пробелы/переводы строк
    # публикация сохраняет авторское форматирование (только trim по краям)
    assert publish_text(row) == "Как мы выросли x10\nза месяц"

    media_only = {**row, "text": ""}
    assert "медиа без текста" in publish_text(media_only)
    assert post_url("@ch", 5) == "https://t.me/ch/5"

    # парсер времени для ежедневного авто-пуша
    assert _parse_hhmm("06:30") == dtime(6, 30, tzinfo=timezone.utc)

    # рерайт выключен (нет ключа) → build_publish_text возвращает verbatim, без сети к Claude
    import asyncio
    BotConfig.anthropic_api_key = ""
    assert asyncio.run(build_publish_text(row)) == "Как мы выросли x10\nза месяц"
    assert _rewrite_active(row) is False

    print(card_text(row))
    print("\nselftest OK")


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "selftest":
        _selftest()
    else:
        run()


if __name__ == "__main__":
    main()
