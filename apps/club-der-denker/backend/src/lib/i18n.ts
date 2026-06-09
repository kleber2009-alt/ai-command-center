import { Locale, LOCALES, DEFAULT_LOCALE } from './types';

/**
 * i18n helper (spec 5 "Многоязычность"): 6 locales. The system reads the
 * device language but offers a manual override in the profile that applies
 * instantly across the whole app. UI strings live in mobile/src/i18n and the
 * admin/src/i18n bundles; this module only normalizes locale codes shared by
 * API responses (content is localized per-row in cdd_item_translations).
 */

export function normalizeLocale(input: string | null | undefined): Locale {
  if (!input) return DEFAULT_LOCALE;
  const base = input.toLowerCase().split('-')[0];
  return (LOCALES as string[]).includes(base) ? (base as Locale) : DEFAULT_LOCALE;
}

export function isLocale(input: string): input is Locale {
  return (LOCALES as string[]).includes(input);
}

export { LOCALES, DEFAULT_LOCALE };
