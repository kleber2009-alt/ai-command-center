// ═══════════════════════════════════════════════════════════════════
// lib/anthropic.js — minimal Claude API wrapper with retry-on-transient
// (copy of infra/services/ai-office/lib/anthropic.js — keep in sync)
// ═══════════════════════════════════════════════════════════════════
//
// Retry policy:
//   - 408 / 429 / 500 / 502 / 503 / 504 / 529  → retry with exponential backoff
//   - 529 ("overloaded_error")                 → Anthropic explicitly says retry
//   - 4xx (besides 408/429)                    → permanent (programmer error), no retry
//   - network errors (fetch throws)            → retry
//   - retry-after header                       → respected when present (capped)
//
// Backoff: 1s, 2s, 4s, 8s — capped at MAX_ATTEMPTS=4. Total worst-case ~15s,
// fits inside all current handler stage budgets.

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const MAX_ATTEMPTS = parseInt(process.env.ANTHROPIC_MAX_ATTEMPTS || '4', 10);
const BASE_BACKOFF_MS = parseInt(process.env.ANTHROPIC_BASE_BACKOFF_MS || '1000', 10);
const MAX_BACKOFF_MS = parseInt(process.env.ANTHROPIC_MAX_BACKOFF_MS || '15000', 10);

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);

export function isAnthropicConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Backoff with full jitter (AWS-style): pick random delay in [0, baseExp].
 * baseExp = BASE * 2^attempt, capped at MAX_BACKOFF_MS.
 * If retry-after header present, use it (capped) instead.
 */
function backoffMs(attempt, retryAfterSec) {
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return Math.min(retryAfterSec * 1000, MAX_BACKOFF_MS);
  }
  const exp = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  return Math.floor(Math.random() * exp);
}

export async function chat({ system, messages, model, maxTokens = 512 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, details: 'ANTHROPIC_API_KEY missing' };
  }

  const body = JSON.stringify({
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens,
    system,
    messages,
  });

  let lastStatus = 0;
  let lastDetails = '';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body,
      });
    } catch (e) {
      // Network errors: retry.
      lastStatus = 502;
      lastDetails = 'anthropic_unreachable: ' + (e?.message || e);
      if (attempt < MAX_ATTEMPTS - 1) {
        const wait = backoffMs(attempt, null);
        console.warn(`[anthropic] network error attempt=${attempt + 1}/${MAX_ATTEMPTS}, retry in ${wait}ms: ${lastDetails}`);
        await sleep(wait);
        continue;
      }
      return { ok: false, status: lastStatus, details: lastDetails, attempts: attempt + 1 };
    }

    if (res.ok) {
      const data = await res.json();
      const text = (data.content?.[0]?.text || '').trim();
      return { ok: true, text, model: data.model, usage: data.usage, attempts: attempt + 1 };
    }

    // Non-2xx: decide retry vs permanent.
    const text = await res.text();
    lastStatus = res.status;
    lastDetails = text.slice(0, 600);

    if (!RETRY_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS - 1) {
      return { ok: false, status: lastStatus, details: lastDetails, attempts: attempt + 1 };
    }

    const retryAfter = parseFloat(res.headers.get('retry-after') || '');
    const wait = backoffMs(attempt, retryAfter);
    console.warn(
      `[anthropic] ${res.status} attempt=${attempt + 1}/${MAX_ATTEMPTS}, retry in ${wait}ms: ${lastDetails.slice(0, 120)}`,
    );
    await sleep(wait);
  }

  return { ok: false, status: lastStatus, details: lastDetails, attempts: MAX_ATTEMPTS };
}
