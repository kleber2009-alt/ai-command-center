import { randomUUID } from 'crypto'
import { getDb } from './db'

export type ChatKind = 'me' | 'assistant'

export type ChatSessionRow = {
  id: string
  kind: ChatKind
  assistant_id: string | null
  title: string
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
  return { id, kind, assistant_id: assistantId, title: '', created_at: now, updated_at: now }
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
           ORDER BY s.updated_at DESC
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
           ORDER BY s.updated_at DESC
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
