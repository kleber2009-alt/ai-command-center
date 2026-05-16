// ═══════════════════════════════════════════════════════════════════
// lib/generations.js — voice_generations table writes
// ═══════════════════════════════════════════════════════════════════

import { queryOne, query } from './db.js';

export async function logGeneration(row) {
  const inserted = await queryOne(
    `insert into voice_generations
       (voice_id, owner_handle, text, audio_path, audio_url,
        status, source, meta)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     returning id`,
    [
      row.voice_id || null,
      row.owner_handle,
      row.text,
      row.audio_path || null,
      row.audio_url || null,
      row.status || 'generated',
      row.source || 'api',
      JSON.stringify(row.meta || {}),
    ],
  );
  return inserted?.id || null;
}

export async function markGenerationSent(id, { tg_chat_id, tg_message_id, recipient_chat_id } = {}) {
  await query(
    `update voice_generations
        set status = 'sent',
            tg_chat_id = coalesce($2, tg_chat_id),
            tg_message_id = coalesce($3, tg_message_id),
            recipient_chat_id = coalesce($4, recipient_chat_id)
      where id = $1`,
    [id, tg_chat_id ?? null, tg_message_id ?? null, recipient_chat_id ?? null],
  );
}
