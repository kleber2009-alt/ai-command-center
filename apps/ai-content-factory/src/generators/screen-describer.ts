// Describes an uploaded screen (PNG / JPG / WebP) via Claude Haiku Vision.
// Same shape as clip-describer, minus the ffmpeg frame extraction.

import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { setScreenMeta } from '../lib/screen-meta.js';
import { dataPath } from '../lib/paths.js';
import { log, recordClaudeCall } from '../lib/logger.js';

const HAIKU = 'claude-haiku-4-5-20251001';

// Anthropic Haiku is rate-limited per-org (Tier 1 ≈ 50 RPM). Share concurrency
// budget between footage and screens by tuning DESCRIBER_CONCURRENCY.
const CONCURRENCY = Number(process.env.DESCRIBER_CONCURRENCY ?? 4);

class Semaphore {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
  }
  release(): void {
    this.active--;
    const next = this.waiting.shift();
    if (next) next();
  }
}

const screenSemaphore = new Semaphore(CONCURRENCY);

const DESCRIBE_PROMPT = `Ты помогаешь дизайнеру Instagram-карусели и рилсов. На картинке — статическое изображение из библиотеки скринов канала об автоматизации бизнеса через Claude и нейросети.

Опиши, что на изображении и где его уместно использовать (cover-слайд, embed в текстовый слайд, фон под цитатой и т.п.). Никаких маркетинговых вводных, никаких эмодзи.

Верни СТРОГО валидный JSON без markdown:
{
  "description": "одно-два предложения: что на картинке, какой план, какой вайб, под какой контент подойдёт",
  "autoTags": ["cover" | "ui-screenshot" | "lifestyle" | "data" | "code" | "portrait" | "background" | "diagram" | "icon" | "logo" | ...]
}

autoTags — 2-5 коротких тегов. Только то, что реально видно.`;

function mediaType(file: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  const ext = extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

interface DescribeJsonResponse {
  description?: unknown;
  autoTags?: unknown;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* fall through */ }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error('No JSON value found in screen-describer response');
}

export interface DescribeScreenResult {
  description: string;
  autoTags: string[];
}

export async function describeScreen(tag: string, file: string): Promise<DescribeScreenResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  await screenSemaphore.acquire();
  const abs = dataPath('assets', 'screens', tag, file);
  setScreenMeta(tag, file, { status: 'describing' });

  const startedAt = Date.now();
  try {
    const data = await readFile(abs);
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: HAIKU,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType(file), data: data.toString('base64') },
            },
            { type: 'text', text: DESCRIBE_PROMPT },
          ],
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    const parsed = extractJson(text) as DescribeJsonResponse;
    const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
    const autoTags = Array.isArray(parsed.autoTags)
      ? parsed.autoTags.filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length < 40)
      : [];
    if (!description) throw new Error('screen describer returned empty description');

    setScreenMeta(tag, file, { description, autoTags, status: 'ready', error: undefined });

    try {
      recordClaudeCall({
        timestamp: new Date().toISOString(),
        model: HAIKU,
        attempts: 1,
        durationMs: Date.now() - startedAt,
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
        estimatedCostUsd:
          ((response.usage.input_tokens ?? 0) * 1 + (response.usage.output_tokens ?? 0) * 5) / 1_000_000,
        ok: true,
      });
    } catch { /* ignore */ }

    log.info('Screen described', { tag, file, autoTags });
    return { description, autoTags };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setScreenMeta(tag, file, { status: 'failed', error: message });
    log.warn('Screen describe failed', { tag, file, error: message });
    throw err;
  } finally {
    screenSemaphore.release();
  }
}
