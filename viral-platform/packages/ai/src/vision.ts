import { ASSET_TAGGING_PROMPT, type AssetTaggingRaw, assetTaggingSchema } from '@vp/shared';
import { extractJson } from './json.js';

const GEMINI_MODEL = 'gemini-2.0-flash';

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

/**
 * Vision-tag 1–3 extracted frames with Gemini 2.0 Flash (§4.4.3). Uses the REST
 * API directly to avoid pulling in another SDK. Output is validated against
 * assetTaggingSchema; bad fields fall back to safe defaults.
 */
export async function tagAssetFrames(
  frames: Buffer[],
  mimeType = 'image/jpeg',
): Promise<AssetTaggingRaw> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  if (frames.length === 0) throw new Error('no frames to tag');

  const parts: GeminiPart[] = [
    { text: ASSET_TAGGING_PROMPT },
    ...frames.map((f) => ({
      inline_data: { mime_type: mimeType, data: f.toString('base64') },
    })),
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return assetTaggingSchema.parse(extractJson(text));
}
