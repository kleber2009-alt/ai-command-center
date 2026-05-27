// Chat session persistence (sessions + turns) over Postgres. The previous
// version of this file was written against better-sqlite3 (Database#prepare,
// transactions, sync I/O) but the rest of the app moved to postgres.js; the
// API routes already swallow `null`/no-op returns gracefully, so we expose
// the same surface but no-op when DATABASE_URL isn't configured.
//
// Only the four functions consumed by /api/{me,assistants}/chat are used in
// the live flow (`sessionId` is never sent from the Mini App today). The
// schema is created lazily on first call.

import { randomUUID } from 'crypto'
import { getDb } from './db'

export type ChatKind = 'me' | 'assistant'

export type ChatSessionRow = {
  id: string
  user_id: string
  kind: ChatKind
  assistant_id: string | null
  title: string
  pinned: 0 | 1
  doc_ids: number[] | null
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

let schemaReady = false
async function ensureSchema(): Promise<void> {
  if (schemaReady) return
  const db = getDb()
  if (!db) return
  await db`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id            UUID PRIMARY KEY,
      user_id       TEXT NOT NULL,
      kind          TEXT NOT NULL CHECK (kind IN ('me', 'assistant')),
      assistant_id  TEXT,
      title         TEXT NOT NULL DEFAULT '',
      pinned        INTEGER NOT NULL DEFAULT 0,
      doc_ids       JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await db`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id          BIGSERIAL PRIMARY KEY,
      session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await db`CREATE INDEX IF NOT EXISTS chat_sessions_user_idx ON chat_sessions (user_id, updated_at DESC)`
  await db`CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages (session_id, id)`
  schemaReady = true
}

function hydrateSession(row: any): ChatSessionRow {
  const raw = row?.doc_ids
  let doc_ids: number[] | null = null
  if (Array.isArray(raw)) {
    const ids = raw.filter((x) => Number.isInteger(x))
    doc_ids = ids.length > 0 ? ids : null
  }
  return {
    id: row.id,
    user_id: row.user_id,
    kind: row.kind,
    assistant_id: row.assistant_id ?? null,
    title: row.title ?? '',
    pinned: row.pinned ? 1 : 0,
    doc_ids,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export async function getSession(id: string, user_id: string): Promise<ChatSessionRow | null> {
  const db = getDb()
  if (!db) return null
  await ensureSchema()
  const rows = await db`SELECT * FROM chat_sessions WHERE id = ${id}::uuid AND user_id = ${user_id}`
  if (rows.length === 0) return null
  return hydrateSession(rows[0])
}

export type CreateSessionInput = {
  user_id: string
  kind: ChatKind
  assistant_id?: string | null
  title?: string
  doc_ids?: number[] | null
}
export async function createSession(input: CreateSessionInput): Promise<ChatSessionRow | null> {
  const db = getDb()
  if (!db) return null
  await ensureSchema()
  const id = randomUUID()
  await db`
    INSERT INTO chat_sessions (id, user_id, kind, assistant_id, title, doc_ids)
    VALUES (
      ${id}::uuid, ${input.user_id}, ${input.kind},
      ${input.assistant_id ?? null}, ${input.title ?? ''},
      ${input.doc_ids && input.doc_ids.length > 0 ? db.json(input.doc_ids) : null}
    )
  `
  return getSession(id, input.user_id)
}

export type AppendTurnInput = {
  sessionId: string
  user_id: string
  userMessage: string
  assistantMessage: string
}
export async function appendTurn(input: AppendTurnInput): Promise<void> {
  const db = getDb()
  if (!db) return
  await ensureSchema()
  await db.begin(async (tx) => {
    await tx`INSERT INTO chat_messages (session_id, role, content) VALUES (${input.sessionId}::uuid, 'user', ${input.userMessage})`
    await tx`INSERT INTO chat_messages (session_id, role, content) VALUES (${input.sessionId}::uuid, 'assistant', ${input.assistantMessage})`
    await tx`UPDATE chat_sessions SET updated_at = NOW() WHERE id = ${input.sessionId}::uuid AND user_id = ${input.user_id}`
  })
}

export async function replaceLastAssistant(
  sessionId: string,
  user_id: string,
  newContent: string,
): Promise<void> {
  const db = getDb()
  if (!db) return
  await ensureSchema()
  const rows = await db`
    SELECT m.id FROM chat_messages m
    JOIN chat_sessions s ON s.id = m.session_id
    WHERE m.session_id = ${sessionId}::uuid
      AND s.user_id = ${user_id}
      AND m.role = 'assistant'
    ORDER BY m.id DESC
    LIMIT 1
  `
  const lastId = rows[0]?.id
  if (lastId == null) return
  await db`UPDATE chat_messages SET content = ${newContent} WHERE id = ${lastId}`
  await db`UPDATE chat_sessions SET updated_at = NOW() WHERE id = ${sessionId}::uuid AND user_id = ${user_id}`
}

export async function truncateSession(
  sessionId: string,
  user_id: string,
  keepCount: number,
): Promise<void> {
  const db = getDb()
  if (!db) return
  await ensureSchema()
  await db`
    DELETE FROM chat_messages
    WHERE session_id = ${sessionId}::uuid
      AND id NOT IN (
        SELECT m.id FROM chat_messages m
        JOIN chat_sessions s ON s.id = m.session_id
        WHERE m.session_id = ${sessionId}::uuid AND s.user_id = ${user_id}
        ORDER BY m.id ASC
        LIMIT ${Math.max(0, keepCount)}
      )
  `
}

export async function listSessions(user_id: string, limit = 50): Promise<ChatSessionListItem[]> {
  const db = getDb()
  if (!db) return []
  await ensureSchema()
  const rows = await db`
    SELECT s.*,
           (SELECT COUNT(*)::int FROM chat_messages m WHERE m.session_id = s.id) AS message_count,
           (SELECT content FROM chat_messages m WHERE m.session_id = s.id ORDER BY id DESC LIMIT 1) AS last_message
    FROM chat_sessions s
    WHERE s.user_id = ${user_id}
    ORDER BY s.pinned DESC, s.updated_at DESC
    LIMIT ${limit}
  `
  return (rows as any[]).map((r) => ({
    ...hydrateSession(r),
    message_count: Number(r.message_count ?? 0),
    last_message: r.last_message ?? null,
  }))
}

export async function listMessages(sessionId: string, user_id: string): Promise<ChatMessageRow[]> {
  const db = getDb()
  if (!db) return []
  await ensureSchema()
  const rows = await db`
    SELECT m.id, m.session_id, m.role, m.content, m.created_at
    FROM chat_messages m
    JOIN chat_sessions s ON s.id = m.session_id
    WHERE m.session_id = ${sessionId}::uuid AND s.user_id = ${user_id}
    ORDER BY m.id ASC
  `
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    session_id: r.session_id,
    role: r.role,
    content: r.content,
    created_at: String(r.created_at),
  }))
}

export async function deleteSession(sessionId: string, user_id: string): Promise<boolean> {
  const db = getDb()
  if (!db) return false
  await ensureSchema()
  const rows = await db`DELETE FROM chat_sessions WHERE id = ${sessionId}::uuid AND user_id = ${user_id} RETURNING id`
  return rows.length > 0
}
