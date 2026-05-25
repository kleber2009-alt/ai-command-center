// Vision describer for the references library (Apple-style mirror of
// screen-describer, but writes meta into data/assets/references/<slot>/.meta.json).

import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { dataPath } from '../lib/paths.js';
import { log, recordClaudeCall } from '../lib/logger.js';
import { createMetaStore, type AssetMetaBase } from '../lib/keyval-meta.js';

const HAIKU = 'claude-haiku-4-5-20251001';
const CONCURRENCY = Number(process.env.DESCRIBER_CONCURRENCY ?? 4);

interface ReferenceMeta extends AssetMetaBase {
  status: 'pending' | 'describing' | 'ready' | 'failed';
  description?: string;
  autoTags?: string[];
}

const refsStore = createMetaStore<ReferenceMeta>('assets', 'references');

class Semaphore {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) { this.active++; return; }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
  }
  release(): void {
    this.active--;
    const next = this.waiting.shift();
    if (next) next();
  }
}
const sem = new Semaphore(CONCURRENCY);

const DESCRIBE_PROMPT = `Ты обучающий куратор Instagram-канала про автоматизацию через Claude. На изображении — референс карусели (один или несколько слайдов чужого/своего успешного контента). Опиши, ЧТО ИМЕННО делает этот референс сильным: какой хук, тип слайда, тон, типографика, цветовая логика.

Верни СТРОГО валидный JSON без markdown:
{
  "description": "1-2 конкретных предложения: что в кадре и какой приём использован",
  "autoTags": ["cover-hook" | "stat-bigbang" | "list" | "code" | "quote" | "minimalist" | "editorial" | "bold-typo" | "diagram" | "before-after" | "cta-keyword" | "checklist" | ...]
}
2-5 тегов из списка или близких.`;

function mediaType(file: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  const ext = extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function extractJson(text: string): unknown {
  const t = text.trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) { try { return JSON.parse(fenced[1].trim()); } catch { /* */ } }
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s !== -1 && e > s) return JSON.parse(t.slice(s, e + 1));
  throw new Error('No JSON value in reference-describer response');
}

interface DescribeJson { description?: unknown; autoTags?: unknown }

export async function describeReference(tag: string, file: string): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  await sem.acquire();
  const abs = dataPath('assets', 'references', tag, file);
  refsStore.set(tag, file, { status: 'describing' });

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
            { type: 'image', source: { type: 'base64', media_type: mediaType(file), data: data.toString('base64') } },
            { type: 'text', text: DESCRIBE_PROMPT },
          ],
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text).join('\n').trim();
    const parsed = extractJson(text) as DescribeJson;
    const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
    const autoTags = Array.isArray(parsed.autoTags)
      ? parsed.autoTags.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 40)
      : [];
    if (!description) throw new Error('empty description');

    refsStore.set(tag, file, { status: 'ready', description, autoTags, error: undefined });

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
    log.info('Reference described', { tag, file, autoTags });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    refsStore.set(tag, file, { status: 'failed', error: message });
    log.warn('Reference describe failed', { tag, file, error: message });
    throw err;
  } finally {
    sem.release();
  }
}
