// Пресеты монтажа из скиллов montazh-rils (+ arena / kobalt / scheme / uimotion)
// и montazh-dlinnogo-video-youtube. Параметры субтитров, хука и призыва взяты
// из reels-project/src/video/styles.ts и SKILL.md каждого скилла.
//
// Цвета/шрифты — из общего каталога src/lib/skills/styles.ts, здесь только то,
// что относится к видео: кегль, позиция, сколько слов в субтитре, режим показа.
// Модуль чистый (без env/DB) — нужен и клиенту (галерея), и воркеру.

import { skillStyle, type SkillStyle } from '@/lib/skills/styles';

export type MontageFormat = '9:16' | '16:9';

export type MontagePreset = {
  id: string;
  label: string;
  /** скилл-источник для подписи в UI */
  skill: string;
  description: string;
  format: MontageFormat;
  /** шрифт субтитров (семейство из public/fonts) */
  capFont: string;
  capSize: number;
  /** центр строки субтитров по Y (в пикселях кадра) */
  capY: number;
  capCase: SkillStyle['titleCase'];
  /** сколько слов в одном субтитре: [мин, макс] */
  words: [number, number];
  /**
   * pop — 1–3 слова, «выскакивают» с масштаба 1.25 (montazh-rils);
   * karaoke — фраза целиком, будущие слова приглушены (kobalt / uimotion).
   */
  mode: 'pop' | 'karaoke';
  capColor: string;
  /** плашка под строкой (арена / тех-обзор) */
  plate?: string;
  /** как выделять акцентное слово */
  accent: 'color' | 'box' | 'italic';
  /** максимальная пауза, которую оставляем (сек); длиннее — вырезаем */
  gapMax: number;
  /** запас вокруг слова при резке (сек) */
  keep: number;
  /** формулировка призыва */
  ctaVerb: string;
};

const REELS = { gapMax: 0.2, keep: 0.08 };

