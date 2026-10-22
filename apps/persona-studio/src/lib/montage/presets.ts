// Пресеты монтажа из скиллов montazh-rils (палий, стикер, журнал, неон, крем,
// apple, тех-обзор, арена, кобальт), reels-ui-motion, reels-neon-schema,
// reels-promo-face, reels-promo-story и montazh-dlinnogo-video-youtube. Параметры субтитров, хука и
// призыва взяты из SKILL.md каждого скилла (кегли — в пикселях кадра 1080×1920
// / 1920×1080, как в Remotion-проектах скиллов).
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
   * pop — субтитр целиком, появляется разом (montazh-rils, схема: одно слово);
   * karaoke — фраза целиком, будущие слова приглушены (kobalt);
   * reveal — слова проявляются по мере речи, будущих не видно (ui-motion,
   *          promo-face, YouTube «Монтаж ЭМ»).
   */
  mode: 'pop' | 'karaoke' | 'reveal';
  /**
   * Как входит новое слово/субтитр:
   * pop        — масштаб 1.25 → 1 за 120 мс (montazh-rils);
   * blur-slide — сдвиг 18 px + размытие 6 → 0 за 4 кадра (neon-schema Word.tsx);
   * rise       — проявление с размытием и подъёмом (ui-motion / promo-face);
   * scale-blur — масштаб 1.35 → 1 и размытие 12 → 0 за 5 кадров (YouTube Captions.tsx);
   * fly        — слово «влетает» со смазом и защёлкивается в строку (promo-story Kinetic).
   */
  entry?: 'pop' | 'blur-slide' | 'rise' | 'scale-blur' | 'fly';
  /** reveal: слово появляется раньше, чем произнесено (сек) — promo-face: 3 кадра */
  lead?: number;
  /** цвет только что произнесённого слова, затем перетекает в capColor (promo-face) */
  activeColor?: string;
  /** без обводки, только мягкая тень (promo-face, neon-schema, YouTube) */
  shadowOnly?: boolean;
  /** из какого стиля каталога брать цвета/шрифты, если id пресета другой */
  styleId?: string;
  /** зум-панч: насколько приближаем и минимум секунд между панчами */
  punchZoom?: number;
  punchMinGap?: number;
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
    // reels-ui-motion: фраза-заголовок Onest 600 строчными (−0.02em), слова
    // входят по очереди с размытием 14 → 0 и подъёмом 28 px; ключевое слово —
    // на синей пилюле; паузы > 0.25 c вырезаются.
    id: 'uimotion', label: 'UI-моушн', skill: 'reels-ui-motion',
    description: 'Onest строчными, фраза проявляется по словам с размытием, ключевое слово на синей пилюле.',
    format: '9:16', capFont: 'Onest 600', capSize: 84, capY: 1480, capCase: 'lower',
    words: [3, 6], mode: 'reveal', entry: 'rise', capColor: '#F5F5F7', accent: 'box',
    // в скилле камера дрейфует 1.00 → 1.04 — мягкий панч вместо резкого 1.08
    punchZoom: 1.04, punchMinGap: 3, gapMax: 0.25, keep: 0.08, ctaVerb: 'пиши',
  },
  {
    // reels-neon-schema, формат B «живая съёмка + пословные титры»: одно слово
    // капсом, Unbounded 80 px, белый, y ≈ 1350, тень 0 4px 18px; вход — сдвиг
    // 18 px и размытие 6 → 0 за 4 кадра; паузы > 0.2 c вырезаются.
    id: 'scheme', label: 'Неоновая схема', skill: 'reels-neon-schema',
    description: 'Одно слово капсом Unbounded по речи, лаймовый акцент, чёрный фон с сеткой.',
    format: '9:16', capFont: 'Unbounded 800', capSize: 80, capY: 1350, capCase: 'upper',
    words: [1, 1], mode: 'pop', entry: 'blur-slide', shadowOnly: true, capColor: '#F8F8F8', accent: 'color',
    // в скилле — медленный зум 1.00 → 1.03, без резких панчей
    punchZoom: 1.03, punchMinGap: 3, gapMax: 0.2, keep: 0.08, ctaVerb: 'пиши',
  },
  {
    // reels-promo-face: пословные титры Inter Tight 700 86 px, верх строки на
    // y 1210; слово появляется за 3 кадра до произнесения, мягко поднимается
    // (масштаб 0.92 → 1), приходит синим #0D83FF и за ~0.47 c становится белым;
    // без обводки, только тень; кодовое слово в конце — на синей пилюле.
    id: 'promoface', label: 'Промо-история', skill: 'reels-promo-face', styleId: 'promo',
    description: 'Говорящая голова: слова по речи Inter Tight, синяя подсветка произносимого слова, кодовое слово на синей пилюле.',
    format: '9:16', capFont: 'InterTight 700', capSize: 86, capY: 1255, capCase: 'none',
    words: [1, 5], mode: 'reveal', entry: 'rise', lead: 0.1, activeColor: '#0D83FF', shadowOnly: true,
    // в скилле — наезд камеры 1 → 1.08 за ~4 c; резкие панчи «превращают морф в кашу»
    punchZoom: 1.04, punchMinGap: 4,
    capColor: '#FFFFFF', accent: 'color', ...REELS, ctaVerb: 'пиши в комментариях',
  },
  {
    // reels-promo-story, кинетический локап (приёмы A/B/Q): бит 1–3 слова, Inter
    // Tight 700 116 px чуть ниже центра (над ним — плашка призыва); слово влетает со смазом и защёлкивается
    // в плотную строку, летит синим #0D83FF и белеет, когда село; камера медленно
    // наезжает 1 → 1.1. В скилле ролик без лица на музыке — здесь та же подача
    // слов поверх записи с речью (iOS-сцены и 3D-эмодзи движок не рисует).
    id: 'promostory', label: 'Промо-история · без лица', skill: 'reels-promo-story', styleId: 'promo',
    description: 'Кинетический локап: короткие биты Inter Tight крупно, слова влетают со смазом синими и белеют, синий акцент.',
    format: '9:16', capFont: 'InterTight 700', capSize: 116, capY: 1150, capCase: 'none',
    words: [1, 3], mode: 'reveal', entry: 'fly', activeColor: '#0D83FF', shadowOnly: true,
    punchZoom: 1.06, punchMinGap: 3,
    capColor: '#FFFFFF', accent: 'color', ...REELS, ctaVerb: 'пиши',
  },
  {
    // montazh-dlinnogo-video-youtube (Captions.tsx): Montserrat 800 84 px,
    // #F1F0F4 без обводки, одна строка ≤ 4–5 слов, слово входит с масштаба
    // 1.35 и размытия 12 за 5 кадров; 1–2 смысловых слова — #4FB2F0; паузы
    // > 0.28 c ужимаются до 0.13 c; мягкие панчи +2.6 %, не чаще 8 в минуту.
    id: 'youtube', label: 'YouTube · Монтаж ЭМ', skill: 'montazh-dlinnogo-video-youtube',
    description: 'Горизонтальный 16:9: слова по речи снизу, голубой акцент, мягкие зумы, паузы ужимаются.',
    format: '16:9', capFont: 'Montserrat 800', capSize: 84, capY: 950, capCase: 'none',
    words: [2, 5], mode: 'reveal', entry: 'scale-blur', shadowOnly: true, capColor: '#F1F0F4', accent: 'color',
    punchZoom: 1.026, punchMinGap: 7.5, gapMax: 0.28, keep: 0.13, ctaVerb: 'пиши',
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
  return skillStyle(p.styleId ?? p.id);
}

export function frameSize(format: MontageFormat): { w: number; h: number } {
  return format === '16:9' ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 };
}
