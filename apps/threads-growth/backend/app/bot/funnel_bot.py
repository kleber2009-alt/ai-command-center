"""Обработчики воронки Threads → Telegram в боте согласования (тот же процесс и
токен, что approval_bot — у бота один getUpdates).

Карточки веток приходят в тему «Threads» форум-группы (FUNNEL_CHAT_ID /
FUNNEL_TOPIC_ID). Кнопки жмут владелец и FUNNEL_EDITOR_IDS.

  ✅ Одобрить   ✏️ Править   🔄 Хук   ♻️ Другая   📎 Материалы   ⏰ Слот   🗑 Пропустить

Правка — ответом на карточку (текст или голос): инструкцией или своей версией
«пост 3: …». Фото ответом на карточку — к посту 1; голос после 📎 — история
в текст. Вне карточек: /plan /stats /story /receiver.
Вступления в канал по ссылкам веток бот видит через chat_member (нужно быть
админом канала).
"""
from __future__ import annotations

import asyncio
import html
import logging
import time
from datetime import datetime, timedelta, timezone

from app.config import settings

logger = logging.getLogger("threads-funnel-bot")

PENDING_TTL = 15 * 60
HELP = (
    "Воронка Threads → Telegram\n"
    "Каждое утро — 3 карточки веток. Кнопки: ✅ ✏️ 🔄 ♻️ 📎 ⏰ 🗑\n"
    "Правка — ответом на карточку текстом или голосом («пост 3: …» — своя версия поста).\n"
    "/plan — темы на завтра\n"
    "/now N — опубликовать ветку №N в Threads прямо сейчас\n"
    "/stats — цифры за неделю\n"
    "/top — что сейчас залетает в Threads (основа планов и прогнозов)\n"
    "/story текст — история или факт в банк (без текста — следующим сообщением или голосом)\n"
    "/receiver t.me/канал/123 описание — добавить пост-приёмник"
)


# ════════════════════════════════════════════════════════════════════════════
#  Доступ и синхронные вызовы сервиса
# ════════════════════════════════════════════════════════════════════════════
def _editor_ids() -> set[int]:
    ids = {settings.owner_telegram_id} if settings.owner_telegram_id else set()
    for part in settings.funnel_editor_ids.split(","):
        part = part.strip()
        if part.lstrip("-").isdigit():
            ids.add(int(part))
    return ids


def _is_editor(update) -> bool:
    user = update.effective_user
    return bool(user and user.id in _editor_ids())


def _in_funnel_chat(update) -> bool:
    chat = update.effective_chat
    if chat is None:
        return False
    if settings.funnel_chat_id:
        return chat.id == settings.funnel_chat_id
    return chat.id == settings.owner_telegram_id


def _tx(fn, *args):
    from app.core.database import session_scope

    with session_scope() as db:
        return fn(db, *args)


def _errors():
    from app.funnel import agents, service
    from app.funnel import telegram_api as tg
    from app.funnel.threads_api import ThreadsError

    return (service.FunnelError, agents.AgentError, tg.TelegramError, ThreadsError)


async def _call(message, fn, *args, progress: str | None = None):
    """Вызов сервиса в потоке; понятные ошибки — ответом в чат, None."""
    if progress:
        await message.reply_text(progress)
    try:
        return await asyncio.to_thread(_tx, fn, *args)
    except _errors() as e:
        await message.reply_text(f"⚠️ {e}")
    except Exception:  # noqa: BLE001
        logger.exception("funnel action failed")
        await message.reply_text("⚠️ Не получилось — подробности в логах бота.")
    return None


async def _say(message, text: str | None, is_html: bool = False) -> None:
    """Ответ в чат (в ту же тему форума). Тексты сервиса — простые, экранируем."""
    if text:
        from telegram import LinkPreviewOptions

        await message.reply_text(text if is_html else html.escape(text), parse_mode="HTML",
                                 link_preview_options=LinkPreviewOptions(is_disabled=True))


def _pending(context) -> dict:
    return context.bot_data.setdefault("funnel_pending", {})


def _set_pending(context, user_id: int, kind: str, item_id: int | None, mode: str) -> None:
    _pending(context)[user_id] = {"kind": kind, "id": item_id, "mode": mode, "until": time.time() + PENDING_TTL}


