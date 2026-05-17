import { getDb, embeddingToBuffer } from './db'

export type ProjectCard = {
  id: string
  name: string
  description: string
  stage: string
  metrics: string
}

export type MeProfile = {
  bio: string
  projects: string
  projects_list: ProjectCard[]
  academy: string
  social: string
  voice: string
  custom: Record<string, string>
  updated_at: string
}

export const EMPTY_PROFILE: MeProfile = {
  bio: '',
  projects: '',
  projects_list: [],
  academy: '',
  social: '',
  voice: '',
  custom: {},
  updated_at: new Date(0).toISOString(),
}

export type MeDocumentRow = {
  id: number
  created_at: string
  title: string
  source_type: 'paste' | 'file' | 'transcript'
  source_meta: Record<string, any>
  char_count: number
  chunk_count: number
}

export type MeDocumentFullRow = MeDocumentRow & {
  original_text: string
}

export type MeChunkMatch = {
  id: number
  document_id: number
  document_title: string
  chunk_index: number
  content: string
  similarity: number
}

function safeParseObject(s: string | null | undefined): Record<string, any> {
  if (!s) return {}
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** Local SQLite is always available; kept for callsite parity with the old Supabase API. */
export function isDbConfigured(): boolean {
  return true
}

function safeParseProjects(s: string | null | undefined): ProjectCard[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    if (!Array.isArray(v)) return []
    return v
      .filter((p) => p && typeof p === 'object')
      .map((p: any) => ({
        id: typeof p.id === 'string' ? p.id : String(p.id ?? Math.random()),
        name: typeof p.name === 'string' ? p.name : '',
        description: typeof p.description === 'string' ? p.description : '',
        stage: typeof p.stage === 'string' ? p.stage : '',
        metrics: typeof p.metrics === 'string' ? p.metrics : '',
      }))
  } catch {
    return []
  }
}

export function loadProfile(): MeProfile {
  const row = getDb()
    .prepare(
      `SELECT bio, projects, projects_list, academy, social, voice, custom, updated_at
       FROM me_profile WHERE id = 'singleton'`,
    )
    .get() as
    | {
        bio: string
        projects: string
        projects_list: string
        academy: string
        social: string
        voice: string
        custom: string
        updated_at: string
      }
    | undefined

  if (!row) return EMPTY_PROFILE
  return {
    bio: row.bio ?? '',
    projects: row.projects ?? '',
    projects_list: safeParseProjects(row.projects_list),
    academy: row.academy ?? '',
    social: row.social ?? '',
    voice: row.voice ?? '',
    custom: safeParseObject(row.custom),
    updated_at: row.updated_at ?? new Date(0).toISOString(),
  }
}

export function saveProfile(p: Partial<MeProfile>): MeProfile {
  const now = new Date().toISOString()
  const projectsList = Array.isArray(p.projects_list) ? p.projects_list : []
  getDb()
    .prepare(
      `INSERT INTO me_profile (id, bio, projects, projects_list, academy, social, voice, custom, updated_at)
       VALUES ('singleton', ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         bio = excluded.bio,
         projects = excluded.projects,
         projects_list = excluded.projects_list,
         academy = excluded.academy,
         social = excluded.social,
         voice = excluded.voice,
         custom = excluded.custom,
         updated_at = excluded.updated_at`,
    )
    .run(
      p.bio ?? '',
      p.projects ?? '',
      JSON.stringify(projectsList),
      p.academy ?? '',
      p.social ?? '',
      p.voice ?? '',
      JSON.stringify(p.custom ?? {}),
      now,
    )
  return loadProfile()
}

export function profileToContext(p: MeProfile): string {
  const parts: string[] = []
  if (p.bio.trim()) parts.push(`## О пользователе\n${p.bio.trim()}`)

  const cards = (p.projects_list ?? []).filter(
    (c) => c.name.trim() || c.description.trim() || c.stage.trim() || c.metrics.trim(),
  )
  if (cards.length > 0 || p.projects.trim()) {
    let block = '## Проекты'
    if (cards.length > 0) {
      block +=
        '\n' +
        cards
          .map((c) => {
            const head = c.name.trim() || '(без названия)'
            const meta: string[] = []
            if (c.stage.trim()) meta.push(`стадия: ${c.stage.trim()}`)
            if (c.metrics.trim()) meta.push(`метрики: ${c.metrics.trim()}`)
            const metaLine = meta.length ? ` _(${meta.join(' · ')})_` : ''
            const desc = c.description.trim() ? `\n${c.description.trim()}` : ''
            return `- **${head}**${metaLine}${desc}`
          })
          .join('\n')
    }
    if (p.projects.trim()) {
      block += (cards.length > 0 ? '\n\n### Заметки\n' : '\n') + p.projects.trim()
    }
    parts.push(block)
  }

  if (p.academy.trim()) parts.push(`## Академия / знания\n${p.academy.trim()}`)
  if (p.social.trim()) parts.push(`## Соцсети\n${p.social.trim()}`)
  if (p.voice.trim()) parts.push(`## Голос и стиль\n${p.voice.trim()}`)
  const custom = Object.entries(p.custom ?? {}).filter(
    ([, v]) => typeof v === 'string' && v.trim(),
  )
  for (const [k, v] of custom) parts.push(`## ${k}\n${v.trim()}`)
  return parts.join('\n\n')
}

