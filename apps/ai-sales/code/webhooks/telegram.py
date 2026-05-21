"""
Telegram webhook handler — production-ready.

Pipeline:

    INCOMING (от клиента):
        text          → flow.run_flow → response
        voice         → tg.download → media.voice_to_text → flow → response
        video_note    → tg.download → media.voice_to_text → flow → response
        document      → ack + flag for human

    OUTGOING (ответ):
        action=text    → tg.send_text
        action=voice   → media.text_to_voice → tg.send_voice
        action=circle  → media.text_to_voice → wav2lip.audio_to_circle → tg.send_video_note
        action=escalate → notify_ilya, no client response

Включает имитацию человеческой задержки + typing-indicator.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    from fastapi import APIRouter, Header, HTTPException, Request, BackgroundTasks
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

from agents import run_flow
from services import tg_client as tg
from services import media, wav2lip

log = logging.getLogger("aisales.tg.webhook")

router = APIRouter(prefix="/webhooks/telegram", tags=["telegram"]) if HAS_FASTAPI else None

WEBHOOK_SECRET = os.getenv("TG_WEBHOOK_SECRET", "")
ILYA_CHAT_ID = int(os.getenv("ILYA_TG_CHAT_ID", "0") or 0)

# Реалистичная задержка ответа — имитация человека (используется как «пауза перед началом печати»)
RESPONSE_DELAY_MIN_S = float(os.getenv("RESPONSE_DELAY_MIN_S", "30"))
RESPONSE_DELAY_MAX_S = float(os.getenv("RESPONSE_DELAY_MAX_S", "120"))

# Debounce-буфер: если клиент шлёт серию сообщений подряд — ждём пока он закончит,
# потом обрабатываем все накопленные тексты ОДНИМ inference'ом и отвечаем одним блоком.
# MIN — сколько ждать после последнего сообщения (без новых = flush).
# MAX — потолок суммарного ожидания от первого сообщения.
DEBOUNCE_MIN_S = float(os.getenv("DEBOUNCE_MIN_S", "30"))
DEBOUNCE_MAX_S = float(os.getenv("DEBOUNCE_MAX_S", "90"))

# ============ Per-chat сериализация (advisory lock в Postgres) ============
# uvicorn запускается с --workers 2, asyncio.Lock не покрывает оба процесса.
# pg_advisory_lock(key) ставит блокировку на уровне коннекта — оба воркера её видят.

@asynccontextmanager
async def _chat_lock(chat_id: int):
    """Сериализует обработку сообщений одного чата. Без лока — параллельные ответы."""
    try:
        from services.db_memory import _asyncpg_kwargs
        import asyncpg
        conn = await asyncpg.connect(**_asyncpg_kwargs())
    except Exception as e:
        log.warning("tg · chat_lock unavailable (%s) — обрабатываю без сериализации", e)
        yield
        return
    key = chat_id & 0x7FFFFFFFFFFFFFFF  # bigint-safe
    try:
        await conn.execute("SELECT pg_advisory_lock($1)", key)
        try:
            yield
        finally:
            try:
                await conn.execute("SELECT pg_advisory_unlock($1)", key)
            except Exception:
                pass
    finally:
        await conn.close()


# ============ Owner-only режимы (через /tmp флаги) ============

VOICE_INPUT_DIR = Path(os.getenv("VOICE_INPUT_DIR", "/voice-input"))
VOICE_AUDIO_DIR = VOICE_INPUT_DIR / "audio"
VOICE_TRANSCRIPTS_DIR = VOICE_INPUT_DIR / "transcripts"
TEACHING_FLAG = Path("/tmp/aisales-teaching-mode")
VOICE_FORCE_FLAG = Path("/tmp/aisales-voice-force")

# Трекинг «1 кружок на 1 чат»: множество chat_id, которым уже отправили кружок
_CIRCLE_SENT_CHATS: set[int] = set()
_CIRCLE_SENT_FILE = Path("/tmp/aisales-circle-sent.txt")

def _circle_already_sent(chat_id: int) -> bool:
    if chat_id in _CIRCLE_SENT_CHATS:
        return True
    if _CIRCLE_SENT_FILE.exists():
        for line in _CIRCLE_SENT_FILE.read_text().splitlines():
            try:
                _CIRCLE_SENT_CHATS.add(int(line.strip()))
            except ValueError:
                pass
    return chat_id in _CIRCLE_SENT_CHATS

def _mark_circle_sent(chat_id: int) -> None:
    _CIRCLE_SENT_CHATS.add(chat_id)
    with _CIRCLE_SENT_FILE.open("a") as f:
        f.write(f"{chat_id}\n")


def _is_owner(chat_id: int) -> bool:
    return ILYA_CHAT_ID and chat_id == ILYA_CHAT_ID


def _is_teaching() -> bool:
    return TEACHING_FLAG.exists()


def _is_voice_forced() -> bool:
    return VOICE_FORCE_FLAG.exists()


def _voice_count() -> int:
    if not VOICE_AUDIO_DIR.exists():
        return 0
    return sum(1 for _ in VOICE_AUDIO_DIR.glob("*") if _.is_file())


async def _handle_owner_command(chat_id: int, text: str) -> bool:
    """Обработать команду от Ильи. Возвращает True если команда обработана."""
    cmd = text.strip().lower()

    if cmd == "/me":
        await tg.send_text(chat_id, (
            f"`chat_id`: {chat_id}\n"
            f"`is_owner`: True\n"
            f"`teaching`: {_is_teaching()}\n"
            f"`voice_force`: {_is_voice_forced()}\n"
            f"`voice_count`: {_voice_count()}"
        ))
        return True

    if cmd == "/help":
        await tg.send_text(chat_id, (
            "*Команды владельца*\n\n"
            "`/me` — мой chat_id и статусы\n"
            "`/teach on` — все мои voice/text идут в копилку обучения, агент не отвечает\n"
            "`/teach off` — обычный режим, агент общается со мной как с клиентом\n"
            "`/voice on` — форсить ответы голосом (нужен ElevenLabs)\n"
            "`/voice off` — только текст\n"
            "`/profile` — что в копилке обучения\n"
            "`/analyze` — прогнать voice_analyzer прямо сейчас\n"
            "`/reload_prompts` — перечитать agent-prompts/ файлы\n"
            "`/newbot <name>` — создать бота для клиента\n"
            "`/settoken <id> <token>` — задать токен бота\n"
            "`/listbots` — список всех ботов клиентов"
        ))
        return True

    if cmd == "/teach on":
        TEACHING_FLAG.touch()
        VOICE_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        VOICE_TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
        await tg.send_text(chat_id, (
            "✓ *Teaching mode ON*\n\n"
            "Шли мне голосовые / кружочки / текстовые сообщения — "
            "буду сохранять как образцы стиля.\n\n"
            "Каждые 5 голосовых автоматически прогоню voice\\_analyzer "
            "и обновлю промпт.\n\n"
            "Чтобы выключить: /teach off"
        ))
        return True

    if cmd == "/teach off":
        TEACHING_FLAG.unlink(missing_ok=True)
        await tg.send_text(chat_id, "✓ *Teaching mode OFF*. Снова отвечаю как обычно.")
        return True

    if cmd == "/voice on":
        VOICE_FORCE_FLAG.touch()
        await tg.send_text(chat_id, "✓ *Voice forced ON*. Буду отвечать голосом.")
        return True

    if cmd == "/voice off":
        VOICE_FORCE_FLAG.unlink(missing_ok=True)
        await tg.send_text(chat_id, "✓ *Voice forced OFF*. Только текст.")
        return True

    if cmd == "/profile":
        count = _voice_count()
        transcripts = list(VOICE_TRANSCRIPTS_DIR.glob("*.txt")) if VOICE_TRANSCRIPTS_DIR.exists() else []
        total_chars = sum(p.stat().st_size for p in transcripts)
        profile_json = VOICE_INPUT_DIR / "analysis" / "voice-profile.json"
        has_profile = profile_json.exists()
        await tg.send_text(chat_id, (
            f"*Voice profile status*\n\n"
            f"Аудио в копилке: *{count}*\n"
            f"Транскриптов: *{len(transcripts)}* ({total_chars} символов)\n"
            f"Voice profile JSON: *{'есть' if has_profile else 'нет'}*\n\n"
            f"Запусти /analyze когда наберётся 3-5 голосовых."
        ))
        return True

    if cmd == "/analyze":
        await tg.send_text(chat_id, "🤖 Запускаю voice_analyzer в фоне... (~30 секунд)")
        asyncio.create_task(_run_voice_analyzer(chat_id))
        return True

    if cmd == "/reload_prompts":
        # Перечитать промпты — модули кэшируют их при импорте, нужен restart.
        # Но мы попробуем перечитать через importlib.
        try:
            from agents import prompts_loader
            import importlib
            importlib.reload(prompts_loader)
            await tg.send_text(chat_id, "✓ Промпты перечитаны (или будут на следующем запросе).")
        except Exception as e:
            await tg.send_text(chat_id, f"⚠ Не удалось: {e}")
        return True

    # /newbot <name>
    if text.strip().lower().startswith("/newbot "):
        name = text.strip()[len("/newbot "):].strip()
        if not name:
            await tg.send_text(chat_id, "Укажи имя: `/newbot Моя Компания`")
            return True
        try:
            from services.db_memory import _asyncpg_kwargs
            import asyncpg
            conn = await asyncpg.connect(**_asyncpg_kwargs())
            row = await conn.fetchrow(
                "INSERT INTO bot_tenants (name, bot_token, owner_tg_chat_id) "
                "VALUES ($1, 'PLACEHOLDER', $2) RETURNING id::text, name",
                name, chat_id,
            )
            await conn.close()
            tid = row["id"]
            await tg.send_text(chat_id, (
                f"✓ Тенант создан\n\n"
                f"Имя: *{row['name']}*\n"
                f"ID: `{tid}`\n\n"
                f"Следующий шаг — задай токен бота:\n"
                f"`/settoken {tid} <BOT_TOKEN>`"
            ))
        except Exception as e:
            await tg.send_text(chat_id, f"⚠ Ошибка: {e}")
        return True

    # /settoken <tenant_id> <token>
    parts = text.strip().split(None, 2)
    if len(parts) == 3 and parts[0].lower() == "/settoken":
        tid, token = parts[1], parts[2]
        try:
            from services.db_memory import _asyncpg_kwargs
            import asyncpg
            conn = await asyncpg.connect(**_asyncpg_kwargs())
            result = await conn.execute(
                "UPDATE bot_tenants SET bot_token = $1 WHERE id = $2::uuid",
                token, tid,
            )
            await conn.close()
            if "1" in result:
                host = _os.getenv("WEBHOOK_BASE_URL", "https://dashboard.46-62-215-11.nip.io")
                wh_url = f"{host}/webhooks/tenant/{tid}"
                await tg.send_text(chat_id, (
                    f"✓ Токен сохранён.\n\n"
                    f"Зарегистрируй webhook командой на сервере:\n"
                    f"```\ncurl -X POST \"https://api.telegram.org/bot{token}/setWebhook\" "
                    f"-d \"url={wh_url}\"\n```"
                ))
            else:
                await tg.send_text(chat_id, f"⚠ Тенант `{tid}` не найден.")
        except Exception as e:
            await tg.send_text(chat_id, f"⚠ Ошибка: {e}")
        return True

    # /listbots
    if cmd == "/listbots":
        try:
            from services.db_memory import _asyncpg_kwargs
            import asyncpg
            conn = await asyncpg.connect(**_asyncpg_kwargs())
            rows = await conn.fetch(
                "SELECT id::text, name, kb_collection, is_active, "
                "(system_prompt != '' AND system_prompt IS NOT NULL) as has_prompt "
                "FROM bot_tenants ORDER BY created_at DESC LIMIT 20"
            )
            await conn.close()
            if not rows:
                await tg.send_text(chat_id, "Нет тенантов. Создай: `/newbot Имя компании`")
            else:
                lines = ["*Боты клиентов*\n"]
                for r in rows:
                    status = "🟢" if r["is_active"] else "🔴"
                    prompt_icon = "📝" if r["has_prompt"] else "📋"
                    kb_icon = "📚" if r["kb_collection"] else "📂"
                    lines.append(f"{status} *{r['name']}* {prompt_icon}{kb_icon}\n`{r['id']}`")
                await tg.send_text(chat_id, "\n\n".join(lines))
        except Exception as e:
            await tg.send_text(chat_id, f"⚠ Ошибка: {e}")
        return True

    return False  # не команда


async def _save_voice_sample(parsed: dict, audio_path: Path) -> None:
    """Сохранить голосовое в копилку + транскрибировать."""
    if not audio_path or not audio_path.exists():
        return

    # Перенос в постоянное место с осмысленным именем
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    dst = VOICE_AUDIO_DIR / f"sample-{timestamp}{audio_path.suffix}"
    audio_path.rename(dst)
    log.info("teaching · saved voice sample %s", dst.name)

    # Транскрибируем
    try:
        transcript = await media.voice_to_text(dst)
        transcript_path = VOICE_TRANSCRIPTS_DIR / f"sample-{timestamp}.txt"
        transcript_path.write_text(transcript, encoding="utf-8")
        log.info("teaching · transcribed (%d chars) → %s", len(transcript), transcript_path.name)
        return transcript
    except Exception as e:
        log.exception("teaching · transcribe failed: %s", e)
        return None


async def _send_text_chunks(chat_id: int, text: str, initial_typing: float = 3.0) -> None:
    """Отправить ответ как 1-3 коротких сообщения подряд (естественная переписка).
    Разбиваем по двойному переносу строки. Если получилось одно — шлём как есть."""
    if not text:
        return
    raw_chunks = [c.strip() for c in text.split("\n\n") if c.strip()]
    # Если разбиение даёт слишком много мелких — склеиваем избыток в последний чанк (макс 3).
    if len(raw_chunks) > 3:
        head = raw_chunks[:2]
        tail = "\n\n".join(raw_chunks[2:])
        raw_chunks = head + [tail]
    # Если только 1 чанк — отправляем без задержек между (нет «между»).
    if len(raw_chunks) <= 1:
        await tg.send_typing_burst(chat_id, max(initial_typing, 2.0))
        await tg.send_text(chat_id, raw_chunks[0] if raw_chunks else text)
        return
    # Несколько чанков — короткое typing + send, между — пауза «на ввод следующего»
    for i, chunk in enumerate(raw_chunks):
        if i > 0:
            inter = min(6.0, 1.5 + len(chunk) / 80.0)
            await tg.send_chat_action(chat_id, "typing")
            await asyncio.sleep(inter)
        else:
            await tg.send_typing_burst(chat_id, max(initial_typing, 2.0))
        await tg.send_text(chat_id, chunk)


async def _collect_owner_sample_bg(file_id: str, kind: str) -> None:
    """Фоновое: скачать voice/circle от owner'а, транскрибировать, добавить в копилку.
    Каждые 5 новых сэмплов авто-запускает voice_analyzer для обновления voice-profile."""
    try:
        VOICE_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        VOICE_TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
        tmp_path = await tg.download_file(file_id, Path("/tmp"))
        if not tmp_path or not tmp_path.exists():
            return
        await _save_voice_sample({"media_type": kind}, tmp_path)
        count = _voice_count()
        log.info("owner sample collected · kind=%s · total=%d", kind, count)
        # Каждые 5 сэмплов — обновляем voice profile
        if count > 0 and count % 5 == 0:
            log.info("auto-running voice_analyzer (count=%d)", count)
            import subprocess
            subprocess.Popen(
                ["python", "-m", "utils.voice_analyzer"],
                cwd="/app",
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
    except Exception as e:
        log.exception("owner sample collect failed: %s", e)


async def _run_voice_analyzer(chat_id: int) -> None:
    """Запустить voice_analyzer в фоне и уведомить."""
    import subprocess
    try:
        result = subprocess.run(
            ["python", "-m", "utils.voice_analyzer"],
            cwd="/app",
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode == 0:
            # Парсим последние строки чтобы извлечь summary
            tail = "\n".join(result.stdout.strip().split("\n")[-10:])
            await tg.send_text(chat_id, f"✓ Voice analyzer завершён:\n```\n{tail}\n```")
        else:
            err = result.stderr[-300:] if result.stderr else "?"
            await tg.send_text(chat_id, f"⚠ Voice analyzer упал:\n```\n{err}\n```")
    except subprocess.TimeoutExpired:
        await tg.send_text(chat_id, "⚠ Voice analyzer таймаут (120с)")
    except Exception as e:
        await tg.send_text(chat_id, f"⚠ Не удалось запустить: {e}")


# ============ Webhook entry ============

if HAS_FASTAPI and router:

    @router.post("")
    async def receive(
        request: Request,
        background: BackgroundTasks,
        x_telegram_bot_api_secret_token: str = Header(default=""),
    ):
        """Telegram бьёт сюда. Отвечаем 200 моментально, агента запускаем в background."""
        if WEBHOOK_SECRET and x_telegram_bot_api_secret_token != WEBHOOK_SECRET:
            raise HTTPException(status_code=401, detail="Invalid secret token")

        body = await request.body()
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return {"ok": False, "error": "invalid json"}

        # Отдаём управление сразу — обработка в фоне (TG ждёт 200 в течение 60 сек)
        background.add_task(handle_update, payload)
        return {"ok": True}


# ============ Pipeline ============

# ============ Debounce-буфер per-chat ============
# chat_id -> {"texts": [str, ...], "first_at": float, "task": Task, "parsed": last_parsed}
# Работает в одном uvicorn-процессе (compose: workers=1).

_PENDING: dict[int, dict] = {}
_PENDING_LOCK = asyncio.Lock()


async def _enqueue_message(chat_id: int, text: str, parsed: dict) -> None:
    """Добавить текст клиента в буфер; перезапустить таймер flush."""
    loop = asyncio.get_event_loop()
    now = loop.time()
    async with _PENDING_LOCK:
        entry = _PENDING.get(chat_id)
        if entry is None:
            entry = {"texts": [], "first_at": now, "task": None, "parsed": parsed}
            _PENDING[chat_id] = entry
        entry["texts"].append(text)
        entry["parsed"] = parsed  # последний parsed — для metadata (username и т.п.)
        # Отменяем предыдущий таймер flush, ставим новый
        if entry["task"] and not entry["task"].done():
            entry["task"].cancel()
        elapsed = now - entry["first_at"]
        remaining_cap = max(DEBOUNCE_MAX_S - elapsed, 0)
        wait = min(DEBOUNCE_MIN_S, remaining_cap) if remaining_cap > 0 else 0
        log.info("tg · buffered · chat=%s · pending=%d · wait=%.1fs",
                 chat_id, len(entry["texts"]), wait)
        entry["task"] = asyncio.create_task(_flush_after(chat_id, wait))


async def _flush_after(chat_id: int, wait: float) -> None:
    """Подождать `wait` секунд, потом обработать накопленный буфер."""
    try:
        if wait > 0:
            await asyncio.sleep(wait)
    except asyncio.CancelledError:
        return
    async with _PENDING_LOCK:
        entry = _PENDING.pop(chat_id, None)
    if not entry:
        return
    merged = "\n".join(t for t in entry["texts"] if t).strip()
    if not merged:
        return
    parsed = dict(entry["parsed"])
    parsed["text"] = merged
    parsed["media_type"] = "text"  # уже всё транскрибировано
    log.info("tg · flush · chat=%s · merged=%d msgs · chars=%d",
             chat_id, len(entry["texts"]), len(merged))
    try:
        async with _chat_lock(chat_id):
            await _handle_update_locked(parsed)
    except Exception as e:
        log.exception("tg · flush failed: %s", e)


async def handle_update(payload: dict) -> dict:
    """Webhook entry. Команды/start обрабатываем сразу; клиентские сообщения буферизуем."""
    parsed = parse_tg_update(payload)
    if not parsed:
        log.debug("tg · ignored update %s", payload.get("update_id"))
        return {"status": "ignored"}

    chat_id = parsed["chat_id"]
    log.info("tg · receive · chat=%s · type=%s · owner=%s · teaching=%s",
             chat_id, parsed["media_type"], _is_owner(chat_id), _is_teaching())

    # ============ Мгновенная обработка (вне буфера) ============

    # Owner-команды
    if _is_owner(chat_id) and parsed["text"].startswith("/"):
        async with _chat_lock(chat_id):
            handled = await _handle_owner_command(chat_id, parsed["text"])
            if handled:
                return {"status": "owner_command", "cmd": parsed["text"]}

    # Voice/circle от owner — копим в обучающую папку в фоне (не блокирует)
    if _is_owner(chat_id) and parsed["media_type"] in ("voice", "circle"):
        file_id = parsed.get("voice_file_id") or parsed.get("video_note_file_id")
        if file_id:
            asyncio.create_task(_collect_owner_sample_bg(file_id, parsed["media_type"]))

    # /start — мгновенный ответ
    if parsed["text"].startswith("/start"):
        async with _chat_lock(chat_id):
            await tg.send_text(
                chat_id,
                "Здравствуйте. Расскажите в двух словах что у вас сейчас и куда хотите прийти. Подскажу что у меня есть."
            )
        return {"status": "started"}

    # ============ Буферизация (transcribe voice/circle сразу, текст складываем) ============

    transcribed_text = parsed["text"]
    if parsed["media_type"] in ("voice", "circle"):
        file_id = parsed.get("voice_file_id") or parsed.get("video_note_file_id")
        if file_id:
            try:
                audio_path = await tg.download_file(file_id, Path("/tmp"))
                if audio_path and audio_path.stat().st_size > 0:
                    transcribed_text = await media.voice_to_text(audio_path)
                    log.info("tg · transcribed (%d chars)", len(transcribed_text))
                else:
                    transcribed_text = "[VOICE — не удалось транскрибировать]"
            except Exception as e:
                log.exception("tg · transcribe error: %s", e)
                transcribed_text = f"[VOICE — ошибка транскрипции: {e}]"

    await _enqueue_message(chat_id, transcribed_text, parsed)
    return {"status": "buffered"}


async def _handle_update_locked(parsed: dict) -> dict:
    chat_id = parsed["chat_id"]
    transcribed_text = parsed["text"]

    # db context (conversation memory)
    db_ctx = None
    try:
        from services.db_memory import get_or_create_client, get_or_create_conversation, load_history
        cl = await get_or_create_client(
            int(chat_id),
            tg_username=parsed.get("username"),
            display_name=parsed.get("first_name"),
        )
        if cl:
            cv = await get_or_create_conversation(cl["id"], "tg")
            hist = await load_history(cv["id"], limit=10) if cv else []
            db_ctx = {"db_client_id": cl["id"], "db_conversation_id": cv.get("id"), "history": hist}
    except Exception as _e:
        log.warning("tg . db_ctx failed: %s", _e)

    # Запускаем агентский flow
    result = run_flow(
        client_id=f"tg:{chat_id}",
        channel="tg",
        message=transcribed_text,
        raw_payload=parsed["raw"],
        conversation_context=db_ctx,
    )

    # Эскалация — пингуем Илью, клиенту тишина (или вежливый ack)
    if result.get("needs_escalation"):
        await _notify_ilya_about_escalation(chat_id, parsed, result)
        # Опционально: краткий ack клиенту
        await tg.send_text(chat_id, "Получил. Сейчас отвечу лично — буквально пару минут.")
        return {"status": "escalated", "reason": result.get("escalation_reason")}

    # save to DB
    if db_ctx and db_ctx.get("db_client_id") and db_ctx.get("db_conversation_id"):
        try:
            from services.db_memory import save_exchange
            await save_exchange(
                db_ctx["db_conversation_id"],
                db_ctx["db_client_id"],
                transcribed_text,
                result.get("response_text", ""),
                result,
            )
        except Exception as _e:
            log.warning("tg . save_exchange failed: %s", _e)

    # Мы уже подождали debounce — длинную «человеческую» задержку не дублируем.
    # Оставляем только короткое typing для естественности.
    delay = max(2.0, min(8.0, random.uniform(RESPONSE_DELAY_MIN_S, RESPONSE_DELAY_MAX_S) * 0.15))
    log.info("tg · pre-reply typing %.1fs", delay)

    action = result.get("response_action", "text")
    response_text = result.get("response_text", "")

    if action == "text":
        # Разбиваем ответ на несколько TG-сообщений по двойному переносу строки,
        # чтобы выглядело как живая переписка (короткие сообщения подряд).
        await _send_text_chunks(chat_id, response_text, initial_typing=delay)

    elif action == "voice":
        # Сначала задержка как «думает», потом «записывает голосовое»
        await asyncio.sleep(delay * 0.5)
        await tg.send_chat_action(chat_id, "record_voice")
        try:
            voice_file = await media.text_to_voice(response_text, target_format="ogg")
            target_dur = result.get("media_duration_target_s", 30)
            await tg.send_chat_action(chat_id, "upload_voice")
            await tg.send_voice(chat_id, voice_file, duration=target_dur)
        except Exception as e:
            log.exception("tg · voice generation failed, fallback to text: %s", e)
            await tg.send_text(chat_id, response_text)

    elif action == "circle":
        if _circle_already_sent(chat_id):
            # Правило: 1 кружок на 1 чат — следующие голосом
            log.info("tg · circle already sent to chat %s — downgrade to voice", chat_id)
            action = "voice"
        if action == "circle":
            await asyncio.sleep(delay * 0.4)
            await tg.send_chat_action(chat_id, "record_video_note")
            try:
                voice_file = await media.text_to_voice(response_text, target_format="mp3")
                circle_file = await wav2lip.audio_to_circle(voice_file)
                target_dur = result.get("media_duration_target_s", 30)
                await tg.send_chat_action(chat_id, "upload_video_note")
                await tg.send_video_note(chat_id, circle_file, duration=target_dur)
                _mark_circle_sent(chat_id)
            except Exception as e:
                log.exception("tg · circle generation failed, fallback to voice: %s", e)
                action = "voice"
        if action == "voice" and response_text:
            try:
                voice_file = await media.text_to_voice(response_text, target_format="ogg")
                await tg.send_voice(chat_id, voice_file)
            except Exception:
                await tg.send_text(chat_id, response_text)

    else:
        # Unknown action — fallback на текст
        await tg.send_text(chat_id, response_text)

    return {
        "status": "responded",
        "action": action,
        "action_reason": result.get("action_reason"),
        "stage": result.get("current_stage"),
        "latency_ms": result.get("latency_ms"),
    }


# ============ Parsing ============

def parse_tg_update(payload: dict) -> dict | None:
    """Распарсить TG update payload."""
    message = payload.get("message") or payload.get("edited_message")
    if not message:
        return None
    try:
        chat_id = message["chat"]["id"]
        from_user = message.get("from", {})
        base = {
            "chat_id": chat_id,
            "username": from_user.get("username"),
            "first_name": from_user.get("first_name"),
            "language": from_user.get("language_code"),
            "raw": payload,
        }

        if "text" in message:
            return {**base, "text": message["text"], "media_type": "text"}
        if "voice" in message:
            return {
                **base,
                "text": "",
                "media_type": "voice",
                "voice_file_id": message["voice"]["file_id"],
                "voice_duration": message["voice"]["duration"],
            }
        if "video_note" in message:
            return {
                **base,
                "text": "",
                "media_type": "circle",
                "video_note_file_id": message["video_note"]["file_id"],
                "video_note_duration": message["video_note"].get("duration"),
            }
        if "audio" in message:
            return {
                **base,
                "text": "",
                "media_type": "voice",
                "voice_file_id": message["audio"]["file_id"],
                "voice_duration": message["audio"].get("duration"),
            }
        if "document" in message:
            return {
                **base,
                "text": f"[FILE: {message['document'].get('file_name', '?')}]",
                "media_type": "document",
                "document_file_id": message["document"]["file_id"],
            }
        if "photo" in message:
            # Самое большое разрешение
            photo = message["photo"][-1]
            return {
                **base,
                "text": message.get("caption", "[PHOTO]"),
                "media_type": "photo",
                "photo_file_id": photo["file_id"],
            }
    except (KeyError, IndexError) as e:
        log.warning("tg · parse error: %s · payload=%s", e, str(payload)[:200])
    return None


# ============ Escalation alert to Ilya ============

async def _notify_ilya_about_escalation(client_chat_id: int, parsed: dict, result: dict) -> None:
    """Уведомить Илью через его личный TG (ILYA_TG_CHAT_ID)."""
    if not ILYA_CHAT_ID:
        log.warning("ILYA_TG_CHAT_ID не настроен — эскалация без алерта")
        return

    reason = result.get("escalation_reason", "?")
    urgency = result.get("escalation_urgency", "?")
    user = parsed.get("username") or parsed.get("first_name") or "?"

    text = (
        f"⚠ *Эскалация* · `{urgency}` · `{reason}`\n\n"
        f"От: @{user} (chat_id: `{client_chat_id}`)\n"
        f"Канал: TG\n\n"
        f"Сообщение клиента:\n_{parsed.get('text', '')[:200]}_\n\n"
        f"[открыть в дашборде →](https://soft-longma-b5d4f0.netlify.app/conv)"
    )
    await tg.send_text(ILYA_CHAT_ID, text)
