// Pluggable engines for rendering a single carousel slide.
//
//   - 'puppeteer'   — current default: HTML/CSS template → Chromium screenshot
//   - 'nano-banana' — Google Nano Banana 2 (Gemini 2.5 Flash Image) via kie.ai async API
//   - 'gpt-image'   — OpenAI gpt-image-1 (or pinned via OPENAI_IMAGE_MODEL)
//   - 'gpt-image-2' — OpenAI gpt-image-2 via kie.ai async API
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
  /** Author handle without @ (ilia.paliy / theromanknox / drcintas /
   * julieta_publicista). If set, looks up a matching reference slide in
   * data/brandbook/dataset.json and prepends its image_generation_prompt
   * as a style anchor. */
  styleAuthor?: string;
}

interface DatasetSlide {
  filename?: string;
  author?: string;
  funnel_role?: string;
  visual_description?: string;
  design_tokens?: Record<string, string>;
  image_generation_prompt?: string;
}

interface BrandbookDataset {
  slides?: DatasetSlide[];
}

let datasetCache: { value: BrandbookDataset | null; ts: number } | null = null;
function loadDataset(): BrandbookDataset | null {
  if (datasetCache && Date.now() - datasetCache.ts < 60_000) return datasetCache.value;
  try {
    // Lazy require to keep this file leaf-importable from anywhere.
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const here = path.dirname(new URL(import.meta.url).pathname);
    const file = path.resolve(here, '../../data/brandbook/dataset.json');
    if (!fs.existsSync(file)) {
      datasetCache = { value: null, ts: Date.now() };
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as BrandbookDataset;
    datasetCache = { value: parsed, ts: Date.now() };
    return parsed;
  } catch {
    datasetCache = { value: null, ts: Date.now() };
    return null;
  }
}

/** Map our slide types to the funnel roles used in the dataset. */
function funnelFor(slideType: Slide['type']): string {
  if (slideType === 'cover') return 'cover';
  if (slideType === 'cta') return 'cta';
  if (slideType === 'code' || slideType === 'list') return 'step';
  return 'proof'; // quote / stat
}

/** Finds the best matching reference slide for a given author + funnel role.
 * Falls back to any slide of the same author if no role match exists. */
function findStyleRef(author: string, funnel: string): DatasetSlide | null {
  const ds = loadDataset();
  if (!ds?.slides) return null;
  const handle = '@' + author;
  const sameAuthor = ds.slides.filter((s) => s.author === handle);
  if (sameAuthor.length === 0) return null;
  const byRole = sameAuthor.find((s) => s.funnel_role === funnel);
  return byRole ?? sameAuthor[0] ?? null;
}

/** Builds a model-agnostic prompt describing one slide. Same prose is fed to
 * both Gemini and OpenAI so visual style stays consistent when comparing.
 * When ctx.styleAuthor is set, prepends a STYLE REFERENCE block with the
 * matching dataset slide's image_generation_prompt — this is what teaches
 * the image-gen model the visual language (3D renders, beige grids, peach
 * platforms, dark code mockups, italic serif headlines, etc.). */
export function buildSlidePrompt(slide: Slide, ctx: SlideRenderContext): string {
  const { rubric, index, total } = ctx;
  const counter = `${index + 1}/${total}`;
  const lines: string[] = [];

  // ── STYLE REFERENCE (priority) — overrides the default "minimalist Apple"
  // base when a styleAuthor is selected. The image-gen model imitates the
  // visual language of the matched reference slide from dataset.json.
  let styleRef: DatasetSlide | null = null;
  if (ctx.styleAuthor) {
    styleRef = findStyleRef(ctx.styleAuthor, funnelFor(slide.type));
  }
  if (styleRef) {
    lines.push(
      `## STYLE REFERENCE — imitate this visual language from @${ctx.styleAuthor}`,
      `Match the visual style, palette, typography, layout, mockup treatment, ` +
        `and overall mood of the reference below. The CONTENT (text, headline) ` +
        `must come from "YOUR SLIDE" section, not the reference.`,
      ``,
      `REFERENCE visual description:`,
      styleRef.visual_description ?? '',
      ``,
      `REFERENCE image-gen prompt (style anchor — copy aesthetics, not text):`,
      styleRef.image_generation_prompt ?? '',
      ``,
      `## YOUR SLIDE`,
    );
  } else {
    lines.push(
      `Instagram carousel slide, vertical 4:5 aspect ratio (1080×1350px), minimalist Apple-style design.`,
      `Solid white background. Accent color: ${rubric.accent}.`,
      `Top-left: small uppercase handle text "${rubric.handle}" in dark gray, modern sans-serif.`,
      `Top-right: small counter "${counter}" in light gray.`,
      `Use Inter font for body, JetBrains Mono for code. All text is in RUSSIAN (Cyrillic).`,
      `NO photographs, NO illustrations, just clean typography on solid color.`,
    );
  }

  // When a style reference exists, rubric tokens (accent, coverBg, handle)
  // pull the image-gen towards a different look — strip them and use only
  // the palette/handle from the reference itself.
  if (styleRef) {
    lines.push(
      `Slide ${index + 1} of ${total}. Counter "${counter}" — place it like the reference puts it.`,
      `Funnel role: ${funnelFor(slide.type)}.`,
    );
  }

  switch (slide.type) {
    case 'cover':
      if (styleRef) {
        lines.push(`Title (large, in the style above): "${slide.title}".`);
        if (slide.subtitle) lines.push(`Subtitle: "${slide.subtitle}".`);
        if (slide.label) lines.push(`Small kicker: "${slide.label}".`);
      } else {
        lines.push(
          `Solid ${rubric.coverBg ?? rubric.accent} background instead of white.`,
          `Large bold uppercase title centered: "${slide.title}".`,
        );
        if (slide.subtitle) lines.push(`Subtitle below title: "${slide.subtitle}".`);
        if (slide.label) lines.push(`Small kicker above title: "${slide.label}".`);
        lines.push(`Bottom: small text "SWIPE LEFT" with arrow.`);
      }
      break;
    case 'quote':
      lines.push(`Center: large italic quote text "${slide.text}".`);
      if (slide.author) lines.push(`Below quote: "— ${slide.author}" in smaller text.`);
      break;
    case 'list':
      if (slide.title) lines.push(`Top: bold title "${slide.title}".`);
      if (styleRef) {
        lines.push(`Vertical list of items (use the reference's bullet style and palette):`);
      } else {
        lines.push(`Vertical list of items, each prefixed with a ${rubric.accent} bullet dot:`);
      }
      for (const item of slide.items) lines.push(`  • ${item}`);
      break;
    case 'stat':
      if (styleRef) {
        lines.push(`Huge number "${slide.value}" filling most of the slide (use the reference's palette and typography).`);
      } else {
        lines.push(`Huge accent-colored number "${slide.value}" filling most of the slide.`);
      }
      lines.push(`Below: caption "${slide.caption}" in normal weight.`);
      break;
    case 'code':
      if (styleRef) {
        lines.push(`Center: monospace code block (use the reference's mockup treatment).`);
      } else {
        lines.push(`Center: monospace code block with dark background, ${rubric.accent} syntax accent.`);
      }
      lines.push(`Code: ${slide.code}`);
      if (slide.caption) lines.push(`Below code: "${slide.caption}".`);
      break;
    case 'cta':
      lines.push(`Center: large bold "${slide.headline}".`);
      if (styleRef) {
        lines.push(`Below: CTA "${slide.action}" (use the reference's button/keyword style).`);
      } else {
        lines.push(`Below: ${rubric.accent}-colored CTA "${slide.action}".`);
      }
      break;
  }
  return lines.join('\n');
}

/** Shared kie.ai async-task runner: createTask → poll recordInfo → download PNG.
 * Both nano-banana (Gemini 2.5 Flash Image) and gpt-image-2 are exposed through
 * the same Market API on kie.ai, only the model id and input shape differ. */
interface KieCreateResponse { code: number; msg?: string; data?: { taskId?: string } }
interface KieRecordResponse {
  code: number; msg?: string;
  data?: {
    state?: 'waiting' | 'queuing' | 'processing' | 'success' | 'fail';
    resultJson?: string | { resultUrls?: string[] };
    failMsg?: string;
  };
}

interface KieRunOptions {
  label: string; // for error messages ("nano-banana" / "gpt-image-2")
  apiKey: string;
  base: string;
  model: string;
  input: Record<string, unknown>;
  pollMs: number;
  maxPolls: number;
}

async function runKieTask(opts: KieRunOptions): Promise<Buffer> {
  const { label, apiKey, base, model, input, pollMs, maxPolls } = opts;
  const createRes = await fetch(`${base}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, input }),
  });
  if (!createRes.ok) throw new Error(`${label} createTask ${createRes.status}: ${(await createRes.text()).slice(0, 300)}`);
  const createJson = (await createRes.json()) as KieCreateResponse;
  const taskId = createJson.data?.taskId;
  if (!taskId) throw new Error(`${label}: no taskId in createTask response: ${JSON.stringify(createJson).slice(0, 300)}`);

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollMs));
    const pollRes = await fetch(`${base}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) throw new Error(`${label} poll ${pollRes.status}: ${(await pollRes.text()).slice(0, 300)}`);
    const pollJson = (await pollRes.json()) as KieRecordResponse;
    const state = pollJson.data?.state;
    if (state === 'success') {
      const raw = pollJson.data?.resultJson;
      const parsed = typeof raw === 'string' ? (JSON.parse(raw) as { resultUrls?: string[] }) : raw;
      const url = parsed?.resultUrls?.[0];
      if (!url) throw new Error(`${label}: success but no resultUrls`);
      const img = await fetch(url);
      if (!img.ok) throw new Error(`${label}: download ${img.status} from ${url}`);
      return Buffer.from(await img.arrayBuffer());
    }
    if (state === 'fail') {
      throw new Error(`${label} task failed: ${pollJson.data?.failMsg ?? 'unknown'}`);
    }
  }
  throw new Error(`${label} timeout after ${maxPolls * pollMs / 1000}s (taskId ${taskId})`);
}

