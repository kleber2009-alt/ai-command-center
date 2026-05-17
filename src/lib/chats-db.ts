import { randomUUID } from 'crypto'
import { getDb } from './db'

export type ChatKind = 'me' | 'assistant'

export type ChatSessionRow = {
  id: string
  kind: ChatKind
  assistant_id: string | null
  title: string
  pinned: 0 | 1
  created_at: string
  updated_at: string
}

export type ChatSessionListItem = ChatSessionRow & {
  message_count: number
  last_message: string | null
}

export type ChatMessageRow = {
  id: number
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

function nowIso(): string {
  return new Date().toISOString()
}

export function createSession(kind: ChatKind, assistantId: string | null): ChatSessionRow {
  const id = randomUUID()
  const now = nowIso()
  getDb()
    .prepare(
      `INSERT INTO chat_sessions (id, kind, assistant_id, title, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, ?)`,
    )
    .run(id, kind, assistantId, now, now)
  return { id, kind, assistant_id: assistantId, title: '', pinned: 0, created_at: now, updated_at: now }
}

export function getSession(id: string): ChatSessionRow | null {
  return (
    (getDb().prepare(`SELECT * FROM chat_sessions WHERE id = ?`).get(id) as ChatSessionRow | undefined) ?? null
  )
}

export function listSessions(kind: ChatKind, assistantId: string | null, limit = 30): ChatSessionListItem[] {
  const db = getDb()
  const rows = (assistantId === null
    ? db
        .prepare(
          `SELECT s.*,
                  (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) AS message_count,
                  (SELECT content FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) AS last_message
           FROM chat_sessions s
           WHERE s.kind = ? AND s.assistant_id IS NULL
           ORDER BY s.pinned DESC, s.updated_at DESC
           LIMIT ?`,
        )
        .all(kind, limit)
    : db
        .prepare(
          `SELECT s.*,
                  (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) AS message_count,
                  (SELECT content FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) AS last_message
           FROM chat_sessions s
           WHERE s.kind = ? AND s.assistant_id = ?
           ORDER BY s.pinned DESC, s.updated_at DESC
           LIMIT ?`,
        )
        .all(kind, assistantId, limit)) as Array<ChatSessionListItem & { message_count: number | bigint }>

  return rows.map((r) => ({ ...r, message_count: Number(r.message_count) }))
}

export function listMessages(sessionId: string): ChatMessageRow[] {
  return getDb()
    .prepare(`SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC`)
    .all(sessionId) as ChatMessageRow[]
}

export function deleteSession(id: string): boolean {
  const info = getDb().prepare(`DELETE FROM chat_sessions WHERE id = ?`).run(id)
  return info.changes > 0
}

/** Append a turn (user + assistant) and bump the session's updated_at + title. */
export function appendTurn(input: {
  sessionId: string
  userMessage: string
  assistantMessage: string
}): void {
  const db = getDb()
  const tx = db.transaction(() => {
    const session = db.prepare(`SELECT id, title FROM chat_sessions WHERE id = ?`).get(input.sessionId) as
      | { id: string; title: string }
      | undefined
    if (!session) return
    const ins = db.prepare(`INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)`)
    ins.run(input.sessionId, 'user', input.userMessage)
    ins.run(input.sessionId, 'assistant', input.assistantMessage)

    const now = nowIso()
    if (!session.title) {
      const derived = input.userMessage.trim().replace(/\s+/g, ' ').slice(0, 60)
      const titled = derived.length === 60 ? derived + '…' : derived
      db.prepare(`UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?`).run(
        titled,
        now,
        input.sessionId,
      )
    } else {
      db.prepare(`UPDATE chat_sessions SET updated_at = ? WHERE id = ?`).run(now, input.sessionId)
    }
  })
  tx()
}

export function renameSession(id: string, title: string): boolean {
  const info = getDb()
    .prepare(`UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?`)
    .run(title, nowIso(), id)
  return info.changes > 0
}

export type ChatSearchHit = {
  session_id: string
  kind: ChatKind
  assistant_id: string | null
  session_title: string
  session_updated_at: string
  role: 'user' | 'assistant'
  content: string
}

/**
 * Substring search across all chat messages, scoped by kind (and assistant
 * when provided). Returns latest matches first; trims each hit's content
 * to a 240-char window centred on the first occurrence.
 */
export function searchMessages(
  kind: ChatKind,
  assistantId: string | null,
  query: string,
  limit = 30,
): ChatSearchHit[] {
  const q = query.trim()
  if (!q) return []
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`
  const db = getDb()
  const rows = (assistantId === null
    ? db
        .prepare(
          `SELECT m.session_id, s.kind, s.assistant_id, s.title AS session_title,
                  s.updated_at AS session_updated_at, m.role, m.content
           FROM chat_messages m
           JOIN chat_sessions s ON s.id = m.session_id
           WHERE s.kind = ? AND s.assistant_id IS NULL
             AND m.content LIKE ? ESCAPE '\\'
           ORDER BY m.id DESC
           LIMIT ?`,
        )
        .all(kind, like, limit)
    : db
        .prepare(
          `SELECT m.session_id, s.kind, s.assistant_id, s.title AS session_title,
                  s.updated_at AS session_updated_at, m.role, m.content
           FROM chat_messages m
           JOIN chat_sessions s ON s.id = m.session_id
           WHERE s.kind = ? AND s.assistant_id = ?
             AND m.content LIKE ? ESCAPE '\\'
           ORDER BY m.id DESC
           LIMIT ?`,
        )
        .all(kind, assistantId, like, limit)) as ChatSearchHit[]

  const lowerQ = q.toLowerCase()
  return rows.map((r) => {
    const idx = r.content.toLowerCase().indexOf(lowerQ)
    if (idx < 0 || r.content.length <= 240) return r
    const start = Math.max(0, idx - 80)
    const end = Math.min(r.content.length, start + 240)
    const snippet = (start > 0 ? '…' : '') + r.content.slice(start, end) + (end < r.content.length ? '…' : '')
    return { ...r, content: snippet }
  })
}

/**
 * Truncate a session to keep only the first `keepCount` messages
 * (ordered by id ASC). Used by the edit-message flow to drop a tail
 * before re-firing the chat.
 */
export function truncateSession(sessionId: string, keepCount: number): void {
  if (keepCount < 0) return
  const db = getDb()
  db.prepare(
    `DELETE FROM chat_messages
     WHERE session_id = ?
       AND id NOT IN (
         SELECT id FROM chat_messages
         WHERE session_id = ?
         ORDER BY id ASC
         LIMIT ?
       )`,
  ).run(sessionId, sessionId, keepCount)
  db.prepare(`UPDATE chat_sessions SET updated_at = ? WHERE id = ?`).run(nowIso(), sessionId)
}
export function replaceLastAssistant(sessionId: string, content: string): boolean {
  const db = getDb()
  const tx = db.transaction(() => {
    const last = db
      .prepare(
        `SELECT id FROM chat_messages
         WHERE session_id = ? AND role = 'assistant'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(sessionId) as { id: number } | undefined
    if (!last) return false
    db.prepare(`UPDATE chat_messages SET content = ? WHERE id = ?`).run(content, last.id)
    db.prepare(`UPDATE chat_sessions SET updated_at = ? WHERE id = ?`).run(nowIso(), sessionId)
    return true
  })
  return tx()
}

export function setSessionPinned(id: string, pinned: boolean): boolean {
  const info = getDb()
    .prepare(`UPDATE chat_sessions SET pinned = ? WHERE id = ?`)
    .run(pinned ? 1 : 0, id)
  return info.changes > 0
}