export type LibraryStats = {
  documents: number
  chunks: number
  characters: number
  last_added_at: string | null
  by_source: { paste: number; file: number; transcript: number }
}

export function libraryStats(): LibraryStats {
  const db = getDb()
  const agg = db
    .prepare(
      `SELECT COUNT(*) AS documents,
              COALESCE(SUM(chunk_count), 0) AS chunks,
              COALESCE(SUM(char_count), 0) AS characters,
              MAX(created_at) AS last_added_at
       FROM me_documents`,
    )
    .get() as { documents: number | bigint; chunks: number | bigint; characters: number | bigint; last_added_at: string | null }
  const rows = db
    .prepare(
      `SELECT source_type, COUNT(*) AS cnt FROM me_documents GROUP BY source_type`,
    )
    .all() as Array<{ source_type: 'paste' | 'file' | 'transcript'; cnt: number | bigint }>
  const by_source = { paste: 0, file: 0, transcript: 0 }
  for (const r of rows) by_source[r.source_type] = Number(r.cnt)
  return {
    documents: Number(agg.documents),
    chunks: Number(agg.chunks),
    characters: Number(agg.characters),
    last_added_at: agg.last_added_at,
    by_source,
  }
}

export function listDocuments(limit = 200): MeDocumentRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, created_at, title, source_type, source_meta, char_count, chunk_count
       FROM me_documents ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Array<
    Omit<MeDocumentRow, 'source_meta'> & { source_meta: string }
  >
  return rows.map((r) => ({ ...r, source_meta: safeParseObject(r.source_meta) }))
}

export function getDocument(id: number): MeDocumentFullRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, created_at, title, source_type, source_meta, original_text, char_count, chunk_count
       FROM me_documents WHERE id = ?`,
    )
    .get(id) as
    | (Omit<MeDocumentFullRow, 'source_meta'> & { source_meta: string })
    | undefined
  if (!row) return null
  return { ...row, source_meta: safeParseObject(row.source_meta) }
}

export function deleteDocument(id: number): boolean {
  const db = getDb()
  const tx = db.transaction((docId: number) => {
    const chunkIds = db
      .prepare(`SELECT id FROM me_chunks WHERE document_id = ?`)
      .all(docId) as Array<{ id: number }>
    const delVec = db.prepare(`DELETE FROM vec_me_chunks WHERE rowid = ?`)
    for (const { id: cid } of chunkIds) delVec.run(cid)
    const info = db.prepare(`DELETE FROM me_documents WHERE id = ?`).run(docId)
    return info.changes > 0
  })
  return tx(id)
}

export function createDocumentWithEmbeddings(input: {
  title: string
  source_type: 'paste' | 'file' | 'transcript'
  source_meta: Record<string, any>
  original_text: string
  chunks: string[]
  embeddings: number[][]
}): MeDocumentRow {
  if (input.chunks.length !== input.embeddings.length) {
    throw new Error('chunks and embeddings length mismatch')
  }
  const db = getDb()
  const tx = db.transaction(() => {
    const docInfo = db
      .prepare(
        `INSERT INTO me_documents (title, source_type, source_meta, original_text, char_count, chunk_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.title,
        input.source_type,
        JSON.stringify(input.source_meta ?? {}),
        input.original_text,
        input.original_text.length,
        input.chunks.length,
      )
    const docId = Number(docInfo.lastInsertRowid)

    const insChunk = db.prepare(
      `INSERT INTO me_chunks (document_id, chunk_index, content) VALUES (?, ?, ?)`,
    )
    const insVec = db.prepare(`INSERT INTO vec_me_chunks (rowid, embedding) VALUES (?, ?)`)
    for (let i = 0; i < input.chunks.length; i++) {
      const chunkInfo = insChunk.run(docId, i, input.chunks[i])
      const chunkId = Number(chunkInfo.lastInsertRowid)
      insVec.run(chunkId, embeddingToBuffer(input.embeddings[i]))
    }
    return docId
  })
  const docId = tx()
  const row = db
    .prepare(
      `SELECT id, created_at, title, source_type, source_meta, char_count, chunk_count
       FROM me_documents WHERE id = ?`,
    )
    .get(docId) as Omit<MeDocumentRow, 'source_meta'> & { source_meta: string }
  return { ...row, source_meta: safeParseObject(row.source_meta) }
}

