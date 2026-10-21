// Каталог стилей из скиллов монтажа и каруселей (@ilia.paliy):
//   - karusel           — карусели Instagram (20 стилей)
//   - montazh-rils*     — монтаж рилсов 9:16 (палий, арена, кобальт, схема, UI-моушн…)
//   - montazh-dlinnogo-video-youtube — горизонтальный YouTube «Монтаж ЭМ»
//
// Один источник токенов и для карусели (satori, src/lib/carousel/render-skill.ts),
// и для монтажа (ffmpeg + ASS, src/lib/montage/**). Цвета/шрифты перенесены из
// reels-project/src/video/styles.ts и carousel-project/src/carousel/x/*.tsx.
//
// Модуль чистый (без env/DB) — импортируется и клиентом, и воркером.

export type SkillAccentMode =
  /** акцентное слово цветом */
  | 'color'
  /** цвет + свечение (неон, тех-обзор) */
  | 'glow'
  /** плашка цвета акцента, текст accentInk */
  | 'box'
  /** курсив акцентным шрифтом */
  | 'italic'
  /** маркер-подсветка под словом (палий на светлом) */
  | 'highlight';

export type SkillPattern = 'none' | 'grid' | 'grain' | 'stars' | 'wallpaper';

export type SkillFont = {
  /** имя семейства в satori-лоадере и в ASS (совпадает с name-таблицей TTF) */
  family: string;
};

export type SkillStyle = {
  id: string;
  label: string;
  /** из какого скилла пришёл стиль */
  skill: 'karusel' | 'montazh-rils' | 'montazh-youtube';
  description: string;
  tag: string;
  lightBg: string;
  darkBg: string;
  /** текст на светлом фоне */
  ink: string;
  /** текст на тёмном фоне */
  inkOnDark: string;
  /** приглушённый текст (подписи, body) */
  mute: string;
  accent: string;
  /** текст на плашке акцента */
  accentInk: string;
  accent2?: string;
  titleFont: string;
  bodyFont: string;
  /** шрифт для mode='italic' */
  accentFont?: string;
  monoFont: string;
  titleCase: 'lower' | 'upper' | 'none';
  /** заголовок построчно на плашке этого цвета (арена, тех-обзор) */
  titlePlate?: string;
  accentMode: SkillAccentMode;
  pattern: SkillPattern;
  /** тёмные ли слайды по умолчанию (обложка/цитата/CTA тёмные почти везде) */
  revealDark: boolean;
  coverDark: boolean;
  ctaDark: boolean;
};

const MONO = 'JetBrainsMono';

