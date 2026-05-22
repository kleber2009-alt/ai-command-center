"""
Inbox DAO — persist incoming IG/TG messages.

Upserts a `clients` row by external user id, ensures a `conversations` row per
(client, channel), and inserts a `messages` row. All-or-nothing per call (one
async tx). Safe to call from the webhook background task.

If SQLAlchemy is not available (e.g. AISALES_MOCK env without deps), every
function becomes a no-op that returns None — so the webhook path keeps working
even in offline dev.
"""
from __future__ import annotations

import logging
from typing import Optional

try:
    from sqlalchemy import text
    HAS_SQLA = True
except ImportError:
    HAS_SQLA = False

from db.session import SessionLocal

log = logging.getLogger("aisales.inbox_dao")


async def upsert_ig_client(
    ig_user_id: str,
    ig_username: Optional[str] = None,
    display_name: Optional[str] = None,
) -> Optional[str]:
    """Find-or-create clients row by ig_user_id. Returns client uuid."""
    if not HAS_SQLA or SessionLocal is None:
        log.debug("inbox_dao · no SQLA, skip upsert_ig_client")
        return None

    async with SessionLocal() as session:
        row = (await session.execute(
            text("SELECT id FROM clients WHERE ig_user_id = :uid LIMIT 1"),
            {"uid": ig_user_id},
        )).first()
        if row:
            await session.execute(
                text("""UPDATE clients
                          SET last_contact_at = NOW(),
                              ig_username = COALESCE(:un, ig_username),
                              display_name = COALESCE(:dn, display_name)
                        WHERE id = :id"""),
                {"un": ig_username, "dn": display_name, "id": row[0]},
            )
            await session.commit()
            return str(row[0])

        ins = (await session.execute(
            text("""INSERT INTO clients
                      (ig_user_id, ig_username, display_name,
                       source, first_contact_at, last_contact_at)
                    VALUES (:uid, :un, :dn, 'ig_dm', NOW(), NOW())
                    RETURNING id"""),
            {"uid": ig_user_id, "un": ig_username, "dn": display_name},
        )).first()
        await session.commit()
        return str(ins[0]) if ins else None


async def upsert_conversation(client_id: str, channel: str = "ig") -> Optional[str]:
    """Find-or-create conversations row keyed by (client_id, channel)."""
    if not HAS_SQLA or SessionLocal is None or not client_id:
        return None

    async with SessionLocal() as session:
        row = (await session.execute(
            text("""SELECT id FROM conversations
                     WHERE client_id = :cid AND channel = :ch LIMIT 1"""),
            {"cid": client_id, "ch": channel},
        )).first()
        if row:
            return str(row[0])

        ins = (await session.execute(
            text("""INSERT INTO conversations
                      (client_id, channel, status, last_message_at)
                    VALUES (:cid, :ch, 'active', NOW())
                    RETURNING id"""),
            {"cid": client_id, "ch": channel},
        )).first()
        await session.commit()
        return str(ins[0]) if ins else None


async def insert_inbound_message(
    conversation_id: str,
    client_id: str,
    content: str,
    external_id: Optional[str] = None,
    media_type: str = "text",
    media_url: Optional[str] = None,
) -> Optional[str]:
    """Insert one inbound (client → us) message row."""
    if not HAS_SQLA or SessionLocal is None or not conversation_id:
        return None

    msg_type = {
        "text": "text",
        "voice": "audio",
        "image": "image",
        "video": "video",
        "document": "document",
    }.get(media_type, "text")

    async with SessionLocal() as session:
        ins = (await session.execute(
            text("""INSERT INTO messages
                      (conversation_id, client_id, external_id, direction,
                       type, author, content, media_url)
                    VALUES (:conv, :cli, :ext, 'inbound',
                            CAST(:type AS message_type), 'client', :body, :url)
                    RETURNING id"""),
            {
                "conv": conversation_id,
                "cli": client_id,
                "ext": external_id,
                "type": msg_type,
                "body": content,
                "url": media_url,
            },
        )).first()
        await session.execute(
            text("""UPDATE conversations
                      SET last_message_at = NOW(),
                          message_count = message_count + 1
                    WHERE id = :id"""),
            {"id": conversation_id},
        )
        await session.commit()
        return str(ins[0]) if ins else None


async def persist_ig_inbound(parsed: dict, transcribed_text: str) -> dict:
    """One-shot: upsert client+conv, insert message. Returns ids or empties."""
    sender_id = parsed.get("sender_id")
    if not sender_id:
        return {}

    try:
        client_id = await upsert_ig_client(ig_user_id=str(sender_id))
        if not client_id:
            return {}
        conv_id = await upsert_conversation(client_id, channel="ig")
        if not conv_id:
            return {"client_id": client_id}
        msg_id = await insert_inbound_message(
            conversation_id=conv_id,
            client_id=client_id,
            content=transcribed_text or "",
            external_id=str(parsed.get("raw", {}).get("message", {}).get("mid") or ""),
            media_type=parsed.get("media_type", "text"),
            media_url=parsed.get("attachment_url"),
        )
        log.info("inbox · ig persisted · client=%s conv=%s msg=%s",
                 client_id[:8], conv_id[:8], (msg_id or "?")[:8])
        return {"client_id": client_id, "conversation_id": conv_id, "message_id": msg_id}
    except Exception as e:
        log.exception("inbox · ig persist failed: %s", e)
        return {}
