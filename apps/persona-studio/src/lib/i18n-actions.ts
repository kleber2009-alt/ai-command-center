'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { LOCALE_COOKIE, isLocale, type Locale } from './i18n';

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setLocaleAction(next: Locale) {
  if (!isLocale(next)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, next, {
    path: '/',
    maxAge: ONE_YEAR,
    sameSite: 'lax',
  });
  // Layout-level revalidate so the html lang attr + sidebar copy re-render
  // without a hard reload.
  revalidatePath('/', 'layout');
}
