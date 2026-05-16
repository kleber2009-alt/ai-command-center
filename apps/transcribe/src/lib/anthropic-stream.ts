// Small helpers to bridge Anthropic SSE → a simple line-delimited JSON stream
// that the browser can read incrementally.
//
// Output wire format (one JSON object per line):
//   {"type":"meta","citations":[...]}     // optional, sent once at start
//   {"type":"delta","text":"..."}         // many of these
//   {"type":"done"}                       // sent once at end
//   {"type":"error","error":"..."}        // on failure

export type WireEvent =
  | { type: 'meta'; [k: string]: any }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; error: string }

type AnthropicCallParams = {
  apiKey: string
  model: string
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
}

async function* parseAnthropicSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const evt = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const dataLine = evt.split('\n').find((l) => l.startsWith('data: '))
      if (!dataLine) continue
      const payload = dataLine.slice(6)
      if (payload === '[DONE]') return
      try {
        const json = JSON.parse(payload)
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
          const t = json.delta.text
          if (typeof t === 'string' && t.length > 0) yield t
        }
      } catch {
        // ignore malformed events
      }
    }
  }
}

export async function streamAnthropic(
  params: AnthropicCallParams,
  meta?: Record<string, any>,
): Promise<Response> {
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      system: params.system,
      messages: params.messages,
      stream: true,
    }),
  })

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => '')
    const payload: WireEvent = {
      type: 'error',
      error: `Anthropic (${upstream.status}): ${errText.slice(0, 300) || 'unknown'}`,
    }
    return new Response(JSON.stringify(payload) + '\n', {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: WireEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'))
      try {
        if (meta) send({ type: 'meta', ...meta })
        for await (const text of parseAnthropicSse(upstream.body!)) {
          send({ type: 'delta', text })
        }
        send({ type: 'done' })
      } catch (e: any) {
        send({ type: 'error', error: e?.message || 'stream error' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