export const MONTAGE_PRESETS: MontagePreset[] = [
  {
    id: 'palii', label: 'Палий', skill: 'montazh-rils',
    description: 'Фирменный рилс @ilia.paliy: субтитры 1–3 слова строчными, лаймовый акцент, хук-титр сверху, «пиши «слово»» в конце.',
    format: '9:16', capFont: 'Montserrat 800', capSize: 80, capY: 1245, capCase: 'lower',
    words: [1, 3], mode: 'pop', capColor: '#FFFFFF', accent: 'color', ...REELS, ctaVerb: 'пиши',
  },
  {
    id: 'sticker', label: 'Стикер', skill: 'montazh-rils',
    description: 'Капс Montserrat 900, акцентное слово на розовом стикере.',
    format: '9:16', capFont: 'Montserrat 900', capSize: 78, capY: 1245, capCase: 'upper',
    words: [1, 3], mode: 'pop', capColor: '#FFFFFF', accent: 'box', ...REELS, ctaVerb: 'пиши',
  },
  {
    id: 'journal', label: 'Журнал', skill: 'montazh-rils',
    description: 'Playfair Display, акцент курсивом — спокойный премиальный рилс.',
    format: '9:16', capFont: 'Playfair 700', capSize: 80, capY: 1245, capCase: 'none',
    words: [1, 3], mode: 'pop', capColor: '#FFFFFF', accent: 'italic', ...REELS, ctaVerb: 'пиши',
  },
  {
    id: 'neon', label: 'Неон', skill: 'montazh-rils',
    description: 'Широкий Unbounded капсом, циановый акцент.',
    format: '9:16', capFont: 'Unbounded 800', capSize: 66, capY: 1245, capCase: 'upper',
    words: [1, 2], mode: 'pop', capColor: '#FFFFFF', accent: 'color', ...REELS, ctaVerb: 'пиши',
  },
  {
    id: 'cream', label: 'Крем', skill: 'montazh-rils',
    description: 'Мягкий Nunito строчными, персиковый акцент.',
    format: '9:16', capFont: 'Nunito 900', capSize: 82, capY: 1245, capCase: 'lower',
    words: [1, 3], mode: 'pop', capColor: '#FFFFFF', accent: 'color', ...REELS, ctaVerb: 'пиши',
  },
  {
    id: 'apple', label: 'Apple', skill: 'montazh-rils',
    description: 'Inter, синий акцент — чисто и спокойно.',
    format: '9:16', capFont: 'Inter 700', capSize: 76, capY: 1245, capCase: 'none',
    words: [1, 3], mode: 'pop', capColor: '#FFFFFF', accent: 'color', ...REELS, ctaVerb: 'пиши',
  },
  {
    id: 'tech', label: 'Тех-обзор', skill: 'montazh-rils',
    description: 'Жёлтый капс Manrope на тёмной плашке — обзоры гаджетов и нейросетей.',
    format: '9:16', capFont: 'Manrope 800', capSize: 70, capY: 1245, capCase: 'upper',
    words: [1, 2], mode: 'pop', capColor: '#FFFFFF', plate: '#1C1C1E', accent: 'color', ...REELS, ctaVerb: 'пиши',
  },
  {
    id: 'arena', label: 'Арена', skill: 'montazh-rils-arena',
    description: 'Моноширинный капс на тёмной плашке, красный акцент, «напишите «слово» в комментариях» (рилс Artem Lemelson).',
    format: '9:16', capFont: 'JetBrainsMono 800', capSize: 60, capY: 1300, capCase: 'upper',
    words: [1, 3], mode: 'pop', capColor: '#FFFFFF', plate: '#343437', accent: 'color', ...REELS, ctaVerb: 'напишите',
  },
  {
    id: 'kobalt', label: 'Кобальт', skill: 'montazh-rils-kobalt',
    description: 'Подпись-караоке сверху до 7 слов, акцентное слово на синей плашке (рилс Кирилла Юсупова про Spec Kit).',
    format: '9:16', capFont: 'Manrope 800', capSize: 74, capY: 400, capCase: 'none',
    words: [3, 7], mode: 'karaoke', capColor: '#FFFFFF', accent: 'box', ...REELS, ctaVerb: 'пиши',
  },
  {
    id: 'uimotion', label: 'UI-моушн', skill: 'montazh-rils-uimotion',
    description: 'Onest строчными, слова проявляются по мере речи, синий акцент на пилюле.',
    format: '9:16', capFont: 'Onest 600', capSize: 60, capY: 1500, capCase: 'lower',
    words: [3, 6], mode: 'karaoke', capColor: '#FFFFFF', accent: 'box', ...REELS, ctaVerb: 'пиши',
  },
  {
    id: 'scheme', label: 'Схема', skill: 'montazh-rils-scheme',
    description: 'Широкий Unbounded строчными, лаймовый неон-акцент, призыв строкой комментария.',
    format: '9:16', capFont: 'Unbounded 800', capSize: 62, capY: 1330, capCase: 'lower',
    words: [1, 3], mode: 'pop', capColor: '#F2F2F2', accent: 'color', ...REELS, ctaVerb: 'пиши',
  },
  {
    id: 'youtube', label: 'YouTube · Монтаж ЭМ', skill: 'montazh-dlinnogo-video-youtube',
    description: 'Горизонтальный 16:9: субтитры 3–5 слов снизу, голубой акцент, паузы > 0.28 c вырезаются.',
    format: '16:9', capFont: 'Montserrat 800', capSize: 72, capY: 960, capCase: 'none',
    words: [3, 5], mode: 'pop', capColor: '#F1F0F4', accent: 'color', gapMax: 0.28, keep: 0.13, ctaVerb: 'пиши',
  },
];

export const DEFAULT_MONTAGE_PRESET = 'palii';

export function findMontagePreset(id: string): MontagePreset | undefined {
  return MONTAGE_PRESETS.find((p) => p.id === id);
}

export function montagePreset(id: string): MontagePreset {
  return findMontagePreset(id) ?? MONTAGE_PRESETS[0];
}

/** Цвета/шрифты стиля (общие с каруселью). */
export function presetStyle(p: MontagePreset): SkillStyle {
  return skillStyle(p.id);
}

export function frameSize(format: MontageFormat): { w: number; h: number } {
  return format === '16:9' ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 };
}