export const SKILL_STYLES: SkillStyle[] = [
  {
    id: 'palii', label: 'Палий', skill: 'montazh-rils',
    description: 'Фирменный стиль рилсов @ilia.paliy: лайм #EAFA00, жирный Montserrat строчными, на светлом — лаймовый маркер под словом.',
    tag: 'лайм / строчные / гротеск',
    lightBg: '#EFEFEF', darkBg: '#07080B', ink: '#0B0B0D', inkOnDark: '#FFFFFF', mute: '#6B6B70',
    accent: '#EAFA00', accentInk: '#0B0B0D',
    titleFont: 'Montserrat 800', bodyFont: 'Montserrat 500', monoFont: MONO,
    titleCase: 'lower', accentMode: 'highlight', pattern: 'none',
    revealDark: false, coverDark: true, ctaDark: true,
  },
  {
    id: 'sticker', label: 'Стикер', skill: 'montazh-rils',
    description: 'Жёлтый фон, слова на наклонных розовых стикерах, капс Montserrat 900.',
    tag: 'жёлтый / розовые стикеры / капс',
    lightBg: '#FFE14D', darkBg: '#111111', ink: '#111111', inkOnDark: '#FFFFFF', mute: '#5A4F1E',
    accent: '#FF2E88', accentInk: '#FFFFFF',
    titleFont: 'Montserrat 900', bodyFont: 'Montserrat 500', monoFont: MONO,
    titleCase: 'upper', accentMode: 'box', pattern: 'none',
    revealDark: false, coverDark: true, ctaDark: true,
  },
  {
    id: 'journal', label: 'Журнал', skill: 'montazh-rils',
    description: 'Чёрно-белый премиум: Playfair Display, акцент курсивом, много воздуха.',
    tag: 'serif / ч-б / премиум',
    lightBg: '#F7F5F0', darkBg: '#0E0E0E', ink: '#141414', inkOnDark: '#FFFFFF', mute: '#6E6A62',
    accent: '#FFFFFF', accentInk: '#111111',
    titleFont: 'Playfair 700', bodyFont: 'Inter 400', accentFont: 'Playfair 700 Italic', monoFont: MONO,
    titleCase: 'none', accentMode: 'italic', pattern: 'none',
    revealDark: false, coverDark: true, ctaDark: true,
  },
  {
    id: 'neon', label: 'Неон', skill: 'montazh-rils',
    description: 'Тёмное техно: широкий Unbounded капсом, циановое свечение акцента.',
    tag: 'тёмный / циан / свечение',
    lightBg: '#0B0D12', darkBg: '#05060A', ink: '#FFFFFF', inkOnDark: '#FFFFFF', mute: '#8A93A6',
    accent: '#3DF5FF', accentInk: '#041015',
    titleFont: 'Unbounded 800', bodyFont: 'Inter 400', monoFont: MONO,
    titleCase: 'upper', accentMode: 'glow', pattern: 'grid',
    revealDark: true, coverDark: true, ctaDark: true,
  },
  {
    id: 'cream', label: 'Крем', skill: 'montazh-rils',
    description: 'Мягкий кремовый, круглый Nunito строчными, персиковый акцент.',
    tag: 'крем / мягкий / округлый',
    lightBg: '#F3EDE4', darkBg: '#2A211B', ink: '#3B2A20', inkOnDark: '#F3EDE4', mute: '#8A7565',
    accent: '#E8A87C', accentInk: '#3B2A20',
    titleFont: 'Nunito 900', bodyFont: 'Nunito 500', monoFont: MONO,
    titleCase: 'lower', accentMode: 'color', pattern: 'none',
    revealDark: false, coverDark: true, ctaDark: true,
  },
  {
    id: 'apple', label: 'Apple', skill: 'montazh-rils',
    description: 'Чистый белый, Inter, синий #0071E3 — как презентации Apple.',
    tag: 'белый / синий / чисто',
    lightBg: '#FFFFFF', darkBg: '#000000', ink: '#1D1D1F', inkOnDark: '#F5F5F7', mute: '#86868B',
    accent: '#0071E3', accentInk: '#FFFFFF',
    titleFont: 'Inter 700', bodyFont: 'Inter 400', monoFont: MONO,
    titleCase: 'none', accentMode: 'color', pattern: 'none',
    revealDark: false, coverDark: true, ctaDark: true,
  },
  {
    id: 'tech', label: 'Тех-обзор', skill: 'montazh-rils',
    description: 'Чёрный фон, жёлтый капс Manrope со свечением — обзоры гаджетов и нейросетей.',
    tag: 'чёрный / жёлтый / капс',
    lightBg: '#000000', darkBg: '#0B0B0C', ink: '#FFFFFF', inkOnDark: '#FFFFFF', mute: '#9A9A9A',
    accent: '#F6EC32', accentInk: '#111111',
    titleFont: 'Manrope 800', bodyFont: 'Manrope 500', monoFont: MONO,
    titleCase: 'upper', accentMode: 'glow', pattern: 'none', titlePlate: '#1C1C1E',
    revealDark: true, coverDark: true, ctaDark: true,
  },
  {
    id: 'arena', label: 'Арена', skill: 'montazh-rils',
    description: 'Бумага в клетку, моноширинный капс на тёмной плашке, красный акцент, пиксельное табло (рилс Artem Lemelson).',
    tag: 'клетка / моно-капс / красный',
    lightBg: '#ECE9E8', darkBg: '#ECE9E8', ink: '#1D1D1F', inkOnDark: '#1D1D1F', mute: '#7A7774',
    accent: '#E04D3B', accentInk: '#FFFFFF', accent2: '#E5AE38',
    titleFont: 'JetBrainsMono 800', bodyFont: 'Inter 400', monoFont: MONO,
    titleCase: 'upper', accentMode: 'color', pattern: 'grid', titlePlate: 'rgba(52,52,55,0.94)',
    revealDark: false, coverDark: false, ctaDark: false,
  },
  {
    id: 'kobalt', label: 'Кобальт', skill: 'montazh-rils',
    description: 'Студия / кобальт / небо, белые карточки интерфейсов, синие овалы «от руки» (рилс про Spec Kit).',
    tag: 'кобальт / карточки / Manrope',
    lightBg: '#EEF0F4', darkBg: '#1A56E8', ink: '#14161A', inkOnDark: '#FFFFFF', mute: '#6B7280',
    accent: '#1D5BEA', accentInk: '#FFFFFF',
    titleFont: 'Manrope 800', bodyFont: 'Manrope 500', monoFont: MONO,
    titleCase: 'none', accentMode: 'box', pattern: 'none',
    revealDark: false, coverDark: true, ctaDark: true,
  },
  {
    id: 'uimotion', label: 'UI-моушн', skill: 'montazh-rils',
    description: 'Стеклянные карточки в духе HeroUI, пилюли, тумблеры, 3D-игрушки на плитках, Onest.',
    tag: 'glass / HeroUI / Onest',
    lightBg: '#FAFAFB', darkBg: '#0B0B0D', ink: '#0B0B0D', inkOnDark: '#F5F5F7', mute: '#8A8A93',
    accent: '#1F7BFF', accentInk: '#FFFFFF', accent2: '#FF3D8B',
    titleFont: 'Onest 600', bodyFont: 'Onest 400', monoFont: MONO,
    // reels-ui-motion: заголовки всегда строчными
    titleCase: 'lower', accentMode: 'box', pattern: 'grid',
    revealDark: true, coverDark: true, ctaDark: true,
  },
  {
    id: 'scheme', label: 'Схема', skill: 'montazh-rils',
    description: 'Почти чёрный фон с сеткой 90 px, один лаймовый акцент со свечением, Unbounded строчными, растущая схема.',
    tag: 'чёрный / лайм-неон / схема',
    // токены reels-neon-schema (src/tokens.ts скилла)
    lightBg: '#080808', darkBg: '#080808', ink: '#F8F8F8', inkOnDark: '#F8F8F8', mute: '#8A8A8A',
    accent: '#C8F850', accentInk: '#080808',
    titleFont: 'Unbounded 800', bodyFont: 'Inter 400', monoFont: MONO,
    titleCase: 'lower', accentMode: 'glow', pattern: 'grid',
    revealDark: true, coverDark: true, ctaDark: true,
  },
  {
    id: 'razbor', label: 'Разбор', skill: 'karusel',
    description: 'Бумага в клетку, окно промпта Claude, красный акцент и курсив Playfair в заголовке.',
    tag: 'клетка / красный / разбор',
    lightBg: '#F3F2EF', darkBg: '#151515', ink: '#141414', inkOnDark: '#F3F2EF', mute: '#77746E',
    accent: '#D7262E', accentInk: '#FFFFFF',
    titleFont: 'InterTight 900', bodyFont: 'InterTight 400', accentFont: 'Playfair 700 Italic', monoFont: MONO,
    titleCase: 'none', accentMode: 'italic', pattern: 'grid',
    revealDark: false, coverDark: false, ctaDark: false,
  },
  {
    id: 'montazhka', label: 'Монтажка', skill: 'karusel',
    description: 'Тёмно-фиолетовый с зерном, красные глитч-плашки, HUD монтажки (REC, таймкод).',
    tag: 'фиолет / глитч / HUD',
    lightBg: '#0A0918', darkBg: '#0A0918', ink: '#F5F3FB', inkOnDark: '#F5F3FB', mute: '#8E8AA8',
    accent: '#F2304B', accentInk: '#FFFFFF',
    titleFont: 'Unbounded 800', bodyFont: 'Inter 400', monoFont: MONO,
    titleCase: 'upper', accentMode: 'box', pattern: 'grain',
    revealDark: true, coverDark: true, ctaDark: true,
  },
  {
    id: 'promo', label: 'Промо-история', skill: 'karusel',
    description: 'Тёмный хук, дальше светлый iOS: лаванда, синий #0D83FF, кнопка с курсором.',
    tag: 'iOS / лаванда / синий',
    lightBg: '#E4E0E9', darkBg: '#131213', ink: '#0B0B0D', inkOnDark: '#FFFFFF', mute: '#6E6A75',
    accent: '#0D83FF', accentInk: '#FFFFFF', accent2: '#FF4D6D',
    titleFont: 'InterTight 900', bodyFont: 'InterTight 400', monoFont: MONO,
    titleCase: 'none', accentMode: 'color', pattern: 'none',
    revealDark: false, coverDark: true, ctaDark: false,
  },
  {
    id: 'dvoinik', label: 'Двойник', skill: 'karusel',
    description: 'Огромный Playfair за человеком, журнальная рамка со штрихкодом, лайм #C8F060.',
    tag: 'журнал / Playfair / лайм',
    lightBg: '#F2EDE3', darkBg: '#080808', ink: '#F5F0E8', inkOnDark: '#F5F0E8', mute: '#9A948A',
    accent: '#C8F060', accentInk: '#080808',
    titleFont: 'Playfair 700', bodyFont: 'PTSerif', accentFont: 'Playfair 700 Italic', monoFont: MONO,
    titleCase: 'none', accentMode: 'italic', pattern: 'none',
    revealDark: true, coverDark: true, ctaDark: true,
  },
  {
    id: 'youtube', label: 'YouTube · Монтаж ЭМ', skill: 'montazh-youtube',
    description: 'Обои macOS, окна со «светофором», голубой акцент #4FB2F0 — стиль ролика «Монтаж ЭМ».',
    tag: 'macOS / окна / голубой',
    // токены montazh-dlinnogo-video-youtube (theme.ts скилла)
    lightBg: '#FFFFFF', darkBg: '#05070C', ink: '#16171B', inkOnDark: '#F1F0F4', mute: '#7B7D86',
    accent: '#4FB2F0', accentInk: '#061018', accent2: '#00C767',
    titleFont: 'Montserrat 800', bodyFont: 'Inter 400', monoFont: MONO,
    titleCase: 'none', accentMode: 'color', pattern: 'wallpaper',
    revealDark: false, coverDark: true, ctaDark: true,
  },
  {
    id: 'bluecaps', label: 'Синий капс', skill: 'karusel',
    description: 'Огромный узкий синий капс Oswald, скрины интерфейса Instagram.',
    tag: 'Oswald / синий / капс',
    lightBg: '#F4F5F8', darkBg: '#0A0F13', ink: '#111318', inkOnDark: '#F4F5F8', mute: '#6B7080',
    accent: '#3171F7', accentInk: '#FFFFFF',
    titleFont: 'Oswald 700', bodyFont: 'Inter 400', monoFont: MONO,
    titleCase: 'upper', accentMode: 'color', pattern: 'none',
    revealDark: false, coverDark: true, ctaDark: true,
  },
  {
    id: 'duel', label: 'Дуэль', skill: 'karusel',
    description: 'Синяя студийная панель, стороны A/B, круг «VS», голосование.',
    tag: 'A vs B / синий / Onest',
    lightBg: '#F5F5F7', darkBg: '#0B0B0D', ink: '#F5F5F7', inkOnDark: '#F5F5F7', mute: '#8A8A93',
    accent: '#1F7BFE', accentInk: '#FFFFFF', accent2: '#FFE14D',
    titleFont: 'Onest 800', bodyFont: 'Onest 400', accentFont: 'Playfair 700 Italic', monoFont: MONO,
    titleCase: 'none', accentMode: 'box', pattern: 'none',
    revealDark: true, coverDark: true, ctaDark: true,
  },
  {
    id: 'dueljournal', label: 'Дуэль-журнал', skill: 'karusel',
    description: 'Кремовая бумага, Cormorant капсом, терракота и рукописный Marck Script.',
    tag: 'крем / Cormorant / терракота',
    lightBg: '#F6F1E9', darkBg: '#2E1C10', ink: '#3B2414', inkOnDark: '#F6F1E9', mute: '#8C7A6B',
    accent: '#E0745A', accentInk: '#FFFFFF',
    titleFont: 'Cormorant 600', bodyFont: 'PTSerif', accentFont: 'MarckScript', monoFont: MONO,
    titleCase: 'upper', accentMode: 'italic', pattern: 'none',
    revealDark: false, coverDark: false, ctaDark: false,
  },
  {
    id: 'pixel', label: 'Пиксель', skill: 'karusel',
    description: 'Сравнение «обычный / мой промпт», тёмные карточки, оранжевый Claude-акцент, пиксельный маскот.',
    tag: 'сравнение / оранжевый / капс',
    lightBg: '#FDFDFD', darkBg: '#24272C', ink: '#111111', inkOnDark: '#FDFDFD', mute: '#70737A',
    accent: '#D97757', accentInk: '#FFFFFF', accent2: '#276BEF',
    titleFont: 'Montserrat 900', bodyFont: 'Inter 400', monoFont: MONO,
    titleCase: 'upper', accentMode: 'color', pattern: 'none',
    revealDark: false, coverDark: true, ctaDark: true,
  },
];

