// Pre-generation moderation for avatar source photos.
//
// A face-avatar product must not process non-consensual, non-human, multi-face,
// or NSFW images — it's a legal/ToS risk (HeyGen/Meta ban on other people's
// faces) and a quality risk. Consent is enforced at the API layer; this module
// covers the image itself: exactly one human face + SFW.
//
// Implementation reuses the existing Anthropic integration (multimodal, raw
// fetch — no new deps). The image is sent as base64 so it works even when the
// upload isn't publicly reachable. Degrades gracefully: with no ANTHROPIC_API_KEY
// it skips (logged) unless MODERATION_REQUIRED=true, in which case it fails closed.
import { env } from './env';

export type ModerationCode = 'no_face' | 'multiple_faces' | 'not_human' | 'nsfw';

export type ModerationVerdict =
  | { ok: true; skipped?: boolean }
  | { ok: false; code: ModerationCode; reason: string };

// What the vision model is asked to return.
export type VisionAssessment = { faces: number; human: boolean; nsfw: boolean };

/**
 * Pure decision: map a vision assessment to an allow/reject verdict. Order
 * matters — NSFW and non-human are hard rejects before face-count nuances.
 */
export function decideVerdict(a: VisionAssessment): ModerationVerdict {
  if (a.nsfw) return { ok: false, code: 'nsfw', reason: 'Изображение помечено как NSFW/недопустимое.' };
  if (!a.human) return { ok: false, code: 'not_human', reason: 'На фото не распознан человек.' };
  if (a.faces <= 0) return { ok: false, code: 'no_face', reason: 'На фото не найдено лицо.' };
  if (a.faces > 1)
    return { ok: false, code: 'multiple_faces', reason: 'На фото несколько лиц — нужно одно.' };
  return { ok: true };
}

const SYSTEM =
  'You are an image safety and composition checker for an avatar-generation product. ' +
  'Reply with ONLY a compact JSON object, no prose, no code fences: ' +
  '{"faces": <integer count of distinct human faces>, "human": <true if a real human person is the subject>, ' +
  '"nsfw": <true if sexual, explicit, gory, or otherwise unsafe>}.';

function parseAssessment(text: string): VisionAssessment | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    return {
      faces: Number(j.faces ?? 0),
      human: Boolean(j.human),
      nsfw: Boolean(j.nsfw),
    };
  } catch {
    return null;
  }
}

// Anthropic vision assessment. Returns null (not throws) on a provider error so
// the caller can fall back to OpenAI instead of failing open.
async function assessWithAnthropic(
  apiKey: string,
  base64: string,
  mediaType: string,
): Promise<VisionAssessment | null> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model: env.ANTHROPIC_PARSER_MODEL,
      max_tokens: 100,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Assess this image. Return only the JSON.' },
          ],
        },
      ],
    }),
  });
  if (!r.ok) {
    console.warn(`[moderation] anthropic ${r.status} — trying OpenAI fallback`);
    return null;
  }
  const data = (await r.json()) as { content?: Array<{ text?: string }> };
  return parseAssessment(data.content?.[0]?.text ?? '');
}

// OpenAI vision fallback — used when Anthropic is unavailable (out of credits /
// auth). Mirrors the parser's OpenAI fallback so a zero Anthropic balance can't
// silently disable moderation. gpt-4o-mini (OPENAI_DEEP_MODEL) takes image input
// via a base64 data URL.
async function assessWithOpenAI(
  apiKey: string,
  base64: string,
  mediaType: string,
): Promise<VisionAssessment | null> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model: env.OPENAI_DEEP_MODEL,
      max_tokens: 100,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Assess this image. Return only the JSON.' },
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
          ],
        },
      ],
    }),
  });
  if (!r.ok) {
    console.warn(`[moderation] openai ${r.status} — fallback failed`);
    return null;
  }
  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return parseAssessment(data.choices?.[0]?.message?.content ?? '');
}

/**
 * Moderate an avatar source image. Returns a verdict; callers reject the batch
 * (without charging tokens) when `ok` is false.
 *
 * Tries Anthropic vision first, then falls back to OpenAI vision — so a zero
 * Anthropic balance can't silently turn moderation off. Only when BOTH providers
 * fail does it fail open (or fail closed when MODERATION_REQUIRED=true).
 */
export async function moderateAvatarSource(upload: {
  fileUrl: string;
  fileType: string;
}): Promise<ModerationVerdict> {
  const anthropicKey = env.ANTHROPIC_API_KEY;
  const openaiKey = env.OPENAI_API_KEY;
  const required = process.env.MODERATION_REQUIRED === 'true';

  if (!anthropicKey && !openaiKey) {
    if (required) {
      return { ok: false, code: 'nsfw', reason: 'Модерация не настроена (MODERATION_REQUIRED).' };
    }
    console.warn('[moderation] no vision provider configured → skipping image moderation');
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch(upload.fileUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`fetch image ${res.status}`);
    const base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    const mediaType = /^image\//.test(upload.fileType) ? upload.fileType : 'image/jpeg';

    let assessment: VisionAssessment | null = null;
    if (anthropicKey) assessment = await assessWithAnthropic(anthropicKey, base64, mediaType);
    if (!assessment && openaiKey) assessment = await assessWithOpenAI(openaiKey, base64, mediaType);

    if (assessment) return decideVerdict(assessment);
    throw new Error('no assessment from any provider');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Both providers failed (or the image couldn't be fetched). Fail closed only
    // when explicitly required; otherwise don't block paying users on a provider
    // hiccup — the consent gate still applies.
    if (required) {
      console.warn('[moderation] check failed, blocking (MODERATION_REQUIRED):', msg);
      return { ok: false, code: 'nsfw', reason: 'Модерация временно недоступна, попробуйте позже.' };
    }
    console.warn('[moderation] check failed, allowing (fail-open):', msg);
    return { ok: true, skipped: true };
  }
}
