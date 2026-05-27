#!/usr/bin/env node
// Backfill historical OUTGOING Instagram DMs from SendPulse into our
// messages table. Until 2026-05-27 the webhook parser dropped every event
// with `is_echo: true`, which meant operator/bot replies sent through the
// Instagram app or SendPulse mobile UI never landed in our DB and the
// admin saw a one-sided thread.
//
// SendPulse keeps the full history server-side. We pull it via
//   GET /instagram/chats/messages?contact_id={sp_id}&size=200
// where `direction: 2` is outbound. Dedup is by `sendpulse_message_id`
// so re-running is a no-op.
//
// Usage on prod:
//   docker exec ig-agent node /app/scripts/backfill-echo.mjs
//   docker exec ig-agent node /app/scripts/backfill-echo.mjs --dry
//   docker exec ig-agent node /app/scripts/backfill-echo.mjs --contact <sp_id>

import pg from 'pg';
const { Client } = pg;

const fail = (msg) => { console.error('backfill-echo:', msg); process.exit(1); };
const log = (msg, fields = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg, ...fields }));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail('DATABASE_URL not set');
const clientId = process.env.SENDPULSE_CLIENT_ID;
const clientSecret = process.env.SENDPULSE_CLIENT_SECRET;
if (!clientId || !clientSecret) fail('SENDPULSE_CLIENT_ID/SECRET not set');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const contactArgIdx = args.indexOf('--contact');
const onlyContact = contactArgIdx >= 0 ? args[contactArgIdx + 1] : null;
const PAGE_SIZE = 200;

// ---- SendPulse OAuth + REST ------------------------------------------

let cachedToken = null;
async function sendpulseToken(force = false) {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const res = await fetch('https://api.sendpulse.com/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`SendPulse OAuth ${res.status}`);
  const json = await res.json();
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(0, json.expires_in - 60) * 1000,
  };
  return json.access_token;
}

async function fetchMessages(spContactId) {
  let token = await sendpulseToken();
  const url = `https://api.sendpulse.com/instagram/chats/messages?contact_id=${encodeURIComponent(spContactId)}&size=${PAGE_SIZE}`;
  let res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    token = await sendpulseToken(true);
    res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SendPulse messages ${res.status} ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

// ---- Message shape normalizer ----------------------------------------

// SendPulse returns one row per delivered event. We care about outgoing
// text (direction=2). Schema is messy — text lives at one of:
//   row.data.message.text  (outgoing api send)
//   row.data.text          (incoming free-form — skipped, we only want outgoing)
//   row.data.title/payload (postbacks — skipped for outgoing path)
function extractOutgoing(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.direction !== 2) return null;
  const data = row.data || {};
  const message = data.message || {};
  // SendPulse "media" outbound has type='attachment'; text outbound has type='text'.
  const text =
    (typeof message.text === 'string' && message.text) ||
    (typeof data.text === 'string' && data.text) ||
    null;
  if (!text) return null; // skip non-text outbounds for now (rare)
  const messageId =
    (typeof data.message_id === 'string' && data.message_id) ||
    (typeof row.id === 'string' && row.id) ||
    null;
  return {
    text,
    createdAt: row.created_at, // ISO string
    sendpulseMessageId: messageId,
    channel: row.channel || null,
    rawPayload: row,
  };
}

// ---- Main ------------------------------------------------------------

const db = new Client({ connectionString: databaseUrl });
await db.connect();

try {
  const contactQuery = onlyContact
    ? {
        text: 'SELECT id, sendpulse_contact_id, ig_username FROM contacts WHERE sendpulse_contact_id = $1',
        values: [onlyContact],
      }
    : {
        // Skip contacts that never had any activity — no point hitting SP for them.
        text: `SELECT c.id, c.sendpulse_contact_id, c.ig_username
               FROM contacts c
               WHERE EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id)
               ORDER BY c.last_message_at DESC NULLS LAST`,
        values: [],
      };

  const { rows: contacts } = await db.query(contactQuery);
  log('contacts to process', { count: contacts.length, dryRun, onlyContact });

  let totals = { contactsScanned: 0, fetched: 0, inserted: 0, skippedExisting: 0, errors: 0 };

  for (const contact of contacts) {
    totals.contactsScanned += 1;
    try {
      const msgs = await fetchMessages(contact.sendpulse_contact_id);
      const outgoings = msgs.map(extractOutgoing).filter(Boolean);
      totals.fetched += outgoings.length;

      for (const m of outgoings) {
        if (!m.sendpulseMessageId) {
          // No stable ID → can't dedup safely; skip.
          continue;
        }
        const { rows: existing } = await db.query(
          'SELECT id FROM messages WHERE sendpulse_message_id = $1 LIMIT 1',
          [m.sendpulseMessageId],
        );
        if (existing.length) {
          totals.skippedExisting += 1;
          continue;
        }
        if (dryRun) {
          totals.inserted += 1;
          continue;
        }
        await db.query(
          `INSERT INTO messages
             (contact_id, direction, source, text, sendpulse_message_id, raw_payload, created_at)
           VALUES ($1, 'outgoing', $2, $3, $4, $5, $6)`,
          [
            contact.id,
            // SendPulse's "api" channel = the SendPulse bot/automation sent
            // this. anything else (null) usually means an operator typed it
            // in the SendPulse/Instagram UI. We can't tell our own bot apart
            // from a flow send, so use 'manual' as the safe catch-all.
            m.channel === 'api' ? 'ai_agent' : 'manual',
            m.text,
            m.sendpulseMessageId,
            JSON.stringify(m.rawPayload),
            m.createdAt,
          ],
        );
        // Also bump contacts.last_message_at if this is newer.
        await db.query(
          'UPDATE contacts SET last_message_at = GREATEST(COALESCE(last_message_at, $2::timestamptz), $2::timestamptz) WHERE id = $1',
          [contact.id, m.createdAt],
        );
        totals.inserted += 1;
      }

      if (outgoings.length) {
        log('contact backfilled', {
          spId: contact.sendpulse_contact_id,
          username: contact.ig_username,
          outgoing: outgoings.length,
        });
      }
    } catch (err) {
      totals.errors += 1;
      log('contact failed', {
        spId: contact.sendpulse_contact_id,
        username: contact.ig_username,
        err: err instanceof Error ? err.message : String(err),
      });
      // SendPulse rate-limits aggressive callers; small pause on error
      // protects the next contacts.
      await new Promise((r) => setTimeout(r, 1500));
    }

    // Gentle throttle: 200ms between contacts. With ~600 contacts this
    // adds ~2min total, well under any reasonable SendPulse limit.
    await new Promise((r) => setTimeout(r, 200));
  }

  log('done', totals);
} finally {
  await db.end();
}
