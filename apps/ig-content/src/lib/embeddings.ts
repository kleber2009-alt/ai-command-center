import { isDemo } from './demo/store'

// OpenAI text-embedding-3-small. 1536 dims (must match the vector() column in
// migration 002). Provider is isolated here so it can be swapped later.
const MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIM = 1536

export function embeddingsEnabled(): boolean {
  return !isDemo() && !!process.env.OPENAI_API_KEY
}

// Returns an embedding vector, or null when embeddings are unavailable
// (demo mode, missing key, or API error). Callers must degrade gracefully.
export async function embed(text: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null
  const input = text.replace(/\s+/g, ' ').trim().slice(0, 8000)
  if (!input) return null
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, input }),
    })
    if (!res.ok) {
      console.error('embeddings request failed:', res.status, await res.text())
      return null
    }
    const json = await res.json()
    const vec = json?.data?.[0]?.embedding
    return Array.isArray(vec) ? vec : null
  } catch (err) {
    console.error('embed error:', err)
    return null
  }
}

// pgvector accepts its text form `[0.1,0.2,...]`; JSON.stringify(number[])
// produces exactly that, which PostgREST passes through for the text→vector cast.
export function toVectorLiteral(vec: number[]): string {
  return JSON.stringify(vec)
}
