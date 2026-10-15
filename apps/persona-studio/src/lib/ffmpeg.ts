// Склейка нескольких mp4-клипов OmniHuman в одно видео через ffmpeg.
//
// Каждый клип рендерится kie.ai из ОДНОЙ картинки одним и тем же движком с тем
// же aspect → разрешение/fps совпадают, поэтому используем concat-фильтр
// (перекодирование) — он устойчив к мелким расхождениям параметров и корректно
// сшивает и видео, и аудио-дорожки (голос) без «зажёвывания».
//
// ffmpeg должен присутствовать в образе воркера (Dockerfile, stage `worker`:
// `apk add --no-cache ffmpeg`). Бинарь переопределяется env FFMPEG_PATH.

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class FfmpegError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'FfmpegError';
  }
}

export function run(bin: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new FfmpegError('TIMEOUT', `ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(new FfmpegError('SPAWN', e.message));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new FfmpegError(`EXIT_${code}`, stderr.slice(-1000) || `ffmpeg exit ${code}`));
    });
  });
}

/**
 * Склеить mp4-клипы (в исходном порядке) в один буфер. Для одного клипа —
 * возвращает его без перекодирования. Перекодирование: H.264 + AAC,
 * `+faststart` для стриминга.
 */
export async function concatVideos(
  clips: Buffer[],
  opts: { timeoutMs?: number } = {},
): Promise<Buffer> {
  if (clips.length === 0) throw new FfmpegError('EMPTY', 'no clips to concat');
  if (clips.length === 1) return clips[0];

  const bin = process.env.FFMPEG_PATH ?? 'ffmpeg';
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const dir = await mkdtemp(join(tmpdir(), 'omni-concat-'));
  try {
    const inputs: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const p = join(dir, `c${i}.mp4`);
      await writeFile(p, clips[i]);
      inputs.push(p);
    }
    const outPath = join(dir, 'out.mp4');

    // concat-фильтр: [0:v][0:a][1:v][1:a]…concat=n=N:v=1:a=1[v][a]
    const streams = inputs.map((_, i) => `[${i}:v:0][${i}:a:0]`).join('');
    const filter = `${streams}concat=n=${inputs.length}:v=1:a=1[v][a]`;

    const args = [
      '-y',
      ...inputs.flatMap((p) => ['-i', p]),
      '-filter_complex',
      filter,
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      outPath,
    ];

    await run(bin, args, timeoutMs);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
