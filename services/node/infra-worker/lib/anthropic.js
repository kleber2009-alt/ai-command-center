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

// ── Codex fallback (OpenAI-compatible Responses API) ─────────────────
// Когда Anthropic недоступен (в т.ч. «credit balance too low»), chat()
// автоматически переключается на Codex. Эндпоинт codex.sale работает
// через Responses API (/v1/responses), не chat/completions.
const CODEX_BASE_URL = (process.env.CODEX_BASE_URL || 'https://codex.sale/v1').replace(/\/+$/, '');
const CODEX_MODEL = process.env.CODEX_MODEL || 'gpt-5.4-mini';
const CODEX_EFFORT = process.env.CODEX_REASONING_EFFORT || 'low';

export function isAnthropicConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function isCodexConfigured() {
  return Boolean(process.env.CODEX_API_KEY);
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

async function callAnthropic({ system, messages, model, maxTokens = 512 }) {
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

// ── Codex (OpenAI-compatible Responses API) ──────────────────────────
async function callCodex({ system, messages, maxTokens = 512 }) {
  const apiKey = process.env.CODEX_API_KEY;
  if (!apiKey) return { ok: false, status: 503, details: 'CODEX_API_KEY missing' };

  // Anthropic system → Responses `instructions`; messages → `input` items.
  const input = (messages || []).map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));
  const body = JSON.stringify({
    model: CODEX_MODEL,
    instructions: system || undefined,
    input,
    reasoning: { effort: CODEX_EFFORT },
    max_output_tokens: maxTokens,
  });

  let lastStatus = 0;
  let lastDetails = '';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(`${CODEX_BASE_URL}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body,
      });
    } catch (e) {
      lastStatus = 502;
      lastDetails = 'codex_unreachable: ' + (e?.message || e);
      if (attempt < MAX_ATTEMPTS - 1) { await sleep(backoffMs(attempt, null)); continue; }
      return { ok: false, status: lastStatus, details: lastDetails, attempts: attempt + 1 };
    }

    if (res.ok) {
      const data = await res.json();
      // Responses API: output[] → message items → content[] → output_text.
      let text = '';
      for (const item of data.output || []) {
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c.type === 'output_text' && c.text) text += c.text;
          }
        }
      }
      return { ok: true, text: text.trim(), model: data.model, usage: data.usage, via: 'codex', attempts: attempt + 1 };
    }

    lastStatus = res.status;
    lastDetails = (await res.text()).slice(0, 600);
    if (!RETRY_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS - 1) {
      return { ok: false, status: lastStatus, details: lastDetails, attempts: attempt + 1 };
    }
    const retryAfter = parseFloat(res.headers.get('retry-after') || '');
    await sleep(backoffMs(attempt, retryAfter));
  }
  return { ok: false, status: lastStatus, details: lastDetails, attempts: MAX_ATTEMPTS };
}

/**
 * chat() — Anthropic основной, Codex автоматический фолбэк.
 * При любом сбое Anthropic (включая «credit balance too low», 401, 5xx,
 * сеть) — если Codex настроен, повторяем запрос через него.
 */
export async function chat(opts) {
  const anth = await callAnthropic(opts);
  if (anth.ok) return anth;

  if (isCodexConfigured()) {
    console.warn(
      `[llm] anthropic failed (status=${anth.status}) → fallback to Codex (${CODEX_MODEL}): ${String(anth.details).slice(0, 120)}`,
    );
    const codex = await callCodex(opts);
    if (codex.ok) {
      console.warn(`[llm] codex fallback ok (model=${codex.model})`);
      return codex;
    }
    return {
      ok: false,
      status: codex.status,
      details: `anthropic:${anth.status} ${String(anth.details).slice(0, 140)} || codex:${codex.status} ${String(codex.details).slice(0, 140)}`,
    };
  }
  return anth;
}
