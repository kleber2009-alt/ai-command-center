#!/usr/bin/env node
// Каталог стилей монтажа из мини-аппа «Студия Кадрика» (@studio_kadrik_bot).
// Бот берёт его из Creator Pack — skills.json + samples/ (jpg-постер и mp4-пример).
// Скрипт копирует примеры в public/kadrik-styles/ и пишет
// src/lib/montage/kadrik-styles.data.json; запускать после изменений в паке:
//
//   node scripts/sync-kadrik-styles.mjs [путь к creator-pack-miniapp]
//
// Формат примера (9:16 / 16:9) берётся из самого mp4 через ffprobe.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pack = resolve(process.argv[2] ?? process.env.PACK_DIR ?? join(homedir(), 'creator-pack-miniapp'));
const pub = join(pack, 'public');
const out = join(app, 'public', 'kadrik-styles');
const { skills } = JSON.parse(readFileSync(join(pub, 'skills.json'), 'utf8'));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

function aspect(mp4) {
  try {
    const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', mp4])
      .toString()
      .trim()
      .split(',')
      .map(Number);
    return w > h ? '16:9' : '9:16';
  } catch {
    return null;
  }
}

function copy(rel) {
  const src = join(pub, rel);
  if (!existsSync(src)) return null;
  const name = basename(rel);
  copyFileSync(src, join(out, name));
  return `/kadrik-styles/${name}`;
}

const data = skills
  .filter((s) => s.installed)
  .map((s) => {
    const video = s.sample ? copy(`${s.sample}.mp4`) : null;
    const poster = s.sample ? copy(`${s.sample}.jpg`) : s.img ? copy(s.img) : null;
    const format = video ? aspect(join(pub, `${s.sample}.mp4`)) : s.kind === 'youtube' ? '16:9' : s.kind === 'content' ? 'text' : '9:16';
    return {
      id: s.id,
      name: s.name,
      kind: s.kind,
      sub: s.sub ?? '',
      desc: s.desc ?? '',
      get: s.get ?? '',
      need: s.need ?? '',
      inp: s.inp ?? 'video',
      tags: s.tags ?? [],
      format,
      poster,
      video,
    };
  });

writeFileSync(join(app, 'src', 'lib', 'montage', 'kadrik-styles.data.json'), JSON.stringify(data, null, 2) + '\n');
console.log(`${data.length} стилей · примеры → public/kadrik-styles (${data.filter((d) => d.video).length} видео)`);
