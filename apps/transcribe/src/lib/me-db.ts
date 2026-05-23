import { getServerSupabase } from './transcripts-db'
import { getDb } from './db'

export type MeProfile = {
  bio: string
  projects: string
  academy: string
  social: string
  voice: string
  custom: Record<string, string>
  updated_at: string
}

export const EMPTY_PROFILE: MeProfile = {
  bio: '',
  projects: '',
  academy: '',
  social: '',
  voice: '',
  custom: {},
  updated_at: new Date(0).toISOString(),
}

export type MeDocumentRow = {
  id: string
  user_id: string | null
  created_at: string
  title: string
  source_type: 'paste' | 'file' | 'transcript'
  source_meta: Record<string, any>
  char_count: number
  chunk_count: number
  pinned: boolean
}

export type MeChunkMatch = {
  id: string
  document_id: string
  document_title: string
  chunk_index: number
  content: string
  similarity: number
}

export type LibraryStats = {
  documents: number
  chunks: number
  chars: number
  pinned: number
}

export { getServerSupabase }

const SINGLETON = 'singleton'

// ─── Schema bootstrap ───────────────────────────────────────────────────────
//
// The original 003_me.sql migration never ran against the prod
// `aio` postgres. Rather than wire in an external migration runner
// we lazily ensure the schema on first call. CREATE/ALTER ... IF
// NOT EXISTS keeps it idempotent across restarts. pgvector is
// optional — when it's missing we fall back to client-side cosine.

let schemaReady: Promise<{ pgvector: boolean }> | null = null

