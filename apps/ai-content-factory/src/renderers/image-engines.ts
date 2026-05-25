// Pluggable engines for rendering a single carousel slide.
//
//   - 'puppeteer'   — current default: HTML/CSS template → Chromium screenshot
//   - 'nano-banana' — Google Gemini Image (codename Nano Banana 2)
//   - 'gpt-image'   — OpenAI gpt-image-1 (or pinned via OPENAI_IMAGE_MODEL)
//
// Image-gen engines do NOT use the HTML template; they get a structured prompt
// derived from the slide payload + rubric (accent, handle, label). Both return
// the raw PNG bytes the pipeline writes alongside Puppeteer's output.

import type { Slide } from '../schemas/carousel.js';
import type { RubricConfig } from '../lib/rubrics.js';

export type ImageEngine = 'puppeteer' | 'nano-banana' | 'gpt-image' | 'gpt-image-2';

export const VALID_ENGINES: readonly ImageEngine[] = [
  'puppeteer',
  'nano-banana',
  'gpt-image',
  'gpt-image-2',
];

export function isImageEngine(value: unknown): value is ImageEngine {
  return typeof value === 'string' && (VALID_ENGINES as readonly string[]).includes(value);
}

export interface SlideRenderContext {
  rubric: RubricConfig;
  index: number;
  total: number;
}

/** Builds a model-agnostic prompt describing one slide. Same prose is fed to
 * both Gemini and OpenAI so visual style stays consistent when comparing. */
export function buildSlidePrompt(slide: Slide, ctx: SlideRenderContext): string {
  const { rubric, index, total } = ctx;
  const counter = `${index + 1}/${total}`;
  const lines: string[] = [];
  lines.push(
    `Instagram carousel slide, vertical 4:5 aspect ratio (1080×1350px), minimalist Apple-style design.`,
    `Solid white background. Accent color: ${rubric.accent}.`,
    `Top-left: small uppercase handle text "${rubric.handle}" in dark gray, modern sans-serif.`,
    `Top-right: small counter "${counter}" in light gray.`,
    `Use Inter font for body, JetBrains Mono for code. All text is in RUSSIAN (Cyrillic).`,
    `NO photographs, NO illustrations, just clean typography on solid color.`,
  );

  switch (slide.type) {
    case 'cover':
      lines.push(
        `Solid ${rubric.coverBg ?? rubric.accent} background instead of white.`,
        `Large bold uppercase title centered: "${slide.title}".`,
      );
      if (slide.subtitle) lines.push(`Subtitle below title: "${slide.subtitle}".`);
      if (slide.label) lines.push(`Small kicker above title: "${slide.label}".`);
      lines.push(`Bottom: small text "SWIPE LEFT" with arrow.`);
      break;
    case 'quote':
      lines.push(`Center: large italic quote text "${slide.text}".`);
      if (slide.author) lines.push(`Below quote: "— ${slide.author}" in smaller text.`);
      break;
    case 'list':
      if (slide.title) lines.push(`Top: bold title "${slide.title}".`);
      lines.push(`Vertical list of items, each prefixed with a ${rubric.accent} bullet dot:`);
      for (const item of slide.items) lines.push(`  • ${item}`);
      break;
    case 'stat':
      lines.push(`Huge accent-colored number "${slide.value}" filling most of the slide.`);
      lines.push(`Below: caption "${slide.caption}" in normal weight.`);
      break;
    case 'code':
      lines.push(`Center: monospace code block with dark background, ${rubric.accent} syntax accent.`);
      lines.push(`Code: ${slide.code}`);
      if (slide.caption) lines.push(`Below code: "${slide.caption}".`);
      break;
    case 'cta':
      lines.push(`Center: large bold "${slide.headline}".`);
      lines.push(`Below: ${rubric.accent}-colored CTA "${slide.action}".`);
      break;
  }
  return lines.join('\n');
}

interface GeminiImageResponse {
  candidates?: {
    content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
  }[];
}

async function renderWithGemini(slide: Slide, ctx: SlideRenderContext): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not set (required for nano-banana engine)');
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = buildSlidePrompt(slide, ctx);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) throw new Error(`Gemini Image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as GeminiImageResponse;
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) throw new Error('Gemini Image: no inline image in response');
  return Buffer.from(b64, 'base64');
}

interface OpenAIImageResponse {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
}

async function renderWithOpenAI(slide: Slide, ctx: SlideRenderContext): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set (required for gpt-image engine)');
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const prompt = buildSlidePrompt(slide, ctx);

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      // 4:5 isn't always supported — 1024x1536 (2:3) is closest standard, will
      // be scaled to 1080×1350 by Puppeteer in the pipeline if needed.
      size: process.env.OPENAI_IMAGE_SIZE || '1024x1536',
      n: 1,
      response_format: 'b64_json',
    }),
  });
  if (!res.ok) throw new Error(`OpenAI Image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as OpenAIImageResponse;
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error(`OpenAI Image: ${json.error?.message ?? 'no image in response'}`);
  return Buffer.from(b64, 'base64');
}

