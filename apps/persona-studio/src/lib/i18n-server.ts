// Server-only helpers for i18n. Kept separate from `i18n.ts` so the client
// bundle never pulls in `next/headers`.

import 'server-only';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, type Locale } from './i18n';

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return value === 'en' ? 'en' : 'ru';
}
