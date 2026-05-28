// Каталог стилей карусели — AI Carousel Engine v2.
// 5 фиксированных визуальных DNA: каждая обложка + slides + cta идут по
// единому набору правил (палитра, типографика, layout, иконки). Рендер
// маршрутизируется по id в render-slide.ts.

export type CarouselStyleId =
  | 'persona-minimal'
  | 'clickbait-bold'
  | 'knox-cream'
  | 'neon-tech'
  | 'handwritten-viral';

export type CarouselStyleMeta = {
  id: CarouselStyleId;
  label: string;
  description: string;
  // 3-цветная мини-палитра для swatch-превью селектора
  swatch: [string, string, string];
  // Краткая характеристика для UI tag-line
  tag: string;
};

export const CAROUSEL_STYLES: CarouselStyleMeta[] = [
  {
    id: 'persona-minimal',
    label: 'Bold Dark',
    description:
      'Тёмный фон, oversized typography, lime/yellow акценты. Cinematic contrast, floating AI icons. Стиль топовых AI creators.',
    swatch: ['#080808', '#c8f060', '#f5f0e8'],
    tag: 'dark / serif / lime',
  },
  {
    id: 'clickbait-bold',
    label: 'Clean Light',
    description:
      'Editorial whitespace, кобальт-акценты, UPPERCASE хуки + чек-листы. Strict grid, минимум иконок, чистая сетка.',
    swatch: ['#FFFFFF', '#2D5BFF', '#0A0A0A'],
    tag: 'white / cobalt / editorial',
  },
  {
    id: 'knox-cream',
    label: 'Grid Pastel',
    description:
      'Cream/beige фон, duotone заголовки (brown + gold), premium magazine look. Corner markers, editorial cards.',
    swatch: ['#F5EFE0', '#3A2B0F', '#B58620'],
    tag: 'cream / duotone / premium',
  },
  {
    id: 'neon-tech',
    label: 'Neon Tech',
    description:
      'Deep purple/blue градиент, cyan и неон-розовые свечения. Glass cards, wireframes, sci-fi minimal. AI OS / cyber UI.',
    swatch: ['#0A001F', '#00F0FF', '#FF2DAA'],
    tag: 'cyber / glass / neon',
  },
  {
    id: 'handwritten-viral',
    label: 'Handwritten Viral',
    description:
      'Бумага/блокнот, маркер, обводки, стрелки, sticky notes. Creator-notes vibe — brainstorm, viral coaching content.',
    swatch: ['#F4ECD8', '#E63946', '#FFD400'],
    tag: 'paper / marker / handmade',
  },
];

export const DEFAULT_STYLE: CarouselStyleId = 'persona-minimal';

export function isValidStyle(s: string): s is CarouselStyleId {
  return CAROUSEL_STYLES.some((x) => x.id === s);
}

export function styleMeta(id: string): CarouselStyleMeta {
  return CAROUSEL_STYLES.find((x) => x.id === id) ?? CAROUSEL_STYLES[0];
}

// ─────────────────────────────────────────────────────────────────────
// Style tokens — общие токены, которыми пользуются shared cover-type
// рендеры (object/split/ui) в render-slide.ts. Каждый стиль выставляет
// background, текстовые слои, акценты и фирменный «mark» (✦ / // / ◇ / ★).
// ─────────────────────────────────────────────────────────────────────

export type StyleTokens = {
  bg: string;
  surface: string;
  text: string;
  textDim: string;
  textMute: string;
  accent: string; // primary accent (lime / cobalt / gold / cyan / red)
  accent2: string; // secondary accent (warm / black / brown / pink / yellow)
  serif: string;
  mono: string;
  /** Фирменный «мини-маркер» в углу */
  mark: string;
};

export const STYLE_TOKENS: Record<CarouselStyleId, StyleTokens> = {
  'persona-minimal': {
    bg: '#080808',
    surface: '#0f0f0f',
    text: '#f5f0e8',
    textDim: '#b8b3a8',
    textMute: '#5a5550',
    accent: '#c8f060',
    accent2: '#f0c860',
    serif: 'Tinos',
    mono: 'JetBrainsMono',
    mark: '/',
  },
  'clickbait-bold': {
    bg: '#FFFFFF',
    surface: '#F4F4F4',
    text: '#0A0A0A',
    textDim: '#444444',
    textMute: '#8a8a8a',
    accent: '#2D5BFF',
    accent2: '#0A0A0A',
    serif: 'Tinos',
    mono: 'JetBrainsMono',
    mark: '◼',
  },
  'knox-cream': {
    bg: '#F5EFE0',
    surface: '#FAF5E8',
    text: '#3A2B0F',
    textDim: '#4A3E28',
    textMute: '#7A6F5B',
    accent: '#B58620',
    accent2: '#3A2B0F',
    serif: 'Tinos',
    mono: 'JetBrainsMono',
    mark: '✦',
  },
  'neon-tech': {
    bg: '#0A001F',
    surface: 'rgba(255,255,255,0.06)',
    text: '#F0F4FF',
    textDim: '#A4B8E6',
    textMute: '#6478B0',
    accent: '#00F0FF',
    accent2: '#FF2DAA',
    serif: 'Tinos',
    mono: 'JetBrainsMono',
    mark: '◇',
  },
  'handwritten-viral': {
    bg: '#F4ECD8',
    surface: '#FFFFFF',
    text: '#1A1612',
    textDim: '#403828',
    textMute: '#7A6E55',
    accent: '#E63946',
    accent2: '#FFD400',
    serif: 'Tinos',
    mono: 'JetBrainsMono',
    mark: '★',
  },
};

export function styleTokens(id: string): StyleTokens {
  return STYLE_TOKENS[(isValidStyle(id) ? id : DEFAULT_STYLE) as CarouselStyleId];
}
