import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * i18n (spec 5): 6 locales. Reads the device language by default, but the
 * profile offers a manual override that applies instantly app-wide. UI keys
 * only — course/feed content is localized server-side.
 */
export const SUPPORTED = ['de', 'en', 'ru', 'es', 'fr', 'it'] as const;
export type AppLocale = (typeof SUPPORTED)[number];

const translations: Record<AppLocale, Record<string, string>> = {
  de: { continue: 'Weiter', next: 'Nächste', email_placeholder: 'E-Mail-Adresse', locked_until_midnight: 'Die nächsten Elemente öffnen um 00:00 Uhr.', buy_course: 'Kurs freischalten', subscribe_community: 'Community abonnieren', streak: 'Serie', level: 'Level' },
  en: { continue: 'Continue', next: 'Next', email_placeholder: 'Email address', locked_until_midnight: 'The next items unlock at 00:00.', buy_course: 'Unlock course', subscribe_community: 'Subscribe to community', streak: 'Streak', level: 'Level' },
  ru: { continue: 'Далее', next: 'Следующий', email_placeholder: 'Адрес электронной почты', locked_until_midnight: 'Следующие элементы откроются в 00:00.', buy_course: 'Открыть курс', subscribe_community: 'Подписаться на сообщество', streak: 'Серия', level: 'Уровень' },
  es: { continue: 'Continuar', next: 'Siguiente', email_placeholder: 'Correo electrónico', locked_until_midnight: 'Los siguientes elementos se abren a las 00:00.', buy_course: 'Desbloquear curso', subscribe_community: 'Suscribirse a la comunidad', streak: 'Racha', level: 'Nivel' },
  fr: { continue: 'Continuer', next: 'Suivant', email_placeholder: 'Adresse e-mail', locked_until_midnight: 'Les prochains éléments s’ouvrent à 00:00.', buy_course: 'Débloquer le cours', subscribe_community: 'S’abonner à la communauté', streak: 'Série', level: 'Niveau' },
  it: { continue: 'Continua', next: 'Successivo', email_placeholder: 'Indirizzo email', locked_until_midnight: 'I prossimi elementi si sbloccano alle 00:00.', buy_course: 'Sblocca il corso', subscribe_community: 'Abbonati alla community', streak: 'Serie', level: 'Livello' },
};

export const i18n = new I18n(translations);
i18n.enableFallback = true;
i18n.defaultLocale = 'de';

const LOCALE_KEY = 'cdd.locale';

export async function initLocale(): Promise<AppLocale> {
  const stored = (await AsyncStorage.getItem(LOCALE_KEY)) as AppLocale | null;
  const device = Localization.getLocales()[0]?.languageCode ?? 'de';
  const locale = stored ?? (SUPPORTED.includes(device as AppLocale) ? (device as AppLocale) : 'de');
  i18n.locale = locale;
  return locale;
}

export async function setLocale(locale: AppLocale): Promise<void> {
  i18n.locale = locale;
  await AsyncStorage.setItem(LOCALE_KEY, locale);
}

export const t = (key: string) => i18n.t(key);
