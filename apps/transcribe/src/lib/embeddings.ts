// Embedding model wrapper. Currently uses OpenAI text-embedding-3-small (1536 dim).
// To swap to Voyage AI later, replace the fetch call and update the migration's vector dim.

const MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIM = 1536

export async function embed(input: string): Promise<number[]> {
  const text = input.trim()
  if (!text) throw new Error('embed: empty input')

  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY не настроен на сервере')

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: MODEL, input: text }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI embeddings (${res.status}): ${errText.slice(0, 300)}`)
  }

  const data = await res.json()
  const vec = data.data?.[0]?.embedding
  if (!Array.isArray(vec)) throw new Error('embed: malformed response')
  return vec as number[]
}

export async function embedBatch(inputs: string[]): Promise<number[][]> {
  const cleaned = inputs.map((s) => s.trim()).filter((s) => s.length > 0)
  if (cleaned.length === 0) return []

  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY не настроен на сервере')

  // OpenAI accepts arrays of up to ~2048 inputs per call. Chunk in batches of 96.
  const BATCH = 96
  const out: number[][] = []
  for (let i = 0; i < cleaned.length; i += BATCH) {
    const slice = cleaned.slice(i, i + BATCH)
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, input: slice }),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`OpenAI embeddings (${res.status}): ${errText.slice(0, 300)}`)
    }
    const data = await res.json()
    const vectors = data.data?.map((d: any) => d.embedding) as number[][] | undefined
    if (!Array.isArray(vectors) || vectors.length !== slice.length) {
      throw new Error('embedBatch: malformed response')
    }
    out.push(...vectors)
  }
  return out
}
