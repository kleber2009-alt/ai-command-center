from __future__ import annotations
import json
import logging
import os

log = logging.getLogger("aisales.db_memory")

_SEGMENT_MAP = {"A": "segment_a", "B": "segment_b", "C": "segment_c", "unknown": "unknown"}
_STAGE_MAP = {"won": "closed_won", "lost": "closed_lost"}


_ASYNCPG_KWARGS_CACHE: dict | None = None


def _asyncpg_kwargs() -> dict:
    """Парсим POSTGRES_URL руками: пароль содержит '/' и '@', стандартный URL-парсер ломается."""
    global _ASYNCPG_KWARGS_CACHE
    if _ASYNCPG_KWARGS_CACHE is not None:
        return _ASYNCPG_KWARGS_CACHE
    url = os.getenv("POSTGRES_URL", "")
    if not url:
        raise RuntimeError("POSTGRES_URL not set")
    # Снимаем SQLAlchemy-префикс.
    for prefix in ("postgresql+asyncpg://", "postgres+asyncpg://", "postgresql://", "postgres://"):
        if url.startswith(prefix):
            rest = url[len(prefix):]
            break
    else:
        raise RuntimeError(f"POSTGRES_URL has unsupported scheme: {url[:30]}…")
    # rest = "user:password@host:port/dbname". Пароль произвольный → rsplit по '@' справа.
    creds, _, host_part = rest.rpartition("@")
    if not creds:
        raise RuntimeError("POSTGRES_URL missing credentials")
    user, _, password = creds.partition(":")
    hostport, _, dbname = host_part.partition("/")
    host, _, port = hostport.partition(":")
    _ASYNCPG_KWARGS_CACHE = {
        "user": user,
        "password": password,
        "host": host,
        "port": int(port) if port else 5432,
        "database": dbname.split("?", 1)[0],  # отрезаем query-string на всякий
    }
    return _ASYNCPG_KWARGS_CACHE


def _asyncpg_dsn() -> str:
    """DSN-строка для asyncpg.connect() с URL-encoded паролем."""
    from urllib.parse import quote
    kw = _asyncpg_kwargs()
    return f"postgresql://{quote(kw['user'], safe='')}:{quote(kw['password'], safe='')}@{kw['host']}:{kw['port']}/{kw['database']}"


async def _connect():
    import asyncpg
    return await asyncpg.connect(**_asyncpg_kwargs())


async def get_or_create_client(
    tg_user_id: int,
    *,
    tg_username: str | None = None,
    display_name: str | None = None,
    tenant_id: str | None = None,
) -> dict:
    conn = await _connect()
    try:
        if tenant_id:
            row = await conn.fetchrow(
                "SELECT id::text, tg_user_id, tg_username, display_name, "
                "segment::text, funnel_stage::text, qual_score "
                "FROM clients WHERE tg_user_id = $1 AND metadata->>$2 = $3",
                tg_user_id, "tenant_id", tenant_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT id::text, tg_user_id, tg_username, display_name, "
                "segment::text, funnel_stage::text, qual_score "
                "FROM clients WHERE tg_user_id = $1 AND (metadata->>$2) IS NULL",
                tg_user_id, "tenant_id",
            )

        if row:
            result = dict(row)
            updates, vals = [], []
            if tg_username and row["tg_username"] != tg_username:
                vals.append(tg_username)
                updates.append(f"tg_username = ${len(vals)}")
            if display_name and not row["display_name"]:
                vals.append(display_name)
                updates.append(f"display_name = ${len(vals)}")
            if updates:
                vals.append(result["id"])
                await conn.execute(
                    f"UPDATE clients SET {", ".join(updates)} WHERE id = ${len(vals)}::uuid",
                    *vals,
                )
            return result

        meta = json.dumps({"tenant_id": tenant_id} if tenant_id else {})
        source = "telegram_tenant" if tenant_id else "telegram"
        row = await conn.fetchrow(
            "INSERT INTO clients (tg_user_id, tg_username, display_name, source, metadata, first_contact_at, last_contact_at) "
            "VALUES ($1, $2, $3, $4, $5::jsonb, now(), now()) "
            "RETURNING id::text, tg_user_id, tg_username, display_name, segment::text, funnel_stage::text, qual_score",
            tg_user_id, tg_username, display_name, source, meta,
        )
        log.info("db_memory . new client %s tg=%s tenant=%s", row["id"], tg_user_id, tenant_id)
        return dict(row)
    except Exception as e:
        log.error("db_memory . get_or_create_client failed: %s", e)
        return {}
    finally:
        await conn.close()