# ════════════════════════════════════════════════════════════════════════════
#  Кнопки
# ════════════════════════════════════════════════════════════════════════════
async def on_callback(update, context) -> None:
    from app.funnel import cards, service

    q = update.callback_query
    if not _is_editor(update):
        await q.answer("Нет доступа.", show_alert=True)
        return
    try:
        prefix, action, item_id, arg = cards.decode(q.data)
    except ValueError:
        await q.answer()
        return
    msg = q.message
    user_id = update.effective_user.id

    if prefix == "f":
        if action == "no":
            await q.answer("Это старая версия — актуальная карточка ниже.")
            return
        if action == "ok":
            await q.answer("Ставлю в очередь…")
            await _say(msg, await _call(msg, service.approve, item_id))
        elif action == "ed":
            await q.answer()
            _set_pending(context, user_id, "thread", item_id, "edit")
            await msg.reply_text(
                f"✏️ Ветка №{item_id}: ответьте на карточку текстом или голосом — инструкцией "
                "(«короче, без капса в хуке») или своей версией: «пост 3: …». Меняю только это.")
        elif action == "hk":
            await q.answer()
            res = await _call(msg, lambda db, tid: cards.hooks_message(
                service.thread_view(db, service.get_thread(db, tid))), item_id)
            if res:
                text, kb = res
                await msg.reply_text(text, parse_mode="HTML", reply_markup=_markup(kb))
        elif action == "hs":
            await q.answer("Меняю хук…")
            await _say(msg, await _call(msg, service.swap_hook, item_id, arg or 0))
        elif action == "ot":
            await q.answer("Пишу другую ветку…")
            t = await _call(msg, service.replace_thread, item_id,
                            progress=f"♻️ Ветка №{item_id} уходит в запас, пишу новую из другого кластера — 1–2 минуты.")
            if t is not None:
                await msg.reply_text(f"♻️ Новая ветка №{t.id} в тот же слот — карточка выше.")
        elif action == "mt":
            await q.answer()
            _set_pending(context, user_id, "thread", item_id, "materials")
            await _say(msg, (await _call(msg, service.materials_prompt, item_id) or ""))
        elif action == "sl":
            await q.answer()
            options = await _call(msg, service.slot_options, item_id)
            if options:
                text, kb = cards.slots_message(item_id, options)
                await msg.reply_text(text, reply_markup=_markup(kb))
            elif options is not None:
                await msg.reply_text("Свободных слотов в ближайшие дни нет.")
        elif action == "ss":
            await q.answer("Переношу…")
            when = datetime.fromtimestamp((arg or 0) * 60, tz=timezone.utc)
            await _say(msg, await _call(msg, service.move_slot, item_id, when))
            await _drop_keyboard(q)
        elif action == "sk":
            await q.answer("Пропускаю…")
            await _say(msg, await _call(msg, service.skip_thread, item_id))
        return

    if prefix == "r":
        if action == "ok":
            await q.answer("Публикую в канал…")
            await _say(msg, (await _call(msg, service.publish_receiver, item_id) or ""))
        elif action == "ed":
            await q.answer()
            _set_pending(context, user_id, "receiver", item_id, "edit")
            await msg.reply_text(f"✏️ Приёмник №{item_id}: ответьте на карточку — что поменять.")
        elif action == "no":
            await q.answer()
            await _say(msg, (await _call(msg, service.reject_receiver, item_id) or ""))
            await _drop_keyboard(q)
        return

    if prefix == "c":
        if action == "ok":
            await q.answer("Отправляю…")
            await _say(msg, (await _call(msg, service.publish_comment, item_id) or ""))
        elif action == "ed":
            await q.answer()
            _set_pending(context, user_id, "comment", item_id, "edit")
            await msg.reply_text("✏️ Ответьте на карточку своим текстом ответа — заменю черновик.")
        elif action == "no":
            await q.answer()
            await _call(msg, service.skip_comment, item_id)
            await _drop_keyboard(q)


def _markup(kb: dict):
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup

    return InlineKeyboardMarkup([[InlineKeyboardButton(b["text"], callback_data=b["callback_data"]) for b in row]
                                 for row in kb.get("inline_keyboard", [])])