/** gpt-image-2 is delivered through kie.ai's async-task Market API:
 *   1. POST /api/v1/jobs/createTask           → { data: { taskId } }
 *   2. GET  /api/v1/jobs/recordInfo?taskId=…  → poll until state === 'success'
 *   3. download resultJson.resultUrls[0]      → PNG bytes
 *
 * Aspect: kie supports only enum ratios. Closest to Instagram 4:5 is 3:4
 * (1080:1440 vs needed 1080:1350) — pipeline doesn't re-crop, so live with it. */
interface KieCreateResponse { code: number; msg?: string; data?: { taskId?: string } }
interface KieRecordResponse {
  code: number; msg?: string;
  data?: {
    state?: 'waiting' | 'queuing' | 'processing' | 'success' | 'fail';
    resultJson?: string | { resultUrls?: string[] };
    failMsg?: string;
  };
}

async function renderWithGptImage2(slide: Slide, ctx: SlideRenderContext): Promise<Buffer> {
  const apiKey = process.env.GPT_IMAGE_2_API_KEY || process.env.KIE_AI_API_KEY;
  if (!apiKey) throw new Error('GPT_IMAGE_2_API_KEY is not set (required for gpt-image-2 engine)');
  const base = (process.env.GPT_IMAGE_2_ENDPOINT || 'https://api.kie.ai').replace(/\/$/, '');
  const model = process.env.GPT_IMAGE_2_MODEL || 'gpt-image-2-text-to-image';
  const aspect = process.env.GPT_IMAGE_2_ASPECT || '3:4';
  const resolution = process.env.GPT_IMAGE_2_RESOLUTION || '1K';
  const pollMs = Number(process.env.GPT_IMAGE_2_POLL_MS || 3000);
  const maxPolls = Number(process.env.GPT_IMAGE_2_MAX_POLLS || 60);

  const prompt = buildSlidePrompt(slide, ctx);

  const createRes = await fetch(`${base}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, input: { prompt, aspect_ratio: aspect, resolution } }),
  });
  if (!createRes.ok) throw new Error(`gpt-image-2 createTask ${createRes.status}: ${(await createRes.text()).slice(0, 300)}`);
  const createJson = (await createRes.json()) as KieCreateResponse;
  const taskId = createJson.data?.taskId;
  if (!taskId) throw new Error(`gpt-image-2: no taskId in createTask response: ${JSON.stringify(createJson).slice(0, 300)}`);

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollMs));
    const pollRes = await fetch(`${base}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) throw new Error(`gpt-image-2 poll ${pollRes.status}: ${(await pollRes.text()).slice(0, 300)}`);
    const pollJson = (await pollRes.json()) as KieRecordResponse;
    const state = pollJson.data?.state;
    if (state === 'success') {
      const raw = pollJson.data?.resultJson;
      const parsed = typeof raw === 'string' ? (JSON.parse(raw) as { resultUrls?: string[] }) : raw;
      const url = parsed?.resultUrls?.[0];
      if (!url) throw new Error(`gpt-image-2: success but no resultUrls`);
      const img = await fetch(url);
      if (!img.ok) throw new Error(`gpt-image-2: download ${img.status} from ${url}`);
      return Buffer.from(await img.arrayBuffer());
    }
    if (state === 'fail') {
      throw new Error(`gpt-image-2 task failed: ${pollJson.data?.failMsg ?? 'unknown'}`);
    }
  }
  throw new Error(`gpt-image-2 timeout after ${maxPolls * pollMs / 1000}s (taskId ${taskId})`);
}

/** Image-only engines return a PNG buffer. Puppeteer is handled separately in
 * carousel.ts because it batches all slides in one browser instance. */
export async function renderSlideImage(
  engine: Exclude<ImageEngine, 'puppeteer'>,
  slide: Slide,
  ctx: SlideRenderContext,
): Promise<Buffer> {
  if (engine === 'nano-banana') return renderWithGemini(slide, ctx);
  if (engine === 'gpt-image') return renderWithOpenAI(slide, ctx);
  if (engine === 'gpt-image-2') return renderWithGptImage2(slide, ctx);
  throw new Error(`Unknown image engine: ${engine as string}`);
}
