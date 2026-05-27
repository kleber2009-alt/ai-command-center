// Training context used as a CACHED system-prompt for carousel + reels
// generation.
//
// **Mode: Brandbook-only.**
// Per editor decision, the generator must follow ONLY the three files of the
// Brandbook tab in the cabinet:
//   - data/brandbook/template.html — slide HTML/CSS source of truth
//   - data/brandbook/brandbook.md   — palette / typography / rules
//   - data/brandbook/dataset.json   — reference dataset (slides from real
//                                     successful carousels, with image-gen prompts)
//
// References library (data/assets/references/*) and the prompt library
// (data/assets/prompts/*) are explicitly excluded from generation. They
// remain in the cabinet UI for the editor's own use.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dataPath } from './paths.js';

const BRANDBOOK_ROOT = dataPath('brandbook');
const BRANDBOOK_FILES = {
  html: 'template.html',
  brandbook: 'brandbook.md',
  dataset: 'dataset.json',
} as const;

type FileKey = keyof typeof BRANDBOOK_FILES;

function readEntry(key: FileKey): string {
  const abs = join(BRANDBOOK_ROOT, BRANDBOOK_FILES[key]);
  if (!existsSync(abs)) return '';
  try {
    return readFileSync(abs, 'utf8').trim();
  } catch {
    return '';
  }
}

function mtimeMs(key: FileKey): number {
  const abs = join(BRANDBOOK_ROOT, BRANDBOOK_FILES[key]);
  if (!existsSync(abs)) return 0;
  try { return statSync(abs).mtimeMs; }
  catch { return 0; }
}

interface ContextOpts {
  // Kept for back-compat with existing callers. No effect in brandbook-only mode.
  rubricSlug?: string;
  format?: 'carousel' | 'reels';
}

interface CacheEntry {
  value: string;
  signature: string; // mtime fingerprint — invalidates when any file changes
  ts: number;
}

let cached: CacheEntry | null = null;
const TTL_MS = 60_000;

function signature(): string {
  return [mtimeMs('html'), mtimeMs('brandbook'), mtimeMs('dataset')].join('|');
}

/** Returns the brandbook-only training block. Cached for 60 s; auto-invalidated
 * when any of the three files changes on disk. */
export function loadTrainingContext(_opts: ContextOpts = {}): string {
  const sig = signature();
  if (cached && cached.signature === sig && Date.now() - cached.ts < TTL_MS) {
    return cached.value;
  }
  const html = readEntry('html');
  const brandbook = readEntry('brandbook');
  const dataset = readEntry('dataset');

  const parts: string[] = [];
  parts.push('# Training context — ИСКЛЮЧИТЕЛЬНО Брендбук');
  parts.push(
    'Ниже три документа из вкладки «Брендбук» — ЕДИНСТВЕННЫЙ источник правды ' +
      'для генерации контента. Никаких других стилей, шрифтов, палитр или подач ' +
      'использовать НЕЛЬЗЯ. При конфликте любых других подсказок с этими тремя ' +
      'файлами — всегда побеждают эти три файла.',
  );
  if (html) {
    parts.push('## 1) HTML-шаблон слайда (`data/brandbook/template.html`)');
    parts.push('Этот HTML/CSS — точная геометрия одного слайда. Любая генерация (Claude→JSON, image-gen→PNG) должна эмулировать именно её. Не отступай от размеров, шрифтов и отступов.');
    parts.push('```html\n' + html + '\n```');
  }
  if (brandbook) {
    parts.push('## 2) Брендбук (`data/brandbook/brandbook.md`)');
    parts.push('Палитра, типографика, правила — следовать буквально.');
    parts.push(brandbook);
  }
  if (dataset) {
    parts.push('## 3) Reference dataset (`data/brandbook/dataset.json`)');
    parts.push('Готовые эталонные слайды и image-gen промпты. Это образцы хорошего контента — используй их структуру (cover/hook/problem/step/proof/offer/cta), визуальные приёмы и стилистику, но **не копируй текст дословно**.');
    parts.push('```json\n' + dataset + '\n```');
  }
  if (!html && !brandbook && !dataset) {
    parts.push(
      '> ⚠️ Брендбук-вкладка пуста. Заполни `template.html`, `brandbook.md` и ' +
        '`dataset.json` в кабинете во вкладке «Обучение → Брендбук».',
    );
  }
  const value = parts.join('\n\n');
  cached = { value, signature: sig, ts: Date.now() };
  return value;
}

/** Invalidate the in-memory cache (called after the user PUTs a brandbook file). */
export function resetTrainingContextCache(): void {
  cached = null;
}
