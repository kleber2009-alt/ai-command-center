// Каталог стилей карусели. Каждый стиль = id, label, описание, swatch
// (мини-палитра для UI-превью), и набор шаблонов для трёх типов слайдов
// (cover/reveal/cta). Рендер маршрутизируется по style в render-slide.ts.

export type CarouselStyleId = 'persona-minimal' | 'clickbait-bold' | 'knox-cream';

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
    label: 'Persona Minimal',
    description:
      'Тёмный минимализм. Аватар фоном на обложке, Tinos serif, lime-акценты. Дефолт.',
    swatch: ['#080808', '#c8f060', '#f5f0e8'],
    tag: 'dark / serif / lime',
  },
  {
    id: 'clickbait-bold',
    label: 'Clickbait Bold',
    description:
      'Белый фон, кобальтовый «1. ШАГ», чёрные UPPERCASE-хуки, сине-галочные чеклисты. Стиль русскоязычных tech-блогеров.',
    swatch: ['#FFFFFF', '#2D5BFF', '#0A0A0A'],
    tag: 'white / cobalt / bold',
  },
  {
    id: 'knox-cream',
    label: 'Knox Cream',
    description:
      'Cream/beige фон, duotone заголовки (brown + gold), премиум YouTube/inforgaphic-look. Стиль @theromanknox.',
    swatch: ['#F5EFE0', '#3A2B0F', '#B58620'],
    tag: 'cream / duotone / premium',
  },
];

export const DEFAULT_STYLE: CarouselStyleId = 'persona-minimal';

export function isValidStyle(s: string): s is CarouselStyleId {
  return CAROUSEL_STYLES.some((x) => x.id === s);
}

export function styleMeta(id: string): CarouselStyleMeta {
  return CAROUSEL_STYLES.find((x) => x.id === id) ?? CAROUSEL_STYLES[0];
}
