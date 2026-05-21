const ANTHROPIC_API = 'https://api.anthropic.com/v1';
const API_KEY = process.env.ANTHROPIC_API_KEY;
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

export function isConfigured(): boolean {
  return Boolean(API_KEY);
}

export type CompleteResult =
  | {
      ok: true;
      text: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
    }
  | { ok: false; status: number; details: string };

export async function complete({
  system,
  user,
  model,
  maxTokens = 2048,
  temperature = 0.5,
}: {
  system?: string;
  user: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<CompleteResult> {
  if (!API_KEY) return { ok: false, status: 503, details: 'ANTHROPIC_API_KEY missing' };

  const body = {
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens,
    temperature,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: user }],
  };

  let res: Response;
  try {
    res = await fetch(`${ANTHROPIC_API}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, status: 502, details: 'anthropic_unreachable: ' + (e as Error).message };
  }

  if (!res.ok) return { ok: false, status: res.status, details: (await res.text()).slice(0, 600) };

  const data = (await res.json()) as {
    content: { type: string; text: string }[];
    model: string;
    usage: { input_tokens: number; output_tokens: number };
  };
  const text = data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return {
    ok: true,
    text,
    model: data.model,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}
