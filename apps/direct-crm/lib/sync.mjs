/* ChatPlace → the CRM. chats_list is newest first: each pass walks it until the chats are older than what we
   already have (the first pass — BACKFILL_DAYS back), and for every chat with a new message pulls its messages
   (newest first, until a page has one we already keep). Messages are never deleted here — the CRM is the archive. */
import { now, tx, meta } from './db.mjs';

const num = v => Number(v) || 0;
const isClient = side => side === 'client' || side === 'user' || side === 'contact';

export function createSync({ db, cp, backfillDays = 14, maxPages = 40, backfillPages = 10, log = console.log, progress = () => {} }) {
  let running = null;

  const upsertChat = db.prepare(`
    INSERT INTO chats(id, client_id, client_name, username, status, type, last_message_at, first_seen)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET client_id = excluded.client_id, client_name = COALESCE(excluded.client_name, client_name),
      username = COALESCE(excluded.username, username), status = excluded.status, type = excluded.type,
      last_message_at = MAX(last_message_at, excluded.last_message_at)`);
  const getChat = db.prepare('SELECT * FROM chats WHERE id = ?');
  const hasMsg = db.prepare('SELECT 1 FROM messages WHERE id = ?');
  const putMsg = db.prepare(`INSERT OR IGNORE INTO messages(id, chat_id, side, text, created_at, type_name, media) VALUES(?, ?, ?, ?, ?, ?, ?)`);
  const stats = db.prepare(`SELECT COUNT(*) n, SUM(side IN ('client','user','contact')) c,
      MAX(CASE WHEN side IN ('client','user','contact') THEN created_at END) lc,
      MAX(CASE WHEN side NOT IN ('client','user','contact') THEN created_at END) lr FROM messages WHERE chat_id = ?`);
  const lastSide = db.prepare('SELECT side FROM messages WHERE chat_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1');
  const setStats = db.prepare(`UPDATE chats SET msg_count = ?, client_count = ?, last_client_at = ?, last_reply_at = ?, last_side = ?,
      synced_upto = ?, last_message_at = MAX(last_message_at, ?) WHERE id = ?`);
  const setUsername = db.prepare('UPDATE chats SET username = ? WHERE id = ? AND username IS NULL');

  // a reply sent from the CRM is kept at once under a crm-… id; when ChatPlace returns it, the real id takes over
  const ownCopy = db.prepare(`SELECT id FROM messages WHERE chat_id = ? AND id LIKE 'crm-%' AND text = ? AND ABS(created_at - ?) < 600 LIMIT 1`);
  const adopt = db.prepare('UPDATE messages SET id = ?, side = ?, created_at = ? WHERE id = ?');

  function saveMessages(chatId, list) {
    let fresh = 0, known = 0;
    for (const m of list || []) {
      if (!m?.id) continue;
      if (hasMsg.get(m.id)) { known++; continue; }
      const own = !isClient(m.side) && ownCopy.get(chatId, m.message ?? m.text ?? '', num(m.createdAt));
      if (own) { adopt.run(m.id, m.side || 'operator', num(m.createdAt), own.id); known++; continue; }
      const media = (m.mediaFiles || []).map(f => ({ type:f.typeName || f.type, url:f.url, name:f.name }));
      putMsg.run(m.id, chatId, m.side || 'unknown', m.message ?? m.text ?? '', num(m.createdAt), m.messageTypeName || null, media.length ? JSON.stringify(media) : null);
      fresh++;
    }
    return { fresh, known };
  }

  function refreshStats(chatId, upto) {
    const s = stats.get(chatId);
    setStats.run(s.n, s.c || 0, s.lc || 0, s.lr || 0, lastSide.get(chatId)?.side || null, upto, Math.max(s.lc || 0, s.lr || 0), chatId);
  }

  async function pullMessages(chat) {
    let fresh = 0;
    for (let page = 1; page <= 8; page++) {
      const list = await cp.messages(chat.id, page, 50);
      const arr = Array.isArray(list) ? list : (list?.items || []);
      const r = tx(db, () => saveMessages(chat.id, arr));
      fresh += r.fresh;
      if (r.known || arr.length < 50) break;
    }
    refreshStats(chat.id, chat.last_message_at);
    if (!chat.username && !chat.noProfile) {
      try { const d = await cp.getChat(chat.id); if (d?.username) setUsername.run(d.username, chat.id); } catch {}
    }
    return fresh;
  }

  async function pass() {
    const firstRun = !meta(db, 'synced_once');
    const floor = firstRun ? now() - backfillDays * 86400 : num(meta(db, 'watermark')) - 120;
    let cursor = {}, pages = 0, top = 0, changed = [];
    while (pages++ < maxPages) {
      const res = await cp.listChats({ limit:50, ...cursor });
      const items = res?.items || [];
      let older = false;
      tx(db, () => {
        for (const c of items) {
          const at = num(c.lastMessageAt);
          top = Math.max(top, at);
          if (at < floor) { older = true; continue; }
          upsertChat.run(c.id, c.clientId || null, c.clientName || null, c.username || null, num(c.status), num(c.type), at, now());
          const row = getChat.get(c.id);
          if (at > row.synced_upto) changed.push(row);
        }
      });
      if (older || !res?.hasNextItems || !items.length) break;
      cursor = { lastItemId:res.lastItemId, lastItemTimestamp:num(res.lastItemTimestamp) };
    }
    let fresh = 0, done = 0;
    progress({ phase:'messages', done:0, total:changed.length });
    for (const chat of changed) {
      progress({ done:done++ });
      try { fresh += await pullMessages(chat); }
      catch (e) { log(`sync: chat ${chat.id}: ${e.message}`); }
    }
    if (top) meta(db, 'watermark', Math.max(top, num(meta(db, 'watermark'))));
    meta(db, 'synced_once', 1);
    meta(db, 'last_sync', now());
    progress({ phase:'backfill', done:0, total:0 });
    const back = await backfill();
    return { chats:changed.length + back.chats, messages:fresh + back.messages, firstRun, backfill:back.done ? 'done' : back.chats };
  }

  /* History older than what one pass takes (maxPages × 50 chats): every pass continues chats_list from the oldest chat
     we keep, backfillPages pages at a time, until it reaches BACKFILL_DAYS back. Profiles (username) are not asked
     for these old chats — one request less per chat. */
  const oldest = db.prepare('SELECT id, last_message_at FROM chats ORDER BY last_message_at ASC, id ASC LIMIT 1');
  async function backfill() {
    if (meta(db, 'backfill_done')) return { chats:0, messages:0, done:true };
    const floor = now() - backfillDays * 86400;
    let pages = 0, saved = 0, fresh = 0, done = false;
    while (pages++ < backfillPages) {
      const o = oldest.get();
      if (!o || o.last_message_at < floor) { done = true; break; }
      const res = await cp.listChats({ limit:50, lastItemId:o.id, lastItemTimestamp:o.last_message_at });
      const items = (res?.items || []).filter(c => c.id !== o.id);
      // the cursor must move us older; if ChatPlace answers with chats no older than the one we asked from, stop instead of looping
      if (items.length && !items.some(c => num(c.lastMessageAt) < o.last_message_at || (num(c.lastMessageAt) === o.last_message_at && c.id !== o.id && !getChat.get(c.id)))) {
        log('backfill: ChatPlace did not page older than the oldest chat — stopped'); done = true; break;
      }
      const rows = [];
      let older = false;
      tx(db, () => {
        for (const c of items) {
          const at = num(c.lastMessageAt);
          if (at < floor) { older = true; continue; }
          upsertChat.run(c.id, c.clientId || null, c.clientName || null, c.username || null, num(c.status), num(c.type), at, now());
          const row = getChat.get(c.id);
          if (at > row.synced_upto) rows.push({ ...row, noProfile:true });
        }
      });
      for (const chat of rows) {
        progress({ done:saved });
        try { fresh += await pullMessages(chat); saved++; }
        catch (e) { log(`backfill: chat ${chat.id}: ${e.message}`); }
      }
      if (older || !res?.hasNextItems || !items.length) { done = true; break; }
    }
    if (done) { meta(db, 'backfill_done', 1); log('backfill: history is complete'); }
    return { chats:saved, messages:fresh, done };
  }

  return {
    // one pass at a time; a call while a pass runs waits for that pass
    run() { return running ||= pass().finally(() => { running = null; }); },
    pullMessages,
  };
}

export { isClient };
