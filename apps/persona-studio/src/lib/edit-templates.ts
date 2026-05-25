// Каталог пресетов монтажа для Submagic.
// `submagicTemplate` — точное имя шаблона в Submagic API (см. /v1/templates).
// `label` / `description` — UI-копи в кабинете.
//
// Источник имён шаблонов: Submagic public API docs (`templateName` в
// POST /v1/projects). Если шаблон в Submagic переименуют — меняем здесь.

export type EditTemplate =
  | 'hormozi'
  | 'mrbeast'
  | 'devin'
  | 'iman-gadzhi'
  | 'ali-abdaal'
  | 'minimal';

export type EditTemplatePreset = {
  slug: EditTemplate;
  label: string;
  submagicTemplate: string;
  description: string;
};

export const EDIT_TEMPLATES: EditTemplatePreset[] = [
  {
    slug: 'hormozi',
    label: 'Hormozi',
    submagicTemplate: 'Hormozi',
    description: 'Жирные жёлто-белые слова, агрессивный pacing — топ для бизнес-shorts.',
  },
  {
    slug: 'mrbeast',
    label: 'MrBeast',
    submagicTemplate: 'MrBeast',
    description: 'Яркие капс-субтитры с акцентами — энергичный entertainment-вайб.',
  },
  {
    slug: 'devin',
    label: 'Devin',
    submagicTemplate: 'Devin',
    description: 'Минималистичный bold-стиль для tech-influencer контента.',
  },
  {
    slug: 'iman-gadzhi',
    label: 'Iman Gadzhi',
    submagicTemplate: 'Iman Gadzhi',
    description: 'Lifestyle / coach стиль — крупный текст по центру, soft drop-shadow.',
  },
  {
    slug: 'ali-abdaal',
    label: 'Ali Abdaal',
    submagicTemplate: 'Ali Abdaal',
    description: 'Чистый productivity-look, сдержанные акценты, читаемо в long-form.',
  },
  {
    slug: 'minimal',
    label: 'Minimal',
    submagicTemplate: 'Minimal',
    description: 'Только субтитры sans-serif, без украшений — для серьёзного контента.',
  },
];

export const EDIT_TEMPLATE_SLUGS = EDIT_TEMPLATES.map((t) => t.slug) as EditTemplate[];

export function getTemplate(slug: string): EditTemplatePreset | undefined {
  return EDIT_TEMPLATES.find((t) => t.slug === slug);
}

export function isEditTemplate(s: string): s is EditTemplate {
  return EDIT_TEMPLATE_SLUGS.includes(s as EditTemplate);
}

export const SUBTITLE_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
];
