// Shared semantic memory indexer for transcribe → "aicex-memory"
// Qdrant collection. Hooks into the transcripts/summaries/me_documents
// write paths so the second-brain stays in sync.
//
// Indexes only the owner's content (filtered by OWNER_TELEGRAM_ID).
// Non-owner transcripts stay out of the brain.
//
// The collection is created on first call (idempotent — tg-agent
// already creates it, so usually this is a no-op probe). All calls
// are fire-and-forget on the write-path; failures only log.

import { createHash } from 'node:crypto'

import { embed, embedBatch, EMBEDDING_DIM } from '../embeddings'
import { createQdrantClient, type QdrantClient, type QdrantPayload } from './qdrant'

const COLLECTION = process.env.QDRANT_COLLECTION ?? 'aicex-memory'
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://aisales-qdrant:6333'
const QDRANT_API_KEY = process.env.QDRANT_API_KEY
const ENABLED = (process.env.MEMORY_ENABLED ?? 'true').toLowerCase() !== 'false'

let cached: QdrantClient | null = null
let ensured: Promise<void> | null = null

function client(): QdrantClient | null {
  if (!ENABLED) return null
  if (!process.env.OPENAI_API_KEY) return null
  if (!cached) {
    cached = createQdrantClient({
      url: QDRANT_URL,
      collection: COLLECTION,
      apiKey: QDRANT_API_KEY,
    })
  }
  return cached
}

async function ensure(): Promise<void> {
  const c = client()
  if (!c) return
  if (!ensured) ensured = c.ensureCollection(EMBEDDING_DIM)
  return ensured
}

// Deterministic UUID v5 (matches helper in apps/tg-agent/src/memory/service.ts).
export function pointIdFor(source: string, naturalKey: string): string {
  const hash = createHash('sha1').update(`${source}:${naturalKey}`).digest('hex')
  const a = hash.slice(0, 8)
  const b = hash.slice(8, 12)
  const c = '5' + hash.slice(13, 16)
  const v = (parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80
  const d = v.toString(16).padStart(2, '0') + hash.slice(18, 20)
  const e = hash.slice(20, 32)
  return `${a}-${b}-${c}-${d}-${e}`
}

export interface IndexInput {
  // Unique key within the source, e.g. transcripts.id (UUID).
  naturalKey: string
  // 'transcript' | 'summary' | 'document'.
  kind: string
  text: string
  // Telegram ID of the user this row belongs to (the brain owner).
  ownerTelegramId: number | null
  title: string | null
  url: string | null
  createdAt: string
}

/**
 * Embed and upsert a single row into the shared memory collection.
 * Fire-and-forget from the API caller's perspective — we still await
 * the embed / upsert here, but callers wrap with `.catch(() => {})`.
 *
 * Returns true on success, false on disabled / failure.
 */
export async function indexTranscribeRow(input: IndexInput): Promise<boolean> {
  const c = client()
  if (!c) return false
  const text = input.text.trim()
  if (text.length < 10) return false

  try {
    await ensure()
    const vector = await embed(text.slice(0, 8000))
    const payload: QdrantPayload = {
      source: 'transcribe',
      kind: input.kind,
      owner_telegram_id: input.ownerTelegramId,
      chat_id: null,
      chat_title: null,
      user_id: null,
      username: null,
      class: null,
      title: input.title,
      url: input.url,
      text,
      created_at: input.createdAt,
    }
    await c.upsert([
      {
        id: pointIdFor('transcribe', input.naturalKey),
        vector,
        payload,
      },
    ])
    return true
  } catch (err) {
    console.error(
      'memory: indexTranscribeRow failed',
      err instanceof Error ? err.message : String(err),
    )
    return false
  }
}

/**
 * Batch version used by the backfill script. Embeds & upserts in
 * chunks of 96 (OpenAI batch comfort zone). Reports indexed/failed.
 */
export async function indexTranscribeBatch(
  items: IndexInput[],
): Promise<{ indexed: number; failed: number }> {
  const c = client()
  if (!c) return { indexed: 0, failed: 0 }
  if (items.length === 0) return { indexed: 0, failed: 0 }

  await ensure()

  const BATCH = 96
  let indexed = 0
  let failed = 0

  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH)
    try {
      const texts = slice.map((s) => s.text.slice(0, 8000))
      const vectors = await embedBatch(texts)
      const points = slice.map((s, j) => ({
        id: pointIdFor('transcribe', s.naturalKey),
        vector: vectors[j]!,
        payload: {
          source: 'transcribe',
          kind: s.kind,
          owner_telegram_id: s.ownerTelegramId,
          chat_id: null,
          chat_title: null,
          user_id: null,
          username: null,
          class: null,
          title: s.title,
          url: s.url,
          text: s.text,
          created_at: s.createdAt,
        } as QdrantPayload,
      }))
      await c.upsert(points)
      indexed += points.length
      console.log(`memory: batch indexed ${i + slice.length}/${items.length}`)
    } catch (err) {
      failed += slice.length
      console.error(
        `memory: batch failed at ${i}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
  return { indexed, failed }
}

export const memoryEnabled = ENABLED