async def _drop_keyboard(q) -> None:
    try:
        await q.edit_message_reply_markup(reply_markup=None)
    except Exception:  # noqa: BLE001 — сообщение могло уже измениться
        pass


# ════════════════════════════════════════════════════════════════════════════
#  Ответы на карточки: текст, голос, фото
# ════════════════════════════════════════════════════════════════════════════
def _lookup(db, message_id: int):
    from app.funnel import service

    kind, obj = service.find_by_message(db, message_id)
    return (kind, obj.id) if obj is not None else (None, None)


def _transcribe(file_id: str) -> str:
    from app.funnel import stt
    from app.funnel import telegram_api as tg

    data, path = tg.get_file_bytes(file_id)
    return stt.transcribe(data, filename=path.rsplit("/", 1)[-1] or "voice.ogg")


async def on_message(update, context) -> None:
    from app.funnel import service

    if not _is_editor(update) or not _in_funnel_chat(update):
        return
    msg = update.effective_message
    user_id = update.effective_user.id
    pending = _pending(context)
    p = pending.get(user_id)
    if p and p["until"] < time.time():
        pending.pop(user_id, None)
        p = None

    ref = None
    if msg.reply_to_message:
        kind, item_id = await asyncio.to_thread(_tx, _lookup, msg.reply_to_message.message_id)
        if kind:
            mode = p["mode"] if p and p["kind"] == kind and p["id"] == item_id else "edit"
            ref = {"kind": kind, "id": item_id, "mode": mode}
    if ref is None and p:
        ref = p
    if ref is None:
        return

    if msg.photo:
        if ref["kind"] != "thread":
            return
        await _say(msg, (await _call(msg, service.attach_photo, ref["id"], msg.photo[-1].file_id) or ""))
        return

    text = msg.text or msg.caption or ""
    voice = msg.voice or msg.audio
    if voice:
        try:
            text = await asyncio.to_thread(_transcribe, voice.file_id)
        except Exception as e:  # noqa: BLE001
            await msg.reply_text(f"⚠️ Голос не распознан: {e}")
            return
        await msg.reply_text(f"🎙 Распознал: «{text[:500]}»")
    text = text.strip()
    if not text:
        return
    pending.pop(user_id, None)

    kind, item_id, mode = ref["kind"], ref["id"], ref["mode"]
    if kind == "story":
        row = await _call(msg, service.add_fact, text, "story", "voice" if voice else "story")
        if row is not None:
            await msg.reply_text("📚 Записал в банк историй — агент возьмёт это в ветки.")
    elif kind == "thread" and mode == "materials":
        await _say(msg, (await _call(msg, service.weave_story, item_id, text,
                                                progress="🧵 Вплетаю историю в ветку…") or ""))
    elif kind == "thread":
        await _say(msg, (await _call(msg, service.apply_edit, item_id, text,
                                                progress=f"✏️ Правлю ветку №{item_id}…") or ""))
    elif kind == "receiver":
        await _say(msg, (await _call(msg, service.edit_receiver, item_id, text,
                                                progress=f"✏️ Правлю приёмник №{item_id}…") or ""))
    elif kind == "comment":
        await _say(msg, (await _call(msg, service.set_comment_draft, item_id, text) or ""))


# ════════════════════════════════════════════════════════════════════════════
#  Команды
# ════════════════════════════════════════════════════════════════════════════
async def cmd_funnel(update, context) -> None:
    if _is_editor(update):
        await update.effective_message.reply_text(HELP)


async def cmd_plan(update, context) -> None:
    from app.funnel import service

    if not _is_editor(update):
        return
    day = service.local_today() + timedelta(days=1)
    text = await _call(update.effective_message,
                       lambda db: service.plan_text(db, day, service.plan_day(db, day)),
                       progress="🗓 Собираю темы на завтра…")
    await _say(update.effective_message, text, is_html=True)


