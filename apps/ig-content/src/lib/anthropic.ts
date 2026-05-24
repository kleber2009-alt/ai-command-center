import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

// Extracts the first JSON object/array from a model response. Claude usually
// returns clean JSON, but it can wrap it in prose or ```json fences; this
// tolerates both. Throws if nothing parseable is found.
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text

  try {
    return JSON.parse(candidate.trim()) as T
  } catch {
    const start = candidate.search(/[[{]/)
    const lastObj = candidate.lastIndexOf('}')
    const lastArr = candidate.lastIndexOf(']')
    const end = Math.max(lastObj, lastArr)
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T
    }
    throw new Error('Model response did not contain valid JSON')
  }
}

// Calls Claude with a system + user prompt and returns the raw text.
export async function complete(
  system: string,
  user: string,
  maxTokens = 4096,
): Promise<string> {
  const res = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  })
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}
