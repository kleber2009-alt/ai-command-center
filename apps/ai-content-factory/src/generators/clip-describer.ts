// Describes an uploaded clip so Claude can later pick it for a reels scene.
//
// 1. Extract a representative frame (~25% in, so we skip black openings) with
//    ffmpeg, scaled to 768 px wide, JPEG q=4.
// 2. Send the frame + a strict JSON-output prompt to Claude Haiku Vision.
// 3. Save { description, autoTags, durationSec } to the per-tag .meta.json.
//
// Costs ~$0.001 per clip. Failures are swallowed and persisted so the UI can
// surface them; they don't block reels generation.

import Anthropic from '@anthropic-ai/sdk';
import { readFile, unlink } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { setClipMeta } from '../lib/footage-meta.js';
import { dataPath } from '../lib/paths.js';
import { log, recordClaudeCall } from '../lib/logger.js';

const HAIKU = 'claude-haiku-4-5-20251001';

// Anthropic Haiku is rate-limited per-org (Tier 1 ≈ 50 RPM). We cap concurrent
// vision calls so a bulk upload / backlog scan doesn't 429 itself. Tune via
// DESCRIBER_CONCURRENCY if the org moves up tiers.
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

const describeSemaphore = new Semaphore(CONCURRENCY);

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    proc.stdout.on('data', (b) => (stdout += b.toString()));
    proc.stderr.on('data', (b) => (stderr += b.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-300)}`));
    });
  });
}

async function probeDuration(clipPath: string): Promise<number | undefined> {
  try {
    const out = await run('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      clipPath,
    ]);
    const n = Number(out.trim());
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

async function extractFrame(clipPath: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'frame-'));
  const out = join(dir, 'frame.jpg');
  // Try to seek to roughly 25% of duration to skip black openings; ffmpeg
  // tolerates over-seeking by clamping to last frame.
  const dur = (await probeDuration(clipPath)) ?? 2;
  const seek = Math.max(0.2, Math.min(dur * 0.25, dur - 0.1));
  await run('ffmpeg', [
    '-y',
    '-ss', String(seek),
    '-i', clipPath,
    '-frames:v', '1',
    '-vf', 'scale=768:-2',
    '-q:v', '4',
    out,
  ]);
  return out;
}

const DESCRIBE_PROMPT = `Ты помогаешь монтажёру Instagram-рилсов. На кадре — стоп-кадр из короткого вертикального видео для канала об автоматизации бизнеса через Claude и нейросети.

Опиши, что на кадре, и какие сцены в рилсе он закроет. Никаких маркетинговых вводных, никаких эмодзи, никаких пожеланий.

Верни СТРОГО валидный JSON без markdown:
{
  "description": "одно-два конкретных предложения: что в кадре, какой план, какое настроение",
  "autoTags": ["talking-head" | "screen-cast" | "b-roll-typing" | "b-roll-coffee" | "b-roll-city" | "b-roll-laptop" | "demo" | "lifestyle" | "data" | "ui" | "hands" | "outdoor" | "indoor", ...]
}

autoTags — 2-5 коротких тегов из приведённого списка (или близких по смыслу). Только то, что реально видно на кадре.`;

export interface DescribeResult {
  description: string;
  autoTags: string[];
  durationSec?: number;
}

interface DescribeJsonResponse {
  description?: unknown;
  autoTags?: unknown;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch { /* fall through */ }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error('No JSON value found in describer response');
}

export async function describeClip(tag: string, file: string): Promise<DescribeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  // Acquire BEFORE flipping to 'describing' so the UI shows the queue position
  // honestly — clips waiting on the semaphore stay 'pending'.
  await describeSemaphore.acquire();
  const clipAbs = dataPath('assets', 'footage', tag, file);
  setClipMeta(tag, file, { status: 'describing' });

  const startedAt = Date.now();
  let framePath: string | undefined;
  try {
    framePath = await extractFrame(clipAbs);
    const dur = await probeDuration(clipAbs);
    const frame = await readFile(framePath);

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
              source: { type: 'base64', media_type: 'image/jpeg', data: frame.toString('base64') },
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
    if (!description) throw new Error('describer returned empty description');

    setClipMeta(tag, file, { description, autoTags, durationSec: dur, status: 'ready', error: undefined });

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
    } catch { /* logging shouldn't fail the describer */ }

    log.info('Clip described', { tag, file, autoTags });
    return { description, autoTags, durationSec: dur };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setClipMeta(tag, file, { status: 'failed', error: message });
    log.warn('Clip describe failed', { tag, file, error: message });
    throw err;
  } finally {
    if (framePath) {
      try { await unlink(framePath); } catch { /* ignore */ }
    }
    describeSemaphore.release();
  }
}
