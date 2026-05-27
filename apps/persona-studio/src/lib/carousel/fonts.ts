// Лоадер шрифтов для satori. Кэшируется в памяти при первом использовании
// (горячий путь рендера — не дёргаем fs.readFile на каждый слайд).
// TTF'ы лежат в public/fonts/, попадают в Docker-образ через копирование public/.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Font } from 'satori';

let cached: Font[] | null = null;

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');

export async function loadFonts(): Promise<Font[]> {
  if (cached) return cached;
  const [tinos, tinosItalic, tinosBold, mono] = await Promise.all([
    readFile(path.join(FONTS_DIR, 'Tinos-Regular.ttf')),
    readFile(path.join(FONTS_DIR, 'Tinos-Italic.ttf')),
    readFile(path.join(FONTS_DIR, 'Tinos-Bold.ttf')),
    readFile(path.join(FONTS_DIR, 'JetBrainsMono-Regular.ttf')),
  ]);
  cached = [
    { name: 'Tinos', data: tinos, weight: 400, style: 'normal' },
    { name: 'Tinos', data: tinosItalic, weight: 400, style: 'italic' },
    { name: 'Tinos', data: tinosBold, weight: 700, style: 'normal' },
    { name: 'JetBrainsMono', data: mono, weight: 400, style: 'normal' },
  ];
  return cached;
}