/** Nano Banana 2 = Google's image model (Gemini 2.5 Flash Image), reached via
 * kie.ai's Market API rather than calling Google directly. Same async pattern
 * as gpt-image-2; only the model id and ratio enum differ. */
async function renderWithNanoBanana(slide: Slide, ctx: SlideRenderContext): Promise<Buffer> {
  const apiKey = process.env.NANO_BANANA_API_KEY || process.env.KIE_AI_API_KEY || process.env.GPT_IMAGE_2_API_KEY;
  if (!apiKey) throw new Error('NANO_BANANA_API_KEY (or KIE_AI_API_KEY) is not set (required for nano-banana engine)');
  const base = (process.env.NANO_BANANA_ENDPOINT || 'https://api.kie.ai').replace(/\/$/, '');
  // kie.ai model id for Nano Banana 2 (Gemini 3.1 Flash Image, 4K-capable).
  // Note: no `google/` prefix on v2; the old `google/nano-banana` is v1.
  const model = process.env.NANO_BANANA_MODEL || 'nano-banana-2';
  // v2 natively supports 4:5 — Instagram's carousel ratio, no re-crop needed.
  const aspect = process.env.NANO_BANANA_ASPECT || '4:5';
  const resolution = process.env.NANO_BANANA_RESOLUTION || '1K';
  const pollMs = Number(process.env.NANO_BANANA_POLL_MS || 3000);
  const maxPolls = Number(process.env.NANO_BANANA_MAX_POLLS || 60);

  return runKieTask({
    label: 'nano-banana',
    apiKey, base, model, pollMs, maxPolls,
    input: {
      prompt: buildSlidePrompt(slide, ctx),
      aspect_ratio: aspect,
      resolution,
      output_format: 'png',
    },
  });
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

/** gpt-image-2 via kie.ai. Aspect: kie supports only enum ratios; closest to
 * Instagram 4:5 is 3:4 (1080:1440 vs needed 1080:1350) — pipeline doesn't
 * re-crop, so live with it. */
async function renderWithGptImage2(slide: Slide, ctx: SlideRenderContext): Promise<Buffer> {
  const apiKey = process.env.GPT_IMAGE_2_API_KEY || process.env.KIE_AI_API_KEY;
  if (!apiKey) throw new Error('GPT_IMAGE_2_API_KEY is not set (required for gpt-image-2 engine)');
  const base = (process.env.GPT_IMAGE_2_ENDPOINT || 'https://api.kie.ai').replace(/\/$/, '');
  const model = process.env.GPT_IMAGE_2_MODEL || 'gpt-image-2-text-to-image';
  const aspect = process.env.GPT_IMAGE_2_ASPECT || '3:4';
  const resolution = process.env.GPT_IMAGE_2_RESOLUTION || '1K';
  const pollMs = Number(process.env.GPT_IMAGE_2_POLL_MS || 3000);
  const maxPolls = Number(process.env.GPT_IMAGE_2_MAX_POLLS || 60);

  return runKieTask({
    label: 'gpt-image-2',
    apiKey, base, model, pollMs, maxPolls,
    input: { prompt: buildSlidePrompt(slide, ctx), aspect_ratio: aspect, resolution },
  });
}

/** Image-only engines return a PNG buffer. Puppeteer is handled separately in
 * carousel.ts because it batches all slides in one browser instance. */
export async function renderSlideImage(
  engine: Exclude<ImageEngine, 'puppeteer'>,
  slide: Slide,
  ctx: SlideRenderContext,
): Promise<Buffer> {
  if (engine === 'nano-banana') return renderWithNanoBanana(slide, ctx);
  if (engine === 'gpt-image') return renderWithOpenAI(slide, ctx);
  if (engine === 'gpt-image-2') return renderWithGptImage2(slide, ctx);
  throw new Error(`Unknown image engine: ${engine as string}`);
}
