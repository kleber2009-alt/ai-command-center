// Пайплайн монтажа по скиллу (montazh-rils: transcribe → edl → layout → render
// → master) на одном ffmpeg-проходе:
//
//   1. ffprobe исходника, выжимка mono 16 kHz mp3 для Whisper;
//   2. пословные таймкоды (передаются снаружи — воркер кэширует их в Montage.transcript);
//   3. EDL: вырезка пауз > gapMax, запас keep вокруг слов (select/aselect);
//   4. кадр 1080×1920 / 1920×1080 — crop под формат либо размытая подложка,
//      если пропорции исходника другие;
//   5. «зум-панчи» на каждом втором склеенном куске (zoompan 1.0 ↔ 1.08);
//   6. ASS-субтитры, хук и призыв (libass + шрифты из public/fonts);
//   7. громкость −14 LUFS, TP −1.5 (loudnorm), H.264 + AAC, +faststart.

import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FfmpegError, run } from '@/lib/ffmpeg';
import { buildAss } from './ass';
import { buildCaptions, keepSegments, remapWords, totalDuration, type Segment, type Word } from './edl';
import { frameSize, type MontagePreset } from './presets';

export type MontageOptions = {
  cutSilence: boolean;
  subtitles: boolean;
  punch: boolean;
};

export const DEFAULT_MONTAGE_OPTIONS: MontageOptions = { cutSilence: true, subtitles: true, punch: true };

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');
const FPS = 30;
const MAX_SEGMENTS = 400;

export type Probe = { duration: number; width: number; height: number; hasAudio: boolean };

export function probe(file: string, ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe'): Promise<Probe> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', (e) => reject(new FfmpegError('SPAWN', e.message)));
    p.on('close', (code) => {
      if (code !== 0) return reject(new FfmpegError(`PROBE_${code}`, err.slice(-500)));
      try {
        const j = JSON.parse(out) as {
          streams: { codec_type: string; width?: number; height?: number; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] }[];
          format: { duration?: string };
        };
        const v = j.streams.find((s) => s.codec_type === 'video');
        if (!v?.width || !v.height) return reject(new FfmpegError('NO_VIDEO', 'в файле нет видеодорожки'));
        const rot = Math.abs(Number(v.tags?.rotate ?? v.side_data_list?.[0]?.rotation ?? 0));
        const [width, height] = rot === 90 || rot === 270 ? [v.height, v.width] : [v.width, v.height];
        resolve({
          duration: Number(j.format.duration ?? 0),
          width,
          height,
          hasAudio: j.streams.some((s) => s.codec_type === 'audio'),
        });
      } catch (e) {
        reject(new FfmpegError('PROBE_PARSE', (e as Error).message));
      }
    });
  });
}

export async function extractAudio(src: string, out: string, bin = process.env.FFMPEG_PATH ?? 'ffmpeg'): Promise<void> {
  await run(bin, ['-y', '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', out], 300_000);
}

/** Склеиваем соседние сегменты, пока их не станет ≤ MAX_SEGMENTS (длина выражения select). */
function capSegments(segs: Segment[]): Segment[] {
  let out = segs;
  let gap = 0.3;
  while (out.length > MAX_SEGMENTS) {
    const merged: Segment[] = [];
    for (const g of out) {
      const last = merged[merged.length - 1];
      if (last && g.s - last.e <= gap) last.e = g.e;
      else merged.push({ ...g });
    }
    out = merged;
    gap *= 2;
  }
  return out;
}

const r3 = (n: number) => n.toFixed(3);

export type RenderResult = { duration: number; segments: Segment[]; words: Word[] };

export async function renderMontage(opts: {
  src: string;
  workDir: string;
  out: string;
  probe: Probe;
  words: Word[];
  preset: MontagePreset;
  options: MontageOptions;
  hookTitle?: string | null;
  ctaWord?: string | null;
  bin?: string;
  timeoutMs?: number;
}): Promise<RenderResult> {
  const { preset, options, probe: pr } = opts;
  const bin = opts.bin ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
  const { w: W, h: H } = frameSize(preset.format);

  const segs = capSegments(
    options.cutSilence
      ? keepSegments(opts.words, pr.duration, { gapMax: preset.gapMax, keep: preset.keep })
      : [{ s: 0, e: pr.duration }],
  );
  const duration = totalDuration(segs);
  const outWords = remapWords(opts.words, segs);

  const captions = options.subtitles
    ? buildCaptions(outWords, { min: preset.words[0], max: preset.words[1], maxChars: preset.format === '16:9' ? 34 : preset.mode === 'karaoke' ? 40 : 18 })
    : [];
  const assPath = path.join(opts.workDir, 'subs.ass');
  await writeFile(assPath, buildAss({ preset, captions, duration, hookTitle: opts.hookTitle, ctaWord: opts.ctaWord }), 'utf8');

  const sel = segs.map((g) => `between(t,${r3(g.s)},${r3(g.e)})`).join('+');
  const chains: string[] = [];

  // 1) вырезка пауз на исходном таймлайне
  chains.push(`[0:v]fps=${FPS},select='${sel}',setpts=N/${FPS}/TB[cut]`);

  // 2) кадр под формат: crop, либо размытая подложка при другой пропорции
  const srcRatio = pr.width / pr.height;
  const dstRatio = W / H;
  if (Math.abs(srcRatio - dstRatio) / dstRatio > 0.15) {
    chains.push(
      `[cut]split[bg][fg]`,
      `[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:2,eq=brightness=-0.12[bgb]`,
      `[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs]`,
      `[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1[framed]`,
    );
  } else {
    chains.push(`[cut]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[framed]`);
  }

  // 3) зум-панч на каждом втором куске (скилл: «zoom punches» на склейках)
  let last = 'framed';
  if (options.punch && segs.length > 2) {
    let acc = 0;
    const zones: string[] = [];
    segs.forEach((g, i) => {
      const len = g.e - g.s;
      if (i % 2 === 1 && len > 0.6) zones.push(`between(on/${FPS},${r3(acc)},${r3(acc + len)})`);
      acc += len;
    });
    if (zones.length) {
      chains.push(
        `[framed]zoompan=z='if(${zones.join('+')},1.08,1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}[zoomed]`,
      );
      last = 'zoomed';
    }
  }

  // 4) субтитры/хук/призыв
  const esc = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  chains.push(`[${last}]ass='${esc(assPath)}':fontsdir='${esc(FONTS_DIR)}',format=yuv420p[v]`);

  // 5) звук: те же куски + −14 LUFS
  if (pr.hasAudio) {
    chains.push(`[0:a]aselect='${sel}',asetpts=N/SR/TB,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`);
  }

  const args = [
    '-y',
    '-i', opts.src,
    '-filter_complex', chains.join(';'),
    '-map', '[v]',
    ...(pr.hasAudio ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '192k'] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-r', String(FPS),
    '-movflags', '+faststart',
    '-t', r3(duration),
    opts.out,
  ];
  await run(bin, args, opts.timeoutMs ?? 1_800_000);
  return { duration, segments: segs, words: outWords };
}
