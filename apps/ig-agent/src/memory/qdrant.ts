// Thin Qdrant REST client for the shared "aicex-memory" collection.
// Mirrors apps/tg-agent/src/memory/qdrant.ts schema-wise so both apps
// write into the same vector store with consistent payload shape.

export interface QdrantPayload {
  source: string
  kind: string
  owner_telegram_id: number | null
  // tg-agent fields — nullable here
  chat_id: number | null
  chat_title: string | null
  user_id: number | null
  username: string | null
  class: string | null
  // transcribe / document fields
  title: string | null
  url: string | null
  // body of the embedded text, stored on the payload
  text: string
  created_at: string
}

export interface QdrantPoint {
  id: string
  vector: number[]
  payload: QdrantPayload
}

export interface QdrantClient {
  upsert(points: QdrantPoint[]): Promise<void>
  ensureCollection(vectorSize: number): Promise<void>
}

export interface QdrantClientOptions {
  url: string
  collection: string
  apiKey?: string
}

export function createQdrantClient(opts: QdrantClientOptions): QdrantClient {
  const base = opts.url.replace(/\/+$/, '')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.apiKey) headers['api-key'] = opts.apiKey

  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`qdrant ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
    }
    return (text ? JSON.parse(text) : null) as T
  }

  const coll = opts.collection

  return {
    async ensureCollection(vectorSize: number): Promise<void> {
      const probe = await fetch(`${base}/collections/${coll}`, { headers })
      if (probe.ok) return // already exists; tg-agent created it
      if (probe.status !== 404) {
        throw new Error(`qdrant probe ${probe.status}: ${await probe.text()}`)
      }
      await req('PUT', `/collections/${coll}`, {
        vectors: { size: vectorSize, distance: 'Cosine' },
      })
    },

    async upsert(points): Promise<void> {
      if (points.length === 0) return
      await req('PUT', `/collections/${coll}/points?wait=true`, { points })
    },
  }
}