export function updateDocumentTitle(id: number, title: string): MeDocumentRow | null {
  const db = getDb()
  const info = db.prepare(`UPDATE me_documents SET title = ? WHERE id = ?`).run(title, id)
  if (info.changes === 0) return null
  const row = db
    .prepare(
      `SELECT id, created_at, title, source_type, source_meta, char_count, chunk_count
       FROM me_documents WHERE id = ?`,
    )
    .get(id) as (Omit<MeDocumentRow, 'source_meta'> & { source_meta: string }) | undefined
  return row ? { ...row, source_meta: safeParseObject(row.source_meta) } : null
}

/** Atomically replace the document text + all its chunks/embeddings. */
export function replaceDocumentText(input: {
  id: number
  title?: string
  text: string
  chunks: string[]
  embeddings: number[][]
}): MeDocumentRow | null {
  if (input.chunks.length !== input.embeddings.length) {
    throw new Error('chunks and embeddings length mismatch')
  }
  const db = getDb()
  const tx = db.transaction(() => {
    const exists = db.prepare(`SELECT id FROM me_documents WHERE id = ?`).get(input.id)
    if (!exists) return false

    const oldChunks = db
      .prepare(`SELECT id FROM me_chunks WHERE document_id = ?`)
      .all(input.id) as Array<{ id: number }>
    const delVec = db.prepare(`DELETE FROM vec_me_chunks WHERE rowid = ?`)
    for (const { id } of oldChunks) delVec.run(id)
    db.prepare(`DELETE FROM me_chunks WHERE document_id = ?`).run(input.id)

    db.prepare(
      `UPDATE me_documents
       SET title = COALESCE(?, title),
           original_text = ?,
           char_count = ?,
           chunk_count = ?
       WHERE id = ?`,
    ).run(input.title ?? null, input.text, input.text.length, input.chunks.length, input.id)

    const insChunk = db.prepare(
      `INSERT INTO me_chunks (document_id, chunk_index, content) VALUES (?, ?, ?)`,
    )
    const insVec = db.prepare(`INSERT INTO vec_me_chunks (rowid, embedding) VALUES (?, ?)`)
    for (let i = 0; i < input.chunks.length; i++) {
      const info = insChunk.run(input.id, i, input.chunks[i])
      insVec.run(Number(info.lastInsertRowid), embeddingToBuffer(input.embeddings[i]))
    }
    return true
  })
  const ok = tx()
  if (!ok) return null
  const row = db
    .prepare(
      `SELECT id, created_at, title, source_type, source_meta, char_count, chunk_count
       FROM me_documents WHERE id = ?`,
    )
    .get(input.id) as (Omit<MeDocumentRow, 'source_meta'> & { source_meta: string }) | undefined
  return row ? { ...row, source_meta: safeParseObject(row.source_meta) } : null
}

export function searchChunks(queryEmbedding: number[], k = 8): MeChunkMatch[] {
  const buf = embeddingToBuffer(queryEmbedding)
  const rows = getDb()
    .prepare(
      `SELECT
         c.id, c.document_id, c.chunk_index, c.content,
         d.title AS document_title,
         vec.distance
       FROM vec_me_chunks AS vec
       JOIN me_chunks AS c ON c.id = vec.rowid
       JOIN me_documents AS d ON d.id = c.document_id
       WHERE vec.embedding MATCH ? AND k = ?
       ORDER BY vec.distance`,
    )
    .all(buf, k) as Array<{
    id: number
    document_id: number
    chunk_index: number
    content: string
    document_title: string
    distance: number
  }>
  return rows.map((r) => ({
    id: r.id,
    document_id: r.document_id,
    document_title: r.document_title,
    chunk_index: r.chunk_index,
    content: r.content,
    similarity: 1 - r.distance,
  }))
}
