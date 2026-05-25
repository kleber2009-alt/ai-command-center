// Каталог пресетов монтажа Submagic.
//
// Список синхронизирован с GET https://api.submagic.co/v1/templates на
// 2026-05-25 — 45 шаблонов. Каждому добавлены 2-3 style-тега для UI
// (по аналогии с собственной галереей Submagic: "creative, energetic",
// "cinematic, neon" и т. п.).
//
// `name` = точное имя для Submagic API. Если Submagic выкатит новый
// шаблон — он начнёт работать сразу через ручной ввод; в галерее
// появится после обновления этого файла.
//
// ВАЖНО: Submagic при неизвестном templateName молча подменяет на "Sara"
// без ошибки — все имена ниже должны совпадать с /v1/templates 1-в-1.

export type StyleTemplate = {
  name: string;          // canonical Submagic name (used as DB key)
  tags: string[];        // 1-3 style descriptors for UI
  isNew?: boolean;
};

export const STYLE_TEMPLATES: StyleTemplate[] = [
  // Bold / business
  { name: 'Hormozi 1', tags: ['bold', 'yellow-white'] },
  { name: 'Hormozi 2', tags: ['bold', 'business', 'classic'] },
  { name: 'Hormozi 3', tags: ['bold', 'high-contrast'] },
  { name: 'Hormozi 4', tags: ['bold', 'sales'] },
  { name: 'Hormozi 5', tags: ['bold', 'recent'] },
  { name: 'Beast',     tags: ['energetic', 'youtube', 'entertainment'] },

  // Lifestyle / coach
  { name: 'Iman',      tags: ['coach', 'lifestyle'] },
  { name: 'Ali',       tags: ['productivity', 'clean'] },
  { name: 'Devin',     tags: ['tech', 'minimal'] },

  // Cinematic / dramatic
  { name: 'Jack',      tags: ['cinematic', 'neon'] },
  { name: 'Leon',      tags: ['cinematic', 'dark'] },
  { name: 'Jason',     tags: ['cinematic', 'film'] },
  { name: 'William',   tags: ['cinematic', 'noir'] },

  // Creative / organic
  { name: 'Bob',       tags: ['creative', 'energetic'] },
  { name: 'Mark',      tags: ['minimal', 'serif'] },
  { name: 'Karl',      tags: ['effective', 'modern'] },
  { name: 'Daniel',    tags: ['clean', 'corporate'] },
  { name: 'David',     tags: ['warm', 'documentary'] },
  { name: 'Michael',   tags: ['neutral', 'broadcast'] },
  { name: 'Caleb',     tags: ['gritty', 'street'] },
  { name: 'Doug',      tags: ['punchy', 'commentary'] },
  { name: 'Carlos',    tags: ['latin', 'vibrant'] },
  { name: 'Luke',      tags: ['smooth', 'editorial'] },
  { name: 'Noah',      tags: ['soft', 'narrative'] },
  { name: 'Lewis',     tags: ['rough', 'cut'] },
  { name: 'Kendrick',  tags: ['music', 'rhythm'] },
  { name: 'Matt',      tags: ['utility', 'sans'] },
  { name: 'Nick',      tags: ['casual', 'sans'] },
  { name: 'Dan',       tags: ['plain', 'sans'] },
  { name: 'Dan 2',     tags: ['plain', 'serif'] },

  // Feminine / soft
  { name: 'Jess',      tags: ['soft', 'pastel'] },
  { name: 'Laura',     tags: ['elegant', 'feminine'] },
  { name: 'Claire',    tags: ['boutique', 'fashion'] },
  { name: 'Leila',     tags: ['organic', 'crafted'] },
  { name: 'Sara',      tags: ['default', 'balanced'] },
  { name: 'Ella',      tags: ['dynamic', 'bold'] },
  { name: 'Tayo',      tags: ['friendly', 'youth'] },
  { name: 'Tracy',     tags: ['talkshow', 'subtle'] },
  { name: 'Maya',      tags: ['playful', 'soft'] },
  { name: 'Umi',       tags: ['organic', 'earthy'] },
  { name: 'Kelly 2',   tags: ['minimal', 'design'] },

  // Travel / scenic
  { name: 'Gstaad',    tags: ['travel', 'scenic'] },
  { name: 'Malta',     tags: ['travel', 'sun'] },
  { name: 'Nema',      tags: ['adventure', 'outdoors'] },
  { name: 'seth',      tags: ['raw', 'vlog'] },
];

export const STYLE_TEMPLATE_NAMES = STYLE_TEMPLATES.map((t) => t.name);

export function findTemplate(name: string): StyleTemplate | undefined {
  return STYLE_TEMPLATES.find((t) => t.name === name);
}

export function isStyleTemplate(s: string): boolean {
  return STYLE_TEMPLATE_NAMES.includes(s);
}

// ── Legacy slug shim ──────────────────────────────────────────
// Раньше в DB лежали slug-строки (hormozi/mrbeast/devin/iman-gadzhi/
// ali-abdaal/minimal). Старый worker мапил их через getTemplate(). Чтобы
// не делать миграцию данных, оставляем shim — он используется только
// чтением; новые записи пишутся уже с canonical Submagic-именами.

export type LegacySlug =
  | 'hormozi'
  | 'mrbeast'
  | 'devin'
  | 'iman-gadzhi'
  | 'ali-abdaal'
  | 'minimal';

const LEGACY_MAP: Record<LegacySlug, string> = {
  hormozi: 'Hormozi 2',
  mrbeast: 'Beast',
  devin: 'Devin',
  'iman-gadzhi': 'Iman',
  'ali-abdaal': 'Ali',
  minimal: 'Mark',
};

/** Backward-compat: вернуть Submagic-имя по legacy-slug или null. */
export function getTemplate(stored: string): { submagicTemplate: string } | undefined {
  if (stored in LEGACY_MAP) {
    return { submagicTemplate: LEGACY_MAP[stored as LegacySlug] };
  }
  return undefined;
}

export const SUBTITLE_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
];