async function ensureSchema(): Promise<{ pgvector: boolean }> {
  if (schemaReady) return schemaReady
  schemaReady = (async () => {
    const db = getDb()
    if (!db) return { pgvector: false }

    // pgvector is best-effort; if the extension isn't available
    // (e.g. base postgres image without it) we transparently fall
    // back to the float[] column + JS cosine.
    let pgvector = false
    try {
      await db`CREATE EXTENSION IF NOT EXISTS vector`
      pgvector = true
    } catch {
      pgvector = false
    }

    await db`
      CREATE TABLE IF NOT EXISTS me_profile (
        id          TEXT PRIMARY KEY DEFAULT 'singleton',
        bio         TEXT DEFAULT '',
        projects    TEXT DEFAULT '',
        academy     TEXT DEFAULT '',
        social      TEXT DEFAULT '',
        voice       TEXT DEFAULT '',
        custom      JSONB DEFAULT '{}'::jsonb,
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await db`INSERT INTO me_profile (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING`

    await db`
      CREATE TABLE IF NOT EXISTS me_documents (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       TEXT,
        title         TEXT NOT NULL,
        source_type   TEXT NOT NULL CHECK (source_type IN ('paste','file','transcript')),
        source_meta   JSONB DEFAULT '{}'::jsonb,
        original_text TEXT NOT NULL,
        char_count    INT NOT NULL DEFAULT 0,
        chunk_count   INT NOT NULL DEFAULT 0,
        pinned        BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    // Idempotent column adds for older DBs that pre-date the
    // user_id / pinned fields.
    await db`ALTER TABLE me_documents ADD COLUMN IF NOT EXISTS user_id TEXT`
    await db`ALTER TABLE me_documents ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE`
    await db`CREATE INDEX IF NOT EXISTS me_documents_user_idx ON me_documents (user_id, created_at DESC)`

    if (pgvector) {
      await db`
        CREATE TABLE IF NOT EXISTS me_chunks (
          id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          document_id  UUID NOT NULL REFERENCES me_documents(id) ON DELETE CASCADE,
          chunk_index  INT NOT NULL,
          content      TEXT NOT NULL,
          embedding    vector(1536) NOT NULL,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    } else {
      // Fallback: float[] column. Slower searches, but works
      // without the extension. ivfflat index is unavailable in
      // this branch — searches do a full scan + JS cosine.
      await db`
        CREATE TABLE IF NOT EXISTS me_chunks (
          id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          document_id  UUID NOT NULL REFERENCES me_documents(id) ON DELETE CASCADE,
          chunk_index  INT NOT NULL,
          content      TEXT NOT NULL,
          embedding    DOUBLE PRECISION[] NOT NULL,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    }
    await db`CREATE INDEX IF NOT EXISTS me_chunks_document_idx ON me_chunks (document_id)`

    return { pgvector }
  })()
  return schemaReady
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function rowToProfile(row: any): MeProfile {
  return {
    bio: row.bio ?? '',
    projects: row.projects ?? '',
    academy: row.academy ?? '',
    social: row.social ?? '',
    voice: row.voice ?? '',
    custom: row.custom ?? {},
    updated_at:
      typeof row.updated_at === 'string'
        ? row.updated_at
        : new Date(row.updated_at ?? 0).toISOString(),
  }
}

function rowToDocument(row: any): MeDocumentRow {
  return {
    id: String(row.id),
    user_id: row.user_id ?? null,
    created_at:
      typeof row.created_at === 'string'
        ? row.created_at
        : new Date(row.created_at ?? 0).toISOString(),
    title: row.title ?? '',
    source_type: row.source_type ?? 'paste',
    source_meta: row.source_meta ?? {},
    char_count: Number(row.char_count ?? 0),
    chunk_count: Number(row.chunk_count ?? 0),
    pinned: Boolean(row.pinned),
  }
}

// ─── Profile ────────────────────────────────────────────────────────────────

export async function loadProfile(): Promise<MeProfile> {
  const db = getDb()
  if (!db) return EMPTY_PROFILE
  try {
    await ensureSchema()
    const [row] = await db`SELECT * FROM me_profile WHERE id = ${SINGLETON}`
    return row ? rowToProfile(row) : EMPTY_PROFILE
  } catch (e: any) {
    console.warn('[me-db] loadProfile failed:', e?.message)
    return EMPTY_PROFILE
  }
}

export async function saveProfile(p: Partial<MeProfile>): Promise<MeProfile | null> {
  const db = getDb()
  if (!db) return null
  try {
    await ensureSchema()
    const [row] = await db`
      INSERT INTO me_profile (id, bio, projects, academy, social, voice, custom, updated_at)
      VALUES (
        ${SINGLETON}, ${p.bio ?? ''}, ${p.projects ?? ''}, ${p.academy ?? ''},
        ${p.social ?? ''}, ${p.voice ?? ''}, ${db.json(p.custom ?? {})}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        bio        = EXCLUDED.bio,
        projects   = EXCLUDED.projects,
        academy    = EXCLUDED.academy,
        social     = EXCLUDED.social,
        voice      = EXCLUDED.voice,
        custom     = EXCLUDED.custom,
        updated_at = NOW()
      RETURNING *
    `
    return row ? rowToProfile(row) : null
  } catch (e: any) {
    console.warn('[me-db] saveProfile failed:', e?.message)
    return null
  }
}

export function profileToContext(p: MeProfile): string {
  const parts: string[] = []
  if (p.bio.trim()) parts.push(`## О пользователе\n${p.bio.trim()}`)
  if (p.projects.trim()) parts.push(`## Проекты\n${p.projects.trim()}`)
  if (p.academy.trim()) parts.push(`## Академия / знания\n${p.academy.trim()}`)
  if (p.social.trim()) parts.push(`## Соцсети\n${p.social.trim()}`)
  if (p.voice.trim()) parts.push(`## Голос и стиль\n${p.voice.trim()}`)
  const custom = Object.entries(p.custom ?? {}).filter(([, v]) => typeof v === 'string' && v.trim())
  for (const [k, v] of custom) parts.push(`## ${k}\n${v.trim()}`)
  return parts.join('\n\n')
}

// ─── Documents ──────────────────────────────────────────────────────────────

export async function listDocuments(userId: string, limit = 200): Promise<MeDocumentRow[]> {
  const db = getDb()
  if (!db) return []
  try {
    await ensureSchema()
    const rows = await db`
      SELECT * FROM me_documents
      WHERE user_id = ${userId}
      ORDER BY pinned DESC, created_at DESC
      LIMIT ${limit}
    `
    return (rows as any[]).map(rowToDocument)
  } catch (e: any) {
    console.warn('[me-db] listDocuments failed:', e?.message)
    return []
  }
}

export async function libraryStats(userId: string): Promise<LibraryStats> {
  const db = getDb()
  if (!db) return { documents: 0, chunks: 0, chars: 0, pinned: 0 }
  try {
    await ensureSchema()
    const [row] = await db`
      SELECT
        COUNT(*)::int                                        AS documents,
        COALESCE(SUM(chunk_count), 0)::int                   AS chunks,
        COALESCE(SUM(char_count), 0)::int                    AS chars,
        COALESCE(SUM(CASE WHEN pinned THEN 1 ELSE 0 END), 0)::int AS pinned
      FROM me_documents
      WHERE user_id = ${userId}
    `
    return {
      documents: Number(row?.documents ?? 0),
      chunks: Number(row?.chunks ?? 0),
      chars: Number(row?.chars ?? 0),
      pinned: Number(row?.pinned ?? 0),
    }
  } catch (e: any) {
    console.warn('[me-db] libraryStats failed:', e?.message)
    return { documents: 0, chunks: 0, chars: 0, pinned: 0 }
  }
}

export async function getDocument(id: string, userId: string): Promise<MeDocumentRow | null> {
  const db = getDb()
  if (!db) return null
  try {
    await ensureSchema()
    const [row] = await db`
      SELECT * FROM me_documents
      WHERE id = ${id}::uuid AND user_id = ${userId}
    `
    return row ? rowToDocument(row) : null
  } catch (e: any) {
    console.warn('[me-db] getDocument failed:', e?.message)
    return null
  }
}

export async function deleteDocument(id: string, userId: string): Promise<boolean> {
  const db = getDb()
  if (!db) return false
  try {
    await ensureSchema()
    const r = await db`
      DELETE FROM me_documents
      WHERE id = ${id}::uuid AND user_id = ${userId}
    `
    return (r as any).count > 0
  } catch (e: any) {
    console.warn('[me-db] deleteDocument failed:', e?.message)
    return false
  }
}

export async function updateDocumentTitle(
  id: string,
  userId: string,
  title: string,
): Promise<MeDocumentRow | null> {
  const db = getDb()
  if (!db) return null
  try {
    await ensureSchema()
    const [row] = await db`
      UPDATE me_documents SET title = ${title}
      WHERE id = ${id}::uuid AND user_id = ${userId}
      RETURNING *
    `
    return row ? rowToDocument(row) : null
  } catch (e: any) {
    console.warn('[me-db] updateDocumentTitle failed:', e?.message)
    return null
  }
}

export async function setDocumentPinned(
  id: string,
  userId: string,
  pinned: boolean,
): Promise<MeDocumentRow | null> {
  const db = getDb()
  if (!db) return null
  try {
    await ensureSchema()
    const [row] = await db`
      UPDATE me_documents SET pinned = ${pinned}
      WHERE id = ${id}::uuid AND user_id = ${userId}
      RETURNING *
    `
    return row ? rowToDocument(row) : null
  } catch (e: any) {
    console.warn('[me-db] setDocumentPinned failed:', e?.message)
    return null
  }
}

export interface CreateDocumentInput {
  user_id: string
  title: string
  source_type: 'paste' | 'file' | 'transcript'
  source_meta?: Record<string, any>
  original_text: string
  chunks: string[]
  embeddings: number[][]
}

export async function createDocumentWithEmbeddings(
  input: CreateDocumentInput,
): Promise<MeDocumentRow | null> {
  const db = getDb()
  if (!db) return null
  if (input.chunks.length !== input.embeddings.length) {
    throw new Error(`chunks (${input.chunks.length}) != embeddings (${input.embeddings.length})`)
  }
  try {
    const { pgvector } = await ensureSchema()
    return (await db.begin(async (tx: any) => {
      const [doc] = await tx`
        INSERT INTO me_documents (
          user_id, title, source_type, source_meta, original_text,
          char_count, chunk_count
        )
        VALUES (
          ${input.user_id}, ${input.title}, ${input.source_type},
          ${tx.json(input.source_meta ?? {})}, ${input.original_text},
          ${input.original_text.length}, ${input.chunks.length}
        )
        RETURNING *
      `
      const docId = doc.id as string
      for (let i = 0; i < input.chunks.length; i++) {
        const content = input.chunks[i]!
        const vec = input.embeddings[i]!
        if (pgvector) {
          // pgvector accepts the text literal `[v1,v2,...]` for inserts.
          const vecLit = `[${vec.join(',')}]`
          await tx`
            INSERT INTO me_chunks (document_id, chunk_index, content, embedding)
            VALUES (${docId}::uuid, ${i}, ${content}, ${vecLit}::vector)
          `
        } else {
          await tx`
            INSERT INTO me_chunks (document_id, chunk_index, content, embedding)
            VALUES (${docId}::uuid, ${i}, ${content}, ${vec as any})
          `
        }
      }
      return rowToDocument(doc)
    })) as MeDocumentRow
  } catch (e: any) {
    console.warn('[me-db] createDocumentWithEmbeddings failed:', e?.message)
    return null
  }
}

export interface ReplaceDocumentInput {
  id: string
  user_id: string
  title?: string
  text: string
  chunks: string[]
  embeddings: number[][]
}

export async function replaceDocumentText(
  input: ReplaceDocumentInput,
): Promise<MeDocumentRow | null> {
  const db = getDb()
  if (!db) return null
  try {
    const { pgvector } = await ensureSchema()
    return (await db.begin(async (tx: any) => {
      await tx`DELETE FROM me_chunks WHERE document_id = ${input.id}::uuid`
      const [doc] = await tx`
        UPDATE me_documents SET
          title         = COALESCE(${input.title ?? null}, title),
          original_text = ${input.text},
          char_count    = ${input.text.length},
          chunk_count   = ${input.chunks.length}
        WHERE id = ${input.id}::uuid AND user_id = ${input.user_id}
        RETURNING *
      `
      if (!doc) return null
      for (let i = 0; i < input.chunks.length; i++) {
        const content = input.chunks[i]!
        const vec = input.embeddings[i]!
        if (pgvector) {
          const vecLit = `[${vec.join(',')}]`
          await tx`
            INSERT INTO me_chunks (document_id, chunk_index, content, embedding)
            VALUES (${input.id}::uuid, ${i}, ${content}, ${vecLit}::vector)
          `
        } else {
          await tx`
            INSERT INTO me_chunks (document_id, chunk_index, content, embedding)
            VALUES (${input.id}::uuid, ${i}, ${content}, ${vec as any})
          `
        }
      }
      return rowToDocument(doc)
    })) as MeDocumentRow | null
  } catch (e: any) {
    console.warn('[me-db] replaceDocumentText failed:', e?.message)
    return null
  }
}

// ─── Search ─────────────────────────────────────────────────────────────────

export async function searchChunks(
  userId: string,
  queryVec: number[],
  topK = 8,
  restrictDocIds?: string[],
): Promise<MeChunkMatch[]> {
  const db = getDb()
  if (!db) return []
  try {
    const { pgvector } = await ensureSchema()
    if (pgvector) {
      const vecLit = `[${queryVec.join(',')}]`
      const docFilter = restrictDocIds && restrictDocIds.length > 0
        ? db`AND c.document_id = ANY(${restrictDocIds}::uuid[])`
        : db``
      const rows = await db`
        SELECT
          c.id,
          c.document_id,
          d.title AS document_title,
          c.chunk_index,
          c.content,
          1 - (c.embedding <=> ${vecLit}::vector) AS similarity
        FROM me_chunks c
        JOIN me_documents d ON d.id = c.document_id
        WHERE d.user_id = ${userId}
        ${docFilter}
        ORDER BY c.embedding <=> ${vecLit}::vector
        LIMIT ${topK}
      `
      return (rows as any[]).map((r) => ({
        id: String(r.id),
        document_id: String(r.document_id),
        document_title: r.document_title,
        chunk_index: Number(r.chunk_index),
        content: r.content,
        similarity: Number(r.similarity),
      }))
    }

    // JS-side cosine fallback (no pgvector available).
    const docFilter = restrictDocIds && restrictDocIds.length > 0
      ? db`AND c.document_id = ANY(${restrictDocIds}::uuid[])`
      : db``
    const rows = (await db`
      SELECT c.id, c.document_id, d.title AS document_title,
             c.chunk_index, c.content, c.embedding
      FROM me_chunks c
      JOIN me_documents d ON d.id = c.document_id
      WHERE d.user_id = ${userId}
      ${docFilter}
    `) as any[]
    const scored = rows.map((r) => ({
      id: String(r.id),
      document_id: String(r.document_id),
      document_title: r.document_title,
      chunk_index: Number(r.chunk_index),
      content: r.content,
      similarity: cosine(queryVec, r.embedding as number[]),
    }))
    scored.sort((a, b) => b.similarity - a.similarity)
    return scored.slice(0, topK)
  } catch (e: any) {
    console.warn('[me-db] searchChunks failed:', e?.message)
    return []
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i]!
    const y = b[i]!
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
