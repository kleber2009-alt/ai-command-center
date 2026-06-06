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

/**
 * Moderate an avatar source image. Returns a verdict; callers reject the batch
 * (without charging tokens) when `ok` is false.
 */
export async function moderateAvatarSource(upload: {
  fileUrl: string;
  fileType: string;
}): Promise<ModerationVerdict> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    if (process.env.MODERATION_REQUIRED === 'true') {
      return { ok: false, code: 'nsfw', reason: 'Модерация не настроена (MODERATION_REQUIRED).' };
    }
    console.warn('[moderation] ANTHROPIC_API_KEY missing → skipping image moderation');
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch(upload.fileUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`fetch image ${res.status}`);
    const base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    const mediaType = /^image\//.test(upload.fileType) ? upload.fileType : 'image/jpeg';

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
    if (!r.ok) throw new Error(`anthropic ${r.status}`);
    const data = (await r.json()) as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text ?? '';
    const assessment = parseAssessment(text);
    if (!assessment) throw new Error('unparseable assessment');
    return decideVerdict(assessment);
  } catch (e) {
    // Fail OPEN on transient/provider errors — don't block paying users on an
    // Anthropic hiccup. The consent gate still applies.
    console.warn('[moderation] check failed, allowing (fail-open):', e instanceof Error ? e.message : e);
    return { ok: true, skipped: true };
  }
}
