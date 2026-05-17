// ═══════════════════════════════════════════════════════════════════
// lib/storage.js — local filesystem storage for voice notes
// ───────────────────────────────────────────────────────────────────
// Replaces Supabase Storage. Files are written to VOICE_NOTES_DIR
// (a Docker volume) and served by Caddy from /voice-notes/* with
// path prefix PUBLIC_BASE_URL.
// ═══════════════════════════════════════════════════════════════════

import fs from 'node:fs/promises';
import path from 'node:path';

const VOICE_NOTES_DIR = process.env.VOICE_NOTES_DIR || '/data/voice-notes';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

/** Ensure root dir exists on startup. */
export async function initStorage() {
  await fs.mkdir(VOICE_NOTES_DIR, { recursive: true });
}

function sanitizeOwner(owner) {
  return String(owner || 'anon').replace(/[^a-z0-9._@-]/gi, '_');
}

/**
 * Write a voice note to disk.
 * Returns { audioPath: 'owner/123.mp3', audioUrl: 'https://.../voice-notes/owner/123.mp3' }.
 */
export async function uploadVoiceNote(audioBuf, ownerHandle) {
  const safeOwner = sanitizeOwner(ownerHandle);
  const filename = `${Date.now()}.mp3`;
  const relPath = `${safeOwner}/${filename}`;
  const absPath = path.join(VOICE_NOTES_DIR, safeOwner, filename);

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, Buffer.from(audioBuf));

  return {
    audioPath: relPath,
    audioUrl: `${PUBLIC_BASE_URL}/voice-notes/${relPath}`,
  };
}
