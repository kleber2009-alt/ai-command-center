// Client-side reader for the same NDJSON wire format produced by anthropic-stream.ts.

export type StreamEvent =
  | { type: 'meta'; [k: string]: any }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; error: string }

export async function readNdjson(
  res: Response,
  onEvent: (e: StreamEvent) => void,
): Promise<void> {
  if (!res.body) throw new Error('Пустой ответ от сервера')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      try {
        onEvent(JSON.parse(line) as StreamEvent)
      } catch {
        // ignore malformed line
      }
    }
  }
  const tail = buf.trim()
  if (tail) {
    try {
      onEvent(JSON.parse(tail) as StreamEvent)
    } catch {}
  }
}