async def cmd_now(update, context) -> None:
    from app.funnel import jobs, service

    if not _is_editor(update):
        return
    msg = update.effective_message
    if not context.args or not context.args[0].lstrip("№#").isdigit():
        await msg.reply_text("Формат: /now 4 — номер ветки с карточки.")
        return
    tid = int(context.args[0].lstrip("№#"))
    res = await _call(msg, service.queue_now, tid)
    if res != "queued":
        if res:
            await _say(msg, res)
        return
    await msg.reply_text(f"🚀 Публикую ветку №{tid} в Threads…")
    out = await asyncio.to_thread(jobs.run, "publish")
    status = (out.get("due") or {}).get(tid) or out.get("skipped") or out.get("error") or "нет результата"
    if status != "published":
        await msg.reply_text(f"⚠️ Ветка №{tid}: {status}")


async def cmd_stats(update, context) -> None:
    from app.funnel import service

    if not _is_editor(update):
        return
    day = service.local_today() + timedelta(days=1)   # включая сегодня
    await _say(update.effective_message,
               await _call(update.effective_message, service.weekly, day, False), is_html=True)


async def cmd_top(update, context) -> None:
    """Что сейчас залетает: топ хитов из исследования (основа планов и прогнозов)."""
    from app.funnel import service

    if not _is_editor(update):
        return
    await _say(update.effective_message, await _call(update.effective_message,
                                                     lambda db: service.research_text(db, None, 10)), is_html=True)


async def cmd_story(update, context) -> None:
    from app.funnel import service

    if not _is_editor(update):
        return
    text = " ".join(context.args or []).strip()
    if not text:
        _set_pending(context, update.effective_user.id, "story", None, "story")
        await update.effective_message.reply_text("📚 Расскажите историю или факт — текстом или голосом следующим сообщением.")
        return
    row = await _call(update.effective_message, service.add_fact, text, "story", "story")
    if row is not None:
        await update.effective_message.reply_text("📚 Записал в банк историй.")


async def cmd_receiver(update, context) -> None:
    from app.funnel import service

    if not _is_editor(update):
        return
    args = context.args or []
    if not args:
        await update.effective_message.reply_text(
            "Добавить пост-приёмник: /receiver t.me/канал/123 что внутри (промпты, инструкция, ассистент) и к каким темам")
        return
    r = await _call(update.effective_message, service.add_receiver, args[0], " ".join(args[1:]),
                    progress="📥 Добавляю приёмник…")
    if r is not None:
        await update.effective_message.reply_text(
            f"📥 Приёмник №{r.id} «{r.title}» в библиотеке. Кластеры: {', '.join(map(str, r.clusters)) or 'любые'}.")


async def on_chat_member(update, context) -> None:
    """Вступление в канал по ссылке-приглашению ветки → подписка засчитывается ветке."""
    from app.funnel import service

    cm = update.chat_member
    if cm is None or not settings.channel_id or cm.chat.id != settings.channel_id:
        return
    if cm.invite_link is None or cm.new_chat_member.status != "member":
        return
    if cm.old_chat_member.status in ("member", "administrator", "creator"):
        return
    try:
        await asyncio.to_thread(_tx, service.record_join, cm.invite_link.invite_link, cm.new_chat_member.user.id)
    except Exception:  # noqa: BLE001
        logger.exception("record_join failed")


def register(app) -> None:
    """Подключить обработчики воронки к Application (до общих обработчиков)."""
    from telegram.ext import (
        CallbackQueryHandler,
        ChatMemberHandler,
        CommandHandler,
        MessageHandler,
        filters,
    )

    app.add_handler(CallbackQueryHandler(on_callback, pattern=r"^[frc]:"))
    app.add_handler(CommandHandler("funnel", cmd_funnel))
    app.add_handler(CommandHandler("plan", cmd_plan))
    app.add_handler(CommandHandler("now", cmd_now))
    app.add_handler(CommandHandler("stats", cmd_stats))
    app.add_handler(CommandHandler("top", cmd_top))
    app.add_handler(CommandHandler("story", cmd_story))
    app.add_handler(CommandHandler("receiver", cmd_receiver))
    app.add_handler(ChatMemberHandler(on_chat_member, ChatMemberHandler.CHAT_MEMBER))
    app.add_handler(MessageHandler(
        (filters.TEXT & ~filters.COMMAND) | filters.VOICE | filters.AUDIO | filters.PHOTO, on_message))
