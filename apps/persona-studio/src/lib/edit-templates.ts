// Каталог пресетов монтажа для Submagic.
// `submagicTemplate` — точное имя шаблона в Submagic API.
//
// Полный список доступных шаблонов берётся из GET https://api.submagic.co/v1/templates
// (на 2026-05-25): Matt, Jess, Jack, Nick, Laura, Kelly 2, Claire, Michael,
// Caleb, Kendrick, Lewis, Doug, Carlos, Luke, Leila, Mark, Sara, Daniel,
// Dan 2, Hormozi 4, Dan, Devin, Tayo, Ella, Tracy, Hormozi 1, Hormozi 2,
// Hormozi 3, Hormozi 5, Jason, William, Leon, Ali, Beast, Bob, Maya, Karl,
// Iman, Umi, David, Noah, Gstaad, Malta, Nema, seth.
//
// ВНИМАНИЕ: Submagic при неизвестном templateName молча подменяет на "Sara"
// без ошибки. Только имена из списка выше работают предсказуемо.

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
    submagicTemplate: 'Hormozi 2',
    description: 'Жирные жёлто-белые слова, агрессивный pacing — топ для бизнес-shorts.',
  },
  {
    slug: 'mrbeast',
    label: 'MrBeast (Beast)',
    submagicTemplate: 'Beast',
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
    label: 'Iman',
    submagicTemplate: 'Iman',
    description: 'Lifestyle / coach стиль — крупный текст по центру, soft drop-shadow.',
  },
  {
    slug: 'ali-abdaal',
    label: 'Ali',
    submagicTemplate: 'Ali',
    description: 'Чистый productivity-look, сдержанные акценты, читаемо в long-form.',
  },
  {
    slug: 'minimal',
    label: 'Minimal (Mark)',
    submagicTemplate: 'Mark',
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
