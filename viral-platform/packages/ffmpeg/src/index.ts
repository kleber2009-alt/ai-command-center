import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExportFormat, SilenceSpan } from '@vp/shared';
import { run } from './run.js';

export interface ProbeResult {
  durationMs: number;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape' | 'square';
}

/** Probe dimensions + duration of a video/image asset (§4.4.3). */
export async function probeAsset(inputPath: string): Promise<ProbeResult> {
  const out = await run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height:format=duration',
    '-of',
    'json',
    inputPath,
  ]);
  const parsed = JSON.parse(out) as {
    streams?: { width?: number; height?: number }[];
    format?: { duration?: string };
  };
  const width = parsed.streams?.[0]?.width ?? 0;
  const height = parsed.streams?.[0]?.height ?? 0;
  const seconds = Number.parseFloat(parsed.format?.duration ?? '0');
  return {
    durationMs: Number.isNaN(seconds) ? 0 : Math.round(seconds * 1000),
    width,
    height,
    orientation: width === height ? 'square' : width > height ? 'landscape' : 'portrait',
  };
}

/** Write a JPEG thumbnail at the given second (§4.4.3). */
export async function extractThumbnail(
  inputPath: string,
  outputPath: string,
  atSeconds = 1,
): Promise<void> {
  await run('ffmpeg', [
    '-y',
    '-ss',
    String(atSeconds),
    '-i',
    inputPath,
    '-frames:v',
    '1',
    '-vf',
    'scale=640:-1',
    outputPath,
  ]);
}

/**
 * Extract up to `count` evenly-spaced JPEG frames for Vision tagging (§4.4.3),
 * returning their bytes. For images (durationMs ≈ 0) a single frame is taken.
 */
export async function extractFrames(
  inputPath: string,
  outDir: string,
  durationMs: number,
  count = 3,
): Promise<Buffer[]> {
  const points =
    durationMs < 1000
      ? [0]
      : Array.from({ length: count }, (_, i) =>
          Math.max(0, (durationMs / 1000) * ((i + 0.5) / count)),
        );
  const buffers: Buffer[] = [];
  for (let i = 0; i < points.length; i++) {
    const out = join(outDir, `frame-${i}.jpg`);
    await run('ffmpeg', [
      '-y',
      '-ss',
      (points[i] as number).toFixed(2),
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=768:-1',
      out,
    ]);
    buffers.push(await readFile(out));
  }
  return buffers;
}

/** Extract mono 16kHz WAV for the transcriber (§5.2). */
export async function extractAudioWav(inputPath: string, outputPath: string): Promise<void> {
  await run('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    outputPath,
  ]);
}

/** Probe duration in milliseconds. */
export async function probeDurationMs(inputPath: string): Promise<number> {
  const out = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ]);
  const seconds = Number.parseFloat(out.trim());
  if (Number.isNaN(seconds)) throw new Error(`could not probe duration: ${out}`);
  return Math.round(seconds * 1000);
}

/** Detect silences longer than thresholdMs via the silencedetect filter (§5.5). */
export async function detectSilences(
  inputPath: string,
  thresholdMs = 500,
  noiseDb = -30,
): Promise<SilenceSpan[]> {
  const out = await run('ffmpeg', [
    '-i',
    inputPath,
    '-af',
    `silencedetect=noise=${noiseDb}dB:d=${thresholdMs / 1000}`,
    '-f',
    'null',
    '-',
  ]);
  const spans: SilenceSpan[] = [];
  const starts = [...out.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]) * 1000);
  const ends = [...out.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]) * 1000);
  for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
    spans.push({ startMs: Math.round(starts[i] as number), endMs: Math.round(ends[i] as number) });
  }
  return spans;
}

const TARGET_DIMS: Record<ExportFormat, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
};

/**
 * Export a clip in the requested aspect ratio (§5.8). Scales to cover the
 * target then center-crops, H.264 + AAC, CRF 20, preset medium.
 */
export async function exportClip(opts: {
  inputPath: string;
  outputPath: string;
  startMs: number;
  endMs: number;
  format: ExportFormat;
}): Promise<void> {
  const { w, h } = TARGET_DIMS[opts.format];
  const ss = (opts.startMs / 1000).toFixed(3);
  const t = ((opts.endMs - opts.startMs) / 1000).toFixed(3);
  await run('ffmpeg', [
    '-y',
    '-ss',
    ss,
    '-i',
    opts.inputPath,
    '-t',
    t,
    '-vf',
    `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`,
    '-c:v',
    'libx264',
    '-crf',
    '20',
    '-preset',
    'medium',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    opts.outputPath,
  ]);
}

export { run };
