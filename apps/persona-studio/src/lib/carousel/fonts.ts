// Лоадер шрифтов для satori. Кэшируется в памяти при первом использовании
// (горячий путь рендера — не дёргаем fs.readFile на каждый слайд).
// TTF'ы лежат в public/fonts/, попадают в Docker-образ через копирование public/.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Font } from 'satori';

let cached: Font[] | null = null;

export const SKILL_FONT_FILES: [name: string, file: string][] = [
  ['Montserrat 500', 'Montserrat-500.ttf'],
  ['Montserrat 800', 'Montserrat-800.ttf'],
  ['Montserrat 900', 'Montserrat-900.ttf'],
  ['Manrope 500', 'Manrope-500.ttf'],
  ['Manrope 800', 'Manrope-800.ttf'],
  ['Inter 400', 'Inter-400.ttf'],
  ['Inter 700', 'Inter-700.ttf'],
  ['Onest 400', 'Onest-400.ttf'],
  ['Onest 600', 'Onest-600.ttf'],
  ['Onest 800', 'Onest-800.ttf'],
  ['Nunito 500', 'Nunito-500.ttf'],
  ['Nunito 900', 'Nunito-900.ttf'],
  ['Unbounded 400', 'Unbounded-400.ttf'],
  ['Unbounded 800', 'Unbounded-800.ttf'],
  ['Playfair 700', 'PlayfairDisplay-700.ttf'],
  ['Playfair 700 Italic', 'PlayfairDisplay-700i.ttf'],
  ['JetBrainsMono 800', 'JetBrainsMono-800.ttf'],
  ['PressStart2P', 'PressStart2P.ttf'],
  ['InterTight 400', 'InterTight-400.ttf'],
  ['InterTight 700', 'InterTight-700.ttf'],
  ['InterTight 900', 'InterTight-900.ttf'],
  ['Oswald 700', 'Oswald-700.ttf'],
  ['Cormorant 600', 'CormorantGaramond-600.ttf'],
  ['MarckScript', 'MarckScript.ttf'],
  ['PTSerif', 'PTSerif.ttf'],
  ['MontserratAlternates 700', 'MontserratAlternates-700.ttf'],
  // ilia-carousel-style remix (Futura PT → Jost): 300 pills, 500 headings, 600 cover caps.
  ['Jost 300', 'Jost-300.ttf'],
  ['Jost 400', 'Jost-400.ttf'],
  ['Jost 500', 'Jost-500.ttf'],
  ['Jost 600', 'Jost-600.ttf'],
];

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');

export async function loadFonts(): Promise<Font[]> {
  if (cached) return cached;
  const [tinos, tinosItalic, tinosBold, mono] = await Promise.all([
    readFile(path.join(FONTS_DIR, 'Tinos-Regular.ttf')),
    readFile(path.join(FONTS_DIR, 'Tinos-Italic.ttf')),
    readFile(path.join(FONTS_DIR, 'Tinos-Bold.ttf')),
    readFile(path.join(FONTS_DIR, 'JetBrainsMono-Regular.ttf')),
  ]);
  // Шрифты скилл-стилей (karusel / montazh-rils) — статичные инстансы
  // вариативных TTF; имя = имя семейства в TTF (им же пользуется libass в монтаже).
  const skill = await Promise.all(
    SKILL_FONT_FILES.map(async ([name, file]) => ({
      name,
      data: await readFile(path.join(FONTS_DIR, file)),
      weight: 400 as const,
      style: 'normal' as const,
    })),
  );
  cached = [
    { name: 'Tinos', data: tinos, weight: 400, style: 'normal' },
    { name: 'Tinos', data: tinosItalic, weight: 400, style: 'italic' },
    { name: 'Tinos', data: tinosBold, weight: 700, style: 'normal' },
    { name: 'JetBrainsMono', data: mono, weight: 400, style: 'normal' },
    ...skill,
  ];
  return cached;
}
