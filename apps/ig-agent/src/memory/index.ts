// Memory indexer for ig-agent — every Instagram DM (incoming or
// outgoing) lands as one point in the shared `aicex-memory` Qdrant
// collection. The schema mirrors tg-agent / transcribe so the
// existing search / RAG surfaces in the tg-agent admin work across
// all three sources uniformly.
//
// Fire-and-forget from the bot pipeline — never blocks the webhook
// handler or the AI reply path.

import { createHash } from 'node:crypto'
import OpenAI from 'openai'

import { createQdrantClient, type QdrantClient, type QdrantPayload } from './qdrant.js'
import type { Logger } from '../logger.js'

const COLLECTION = process.env.QDRANT_COLLECTION ?? 'aicex-memory'
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://aisales-qdrant:6333'
const QDRANT_API_KEY = process.env.QDRANT_API_KEY
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small'
const EMBEDDING_DIM = 1536
const MEMORY_ENABLED = (process.env.MEMORY_ENABLED ?? 'true').toLowerCase() !== 'false'
const OPENAI_KEY = process.env.OPENAI_API_KEY

let openai: OpenAI | null = null
let qdrant: QdrantClient | null = null
let ensured: Promise<void> | null = null

function initOnce(): boolean {
  if (!MEMORY_ENABLED) return false
  if (!OPENAI_KEY) return false
  if (!openai) openai = new OpenAI({ apiKey: OPENAI_KEY })
  if (!qdrant) {
    qdrant = createQdrantClient({
      url: QDRANT_URL,
      collection: COLLECTION,
      apiKey: QDRANT_API_KEY,
    })
  }
  return true
}

async function ensure(): Promise<void> {
  if (!qdrant) return
  if (!ensured) ensured = qdrant.ensureCollection(EMBEDDING_DIM)
  return ensured
}

// Deterministic UUID v5 for the shared collection. Matches the
// helper in tg-agent's memory/service.ts and transcribe's memory/
// index.ts so cross-app point ids are predictable.
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

export interface IgIndexInput {
  // tg_messages-style natural key — we use messages.id from the
  // ig_agent Postgres so re-indexing is idempotent.
  naturalKey: string
  // 'incoming' | 'outgoing' — surfaces in payload.kind so the admin
  // UI can colour-code who said what.
  direction: 'incoming' | 'outgoing'
  text: string
  ownerTelegramId: number | null
  // Contact identifier — username & display name for the result card.
  contactId: string
  igUsername: string | null
  contactName: string | null
  // ig-agent's classifier output. Surfaced as `class` so existing
  // tg-agent search UI renders it the same way.
  intent: string | null
  createdAt: string
}

async function embed(text: string): Promise<number[]> {
  if (!openai) throw new Error('memory: openai not initialised')
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  })
  const v = res.data[0]?.embedding
  if (!v) throw new Error('memory: empty embedding')
  return v
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!openai) throw new Error('memory: openai not initialised')
  if (texts.length === 0) return []
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
  })
  return res.data.map((d) => d.embedding)
}

function inputToPayload(input: IgIndexInput): QdrantPayload {
  // Map to the shared schema. `chat_id` is null (Instagram has no
  // group chat concept here); `class` gets the intent label;
  // `username` carries the IG handle; `title` carries the contact
  // display name. `url` is null — could become the IG profile URL
  // later if we surface it.
  return {
    source: 'ig-agent',
    kind: `instagram_${input.direction}`,
    owner_telegram_id: input.ownerTelegramId,
    chat_id: null,
    chat_title: null,
    user_id: null,
    username: input.igUsername,
    class: input.intent,
    title: input.contactName,
    url: input.igUsername ? `https://instagram.com/${input.igUsername}` : null,
    text: input.text,
    created_at: input.createdAt,
  }
}

export async function indexIgMessage(input: IgIndexInput, logger?: Logger): Promise<boolean> {
  if (!initOnce()) return false
  const text = input.text.trim()
  if (text.length < 2) return false
  try {
    await ensure()
    const vector = await embed(text)
    await qdrant!.upsert([
      {
        id: pointIdFor('ig-agent', input.naturalKey),
        vector,
        payload: inputToPayload(input),
      },
    ])
    return true
  } catch (err) {
    logger?.warn?.('memory: indexIgMessage failed', {
      naturalKey: input.naturalKey,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

export async function indexIgBatch(
  items: IgIndexInput[],
  logger?: Logger,
): Promise<{ indexed: number; failed: number }> {
  if (!initOnce()) return { indexed: 0, failed: 0 }
  if (items.length === 0) return { indexed: 0, failed: 0 }

  await ensure()

  const BATCH = 96
  let indexed = 0
  let failed = 0

  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH)
    try {
      const texts = slice.map((s) => s.text.trim())
      const vectors = await embedBatch(texts)
      const points = slice.map((s, j) => ({
        id: pointIdFor('ig-agent', s.naturalKey),
        vector: vectors[j]!,
        payload: inputToPayload(s),
      }))
      await qdrant!.upsert(points)
      indexed += points.length
      logger?.info?.('memory: batch indexed', {
        from: i,
        to: i + slice.length,
        total: items.length,
      })
    } catch (err) {
      failed += slice.length
      logger?.error?.('memory: batch failed', {
        from: i,
        count: slice.length,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { indexed, failed }
}

export const memoryEnabled = MEMORY_ENABLED && Boolean(OPENAI_KEY)
