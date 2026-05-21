import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILTIN_PATH = join(__dirname, 'knowledge', 'knowledge_base.md');

export interface KbManager {
  getContent(): string;
  getBytes(): number;
  getLoadedAt(): Date;
  getSource(): 'custom' | 'builtin';
  save(content: string): void;
  reload(): void;
}

export function createKbManager(dataDir: string): KbManager {
  const customPath = join(dataDir, 'knowledge_base.md');

  interface Cache { content: string; source: 'custom' | 'builtin'; loadedAt: Date }
  let cache: Cache | null = null;

  function load(): Cache {
    if (existsSync(customPath)) {
      return { content: readFileSync(customPath, 'utf-8'), source: 'custom', loadedAt: new Date() };
    }
    return { content: readFileSync(BUILTIN_PATH, 'utf-8'), source: 'builtin', loadedAt: new Date() };
  }

  return {
    getContent() { if (!cache) cache = load(); return cache.content; },
    getBytes() { return Buffer.byteLength(this.getContent(), 'utf-8'); },
    getLoadedAt() { if (!cache) cache = load(); return cache.loadedAt; },
    getSource() { if (!cache) cache = load(); return cache.source; },
    save(content: string) {
      writeFileSync(customPath, content, 'utf-8');
      cache = { content, source: 'custom', loadedAt: new Date() };
    },
    reload() { cache = load(); },
  };
}
