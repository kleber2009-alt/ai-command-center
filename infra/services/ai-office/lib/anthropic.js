// ═══════════════════════════════════════════════════════════════════
// lib/anthropic.js — minimal Claude API wrapper
// ═══════════════════════════════════════════════════════════════════

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export function isAnthropicConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Returns { ok: true, text, model, usage } or { ok: false, status, details }.
 *
 * messages: array of { role: 'user'|'assistant', content: string }
 */
export async function chat({ system, messages, model, maxTokens = 512 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, details: 'ANTHROPIC_API_KEY missing' };
  }

  let res;
  try {
    res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        max_tokens: maxTokens,
        system,
        messages,
      }),
    });
  } catch (e) {
    return { ok: false, status: 502, details: 'anthropic_unreachable: ' + (e.message || e) };
  }

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, details: text.slice(0, 600) };
  }

  const data = await res.json();
  const text = (data.content?.[0]?.text || '').trim();
  return { ok: true, text, model: data.model, usage: data.usage };
}