export const SKILL_STYLE_IDS = SKILL_STYLES.map((s) => s.id);

export function findSkillStyle(id: string): SkillStyle | undefined {
  return SKILL_STYLES.find((s) => s.id === id);
}

export function skillStyle(id: string): SkillStyle {
  return findSkillStyle(id) ?? SKILL_STYLES[0];
}

/**
 * Разбор разметки акцентов из скилла karusel: `*слово*` → акцент.
 * Возвращает строки (по \n), каждая — список кусков {text, accent}.
 */
export type RichPart = { text: string; accent: boolean };

export function parseAccents(src: string): RichPart[][] {
  return src.split('\n').map((line) =>
    line
      .split('*')
      .map((text, i) => ({ text, accent: i % 2 === 1 }))
      .filter((p) => p.text.length > 0),
  );
}

export function stripAccents(src: string): string {
  return src.replace(/\*/g, '');
}

export function applyCase(text: string, c: SkillStyle['titleCase']): string {
  if (c === 'upper') return text.toUpperCase();
  if (c === 'lower') return text.toLowerCase();
  return text;
}

/** Контраст WCAG между двумя #RRGGBB (rgba → считаем как #000/#fff по альфе ~ грубо). */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return hex.includes('255') ? 1 : 0;
    const n = parseInt(m[1], 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
