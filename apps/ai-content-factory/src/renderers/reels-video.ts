// Reels video renderer. Two modes:
//
//   1. Fallback (no footage in data/assets/footage/<tag>/) — writes the script
//      as Markdown and a hint file telling the owner this is a script-only
//      delivery. Used until a footage library is prepared.
//
//   2. Full FFmpeg pipeline — when every scene's footageTag has at least one
//      clip in data/assets/footage/<tag>/, FFmpeg picks one per scene, concats
//      them with the `concat` demuxer, burns subtitles via `drawtext`, and
//      mixes background audio from data/assets/audio/<musicMood>/ (if present).
//
// Output: data/output/<runId>/reels.mp4 (or script.md in fallback).

import { existsSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import type { ReelsScript } from '../schemas/reels.js';
import { formatScript } from '../schemas/reels.js';
import type { RubricConfig } from '../lib/rubrics.js';
import { dataPath } from '../lib/paths.js';
import { log } from '../lib/logger.js';

export type ReelsRenderMode = 'fallback' | 'video';

export interface ReelsRenderResult {
  mode: ReelsRenderMode;
  scriptPath: string;
  videoPath?: string;
  /** Tags that didn't have any clip in the footage library — drives fallback. */
  missingTags: string[];
}

function listClips(tagDir: string): string[] {
  if (!existsSync(tagDir) || !statSync(tagDir).isDirectory()) return [];
  return readdirSync(tagDir)
    .filter((f) => /\.(mp4|mov|m4v|webm)$/i.test(f))
    .map((f) => join(tagDir, f));
}

function pickClip(tag: string): string | null {
  const dir = dataPath('assets', 'footage', tag);
  const clips = listClips(dir);
  if (clips.length === 0) return null;
  return clips[Math.floor(Math.random() * clips.length)]!;
}

const CLIP_FILE_RE = /\.(mp4|mov|m4v|webm)$/i;
const SAFE_TAG_PART = /^[a-z0-9][a-z0-9_-]{0,40}$/i;

/** Resolve "tag/file" → absolute path inside data/assets/footage. Returns null
 * if the reference is malformed or the file doesn't exist. */
function resolveClipFile(ref: string): string | null {
  if (typeof ref !== 'string' || !ref.includes('/')) return null;
  const [tag, ...rest] = ref.split('/');
  const file = rest.join('/');
  if (!tag || !file) return null;
  if (!SAFE_TAG_PART.test(tag)) return null;
  if (!CLIP_FILE_RE.test(file)) return null;
  // forbid path traversal segments
  if (file.includes('..') || file.includes('/')) return null;
  const abs = join(dataPath('assets', 'footage', tag), file);
  return existsSync(abs) ? abs : null;
}

function pickMusic(musicMood: string | undefined): string | null {
  if (!musicMood) return null;
  const dir = dataPath('assets', 'audio', musicMood);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /\.(mp3|m4a|aac|wav)$/i.test(f));
  if (files.length === 0) return null;
  return join(dir, files[Math.floor(Math.random() * files.length)]!);
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (b) => (stderr += b.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

export async function renderReels(
  script: ReelsScript,
  rubric: RubricConfig,
  outDir: string,
): Promise<ReelsRenderResult> {
  await mkdir(outDir, { recursive: true });

  // Always write the script as Markdown — useful for fallback delivery and as
  // an artefact next to the rendered video.
  const scriptPath = join(outDir, 'reels-script.md');
  await writeFile(scriptPath, formatScript(script), 'utf8');

  // Resolve each scene to a concrete clip. Prefer scene.clipFile (Claude
  // picked it from the described library); fall back to a random clip in the
  // scene.footageTag folder.
  const sceneClips: { sceneIdx: number; clip: string; duration: number }[] = [];
  const missing: string[] = [];
  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i]!;
    let clip: string | null = null;
    if (scene.clipFile) clip = resolveClipFile(scene.clipFile);
    if (!clip && scene.footageTag) clip = pickClip(scene.footageTag);
    if (clip) {
      sceneClips.push({ sceneIdx: i, clip, duration: scene.duration });
    } else {
      missing.push(scene.clipFile ?? scene.footageTag ?? `scene-${i + 1}`);
    }
  }

  if (missing.length > 0) {
    log.warn('Reels: footage missing → fallback (script-only)', { missing, outDir });
    return { mode: 'fallback', scriptPath, missingTags: missing };
  }

  // Full FFmpeg pipeline. Build a concat file and burn subtitles via drawtext.
  const workdir = mkdtempSync(join(tmpdir(), 'reels-'));
  try {
    // Step 1: trim/scale each clip to its scene duration at 1080×1920.
    const scaledClips: string[] = [];
    for (const sc of sceneClips) {
      const out = join(workdir, `scene-${String(sc.sceneIdx + 1).padStart(2, '0')}.mp4`);
      await run('ffmpeg', [
        '-y',
        '-i', sc.clip,
        '-t', String(sc.duration),
        '-vf', "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1",
        '-r', '30',
        '-an',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        out,
      ]);
      scaledClips.push(out);
    }

    // Step 2: concat all scaled clips.
    const concatList = join(workdir, 'concat.txt');
    writeFileSync(concatList, scaledClips.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    const merged = join(workdir, 'merged.mp4');
    await run('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatList,
      '-c', 'copy',
      merged,
    ]);

    // Step 3: burn subtitles. JetBrains Mono Bold per ТЗ §3.2; one drawtext
    // per scene, timed by cumulative duration. The font file ships in the
    // image via apt (fonts-jetbrains-mono).
    const SUB_FONT = '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf';
    const drawtexts: string[] = [];
    let t = 0;
    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i]!;
      // FFmpeg drawtext needs these characters escaped: \ ' : , [ ]
      const text = (script.subtitles[i] ?? scene.text).replace(/[\\':,\[\]]/g, (c) => `\\${c}`);
      drawtexts.push(
        `drawtext=fontfile='${SUB_FONT}':text='${text}':` +
        `fontcolor=white:fontsize=58:line_spacing=14:` +
        `box=1:boxcolor=black@0.6:boxborderw=22:` +
        `x=(w-text_w)/2:y=h-text_h-200:` +
        `enable='between(t,${t},${t + scene.duration})'`,
      );
      t += scene.duration;
    }
    const withSubs = join(outDir, 'reels.mp4');
    const vf = drawtexts.join(',');

    // Step 4: optionally mix in background music.
    const music = pickMusic(rubric.musicMood);
    if (music) {
      await run('ffmpeg', [
        '-y',
        '-i', merged,
        '-i', music,
        '-vf', vf,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        '-filter_complex', '[1:a]volume=0.15[a1]',
        '-map', '0:v',
        '-map', '[a1]',
        withSubs,
      ]);
    } else {
      await run('ffmpeg', ['-y', '-i', merged, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', withSubs]);
    }

    log.info('Reels rendered', { outDir, mode: 'video' });
    return { mode: 'video', scriptPath, videoPath: withSubs, missingTags: [] };
  } catch (err) {
    log.error('Reels FFmpeg pipeline failed → fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { mode: 'fallback', scriptPath, missingTags: [] };
  }
}
