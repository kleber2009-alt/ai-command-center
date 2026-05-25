import type { ExportFormat, SilenceSpan } from '@vp/shared';
import { run } from './run.js';

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
