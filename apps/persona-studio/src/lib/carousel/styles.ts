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
