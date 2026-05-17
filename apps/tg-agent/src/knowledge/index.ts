import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface KnowledgeBase {
  raw: string;
  loadedAt: Date;
  bytes: number;
}

let cached: KnowledgeBase | null = null;

export function loadKnowledgeBase(): KnowledgeBase {
  if (cached) return cached;
  const path = join(__dirname, 'knowledge_base.md');
  const raw = readFileSync(path, 'utf-8');
  cached = {
    raw,
    loadedAt: new Date(),
    bytes: Buffer.byteLength(raw, 'utf-8'),
  };
  return cached;
}

// For tests and hot-reload paths — not currently wired.
export function resetKnowledgeBase(): void {
  cached = null;
}
