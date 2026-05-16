#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// scripts/migrate-storage.mjs
// ───────────────────────────────────────────────────────────────────────
// Качает все mp3 из Supabase Storage bucket `voice-notes` и кладёт их в
// локальный docker volume `voice-notes`, читая список путей из таблицы
// voice_generations.
//
// Использование:
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_KEY=eyJhbGc... \
//   DATABASE_URL=postgres://ai:PASS@127.0.0.1:5432/ai \
//   node scripts/migrate-storage.mjs
//
// Где брать DATABASE_URL: проброс порта из compose
//   docker compose exec postgres true   # убедиться что up
//   # вариант 1: запускаем скрипт ИЗ контейнера ai-office
//   docker compose exec ai-office node /app/scripts/... (после копирования)
//   # вариант 2: пробросить порт временно: -p 127.0.0.1:5432:5432
// ═══════════════════════════════════════════════════════════════════════

import { promises as fs } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || 'voice-notes';
const DATABASE_URL = process.env.DATABASE_URL;
const OUT_DIR = process.env.VOICE_NOTES_DIR || './voice-notes-export';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: задайте SUPABASE_URL и SUPABASE_SERVICE_KEY');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('ERROR: задайте DATABASE_URL (на локальный Postgres)');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function listAudioPaths() {
  const r = await pool.query(
    `select id, audio_path, owner_handle
       from voice_generations
      where audio_path is not null
      order by created_at`,
  );
  return r.rows;
}

async function downloadOne(p) {
  // Объекты в Supabase Storage в bucket `voice-notes` имеют путь {owner}/{ts}.mp3.
  // Public download URL: ${url}/storage/v1/object/public/${BUCKET}/${path}
  // Service-key download: ${url}/storage/v1/object/${BUCKET}/${path} с Bearer.
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(BUCKET)}/${p
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const rows = await listAudioPaths();
  console.log(`→ Найдено ${rows.length} файлов для скачивания`);
  if (rows.length === 0) {
    console.log('✓ Нечего переносить');
    await pool.end();
    return;
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  let ok = 0, fail = 0;
  for (const row of rows) {
    const dest = path.join(OUT_DIR, row.audio_path);
    try {
      // Пропускаем если уже скачан.
      try {
        await fs.access(dest);
        ok++;
        continue;
      } catch {}

      const buf = await downloadOne(row.audio_path);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, buf);
      ok++;
      process.stdout.write(`  ${row.audio_path} (${buf.length} bytes)\n`);
    } catch (e) {
      fail++;
      console.warn(`  ! ${row.audio_path}: ${e.message}`);
    }
  }

  console.log(`\n✓ Скачано: ${ok}, ошибок: ${fail}`);
  console.log(`Файлы лежат в ${OUT_DIR}. Дальше:`);
  console.log(`  docker compose cp ${OUT_DIR}/. ai-office:/data/voice-notes/`);
  console.log(`Или (если volume mount-ится в хост): rsync -a ${OUT_DIR}/ /var/lib/docker/volumes/.../voice-notes/`);

  await pool.end();
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