async def get_or_create_conversation(client_id: str, channel: str) -> dict:
    conn = await _connect()
    try:
        row = await conn.fetchrow(
            "SELECT id::text, client_id::text, status::text, message_count "
            "FROM conversations WHERE client_id = $1::uuid AND channel = $2::conversation_channel",
            client_id, channel,
        )
        if row:
            return dict(row)
        row = await conn.fetchrow(
            "INSERT INTO conversations (client_id, channel, last_message_at) "
            "VALUES ($1::uuid, $2::conversation_channel, now()) "
            "RETURNING id::text, client_id::text, status::text, message_count",
            client_id, channel,
        )
        log.info("db_memory . new conversation %s client=%s", row["id"], client_id)
        return dict(row)
    except Exception as e:
        log.error("db_memory . get_or_create_conversation failed: %s", e)
        return {}
    finally:
        await conn.close()


async def load_history(conversation_id: str, limit: int = 10) -> list[dict]:
    conn = await _connect()
    try:
        rows = await conn.fetch(
            "SELECT direction::text, author::text, content "
            "FROM messages WHERE conversation_id = $1::uuid "
            "ORDER BY created_at DESC LIMIT $2",
            conversation_id, limit,
        )
        return [dict(r) for r in reversed(rows)]
    except Exception as e:
        log.error("db_memory . load_history failed: %s", e)
        return []
    finally:
        await conn.close()


async def save_exchange(
    conversation_id: str,
    client_id: str,
    incoming_text: str,
    response_text: str,
    state: dict,
) -> None:
    channel = state.get("channel", "tg")
    author = "agent_tg" if channel == "tg" else "agent_ig"
    model = state.get("model_used")
    tokens = state.get("tokens_used")
    latency = state.get("latency_ms")
    cost = state.get("cost_usd")
    _st = state.get("current_stage")
    stage = _STAGE_MAP.get(_st, _st)
    segment = _SEGMENT_MAP.get(state.get("segment", "unknown"), "unknown")
    qual_score = state.get("icp_match")

    conn = await _connect()
    try:
        await conn.execute(
            "INSERT INTO messages (conversation_id, client_id, direction, type, author, content) "
            "VALUES ($1::uuid, $2::uuid, $3::message_direction, $4::message_type, $5::message_author, $6)",
            conversation_id, client_id, "in", "text", "client", incoming_text,
        )
        await conn.execute(
            "INSERT INTO messages (conversation_id, client_id, direction, type, author, content, "
            "agent_model, tokens_used, latency_ms, cost_usd) "
            "VALUES ($1::uuid, $2::uuid, $3::message_direction, $4::message_type, $5::message_author, $6, $7, $8, $9, $10)",
            conversation_id, client_id, "out", "text", author, response_text,
            model, tokens, latency, cost,
        )
        await conn.execute(
            "UPDATE conversations SET last_message_at = now(), message_count = message_count + 2 WHERE id = $1::uuid",
            conversation_id,
        )

        updates = ["last_contact_at = now()"]
        vals: list = []
        if stage:
            vals.append(stage)
            updates.append(f"funnel_stage = ${len(vals)}::funnel_stage")
        if segment:
            vals.append(segment)
            updates.append(f"segment = ${len(vals)}::client_segment")
        if qual_score is not None:
            vals.append(qual_score)
            updates.append(f"qual_score = ${len(vals)}")
        vals.append(client_id)
        await conn.execute(
            f"UPDATE clients SET {", ".join(updates)} WHERE id = ${len(vals)}::uuid",
            *vals,
        )
        log.info("db_memory . saved conv=%s stage=%s", conversation_id, stage)
    except Exception as e:
        log.error("db_memory . save_exchange failed: %s", e)
    finally:
        await conn.close()
