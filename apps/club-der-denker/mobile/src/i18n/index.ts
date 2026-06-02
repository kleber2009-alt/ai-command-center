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

export const LOCALE_NAMES: Record<AppLocale, string> = {
  de: 'Deutsch',
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
};

const translations: Record<AppLocale, Record<string, string>> = {
  de: {
    next: 'Weiter', continue: 'Weiter', back: 'Zurück',
    branch_title: 'Wähle deinen Weg', variant_a: 'Variante A', variant_b: 'Variante B',
    objection_title: 'Einen Moment',
    email_title: 'Bleib dran', email_subtitle: 'Gib deine E-Mail-Adresse ein, um fortzufahren.',
    email_placeholder: 'E-Mail-Adresse', email_invalid: 'Bitte gültige Adresse eingeben',
    paywall_title: 'Hauptprogramm', paywall_subtitle: 'Schalte das vollständige Programm frei.',
    feature_items: '112 Elemente', feature_days: '28 Tage', feature_community: 'Community-Zugang',
    buy_course: 'Kurs freischalten', restore: 'Käufe wiederherstellen',
    register_title: 'Konto erstellen', register_password: 'Passwort', register_save: 'Speichern',
    login_title: 'Willkommen zurück', login_cta: 'Anmelden', login_email: 'E-Mail', login_password: 'Passwort',
    have_account: 'Schon ein Konto? Anmelden', or_continue_with: 'Oder fortfahren mit',
    continue_apple: 'Mit Apple fortfahren', continue_google: 'Mit Google fortfahren',
    tab_course: 'Kurs', tab_feed: 'Community', tab_profile: 'Profil',
    course_day: 'Tag {{day}}', course_locked: 'Die nächsten Elemente öffnen um 00:00 Uhr.',
    course_completed_all: 'Du hast das Programm abgeschlossen!',
    feed_locked_title: 'Community', subscribe_community: 'Community abonnieren',
    profile_level: 'Level', profile_streak: 'Serie', profile_joker: 'Joker', profile_progress: 'Fortschritt',
    joker_available: 'verfügbar', joker_used: 'verbraucht',
    language: 'Sprache', logout: 'Abmelden', delete_account: 'Konto löschen (GDPR)',
    delete_confirm_title: 'Konto löschen', delete_confirm_body: 'Daten werden unwiderruflich entfernt.',
    cancel: 'Abbrechen', delete: 'Löschen',
    level_1: 'Gast', level_2: 'Starter', level_3: 'Fortgeschritten', level_4: 'Profi', level_5: 'Meister',
    error_generic: 'Etwas ist schiefgelaufen', error_offline: 'Offline – zwischengespeicherter Inhalt',
    forgot_link: 'Passwort vergessen?', forgot_title: 'Passwort zurücksetzen', forgot_hint: 'Wir senden dir einen Code per E-Mail.', send_code: 'Code senden', code_sent: 'Code gesendet — prüfe deine E-Mails.', reset_title: 'Neues Passwort', code_label: 'Code', new_password: 'Neues Passwort', reset_cta: 'Passwort speichern',
  },
  en: {
    next: 'Next', continue: 'Continue', back: 'Back',
    branch_title: 'Choose your path', variant_a: 'Option A', variant_b: 'Option B',
    objection_title: 'One moment',
    email_title: 'Stay with it', email_subtitle: 'Enter your email to continue.',
    email_placeholder: 'Email address', email_invalid: 'Please enter a valid address',
    paywall_title: 'Main program', paywall_subtitle: 'Unlock the full program.',
    feature_items: '112 elements', feature_days: '28 days', feature_community: 'Community access',
    buy_course: 'Unlock course', restore: 'Restore purchases',
    register_title: 'Create account', register_password: 'Password', register_save: 'Save',
    login_title: 'Welcome back', login_cta: 'Sign in', login_email: 'Email', login_password: 'Password',
    have_account: 'Already have an account? Sign in', or_continue_with: 'Or continue with',
    continue_apple: 'Continue with Apple', continue_google: 'Continue with Google',
    tab_course: 'Course', tab_feed: 'Community', tab_profile: 'Profile',
    course_day: 'Day {{day}}', course_locked: 'The next items unlock at 00:00.',
    course_completed_all: 'You have completed the program!',
    feed_locked_title: 'Community', subscribe_community: 'Subscribe to community',
    profile_level: 'Level', profile_streak: 'Streak', profile_joker: 'Joker', profile_progress: 'Progress',
    joker_available: 'available', joker_used: 'used',
    language: 'Language', logout: 'Sign out', delete_account: 'Delete account (GDPR)',
    delete_confirm_title: 'Delete account', delete_confirm_body: 'Your data will be permanently removed.',
    cancel: 'Cancel', delete: 'Delete',
    level_1: 'Guest', level_2: 'Starter', level_3: 'Advanced', level_4: 'Pro', level_5: 'Master',
    error_generic: 'Something went wrong', error_offline: 'Offline – showing cached content',
    forgot_link: 'Forgot password?', forgot_title: 'Reset password', forgot_hint: 'We will email you a code.', send_code: 'Send code', code_sent: 'Code sent — check your email.', reset_title: 'New password', code_label: 'Code', new_password: 'New password', reset_cta: 'Save password',
  },
  ru: {
    next: 'Далее', continue: 'Продолжить', back: 'Назад',
    branch_title: 'Выберите путь', variant_a: 'Вариант А', variant_b: 'Вариант Б',
    objection_title: 'Один момент',
    email_title: 'Не останавливайтесь', email_subtitle: 'Введите e-mail, чтобы продолжить.',
    email_placeholder: 'Адрес электронной почты', email_invalid: 'Введите корректный адрес',
    paywall_title: 'Основная программа', paywall_subtitle: 'Откройте полную программу.',
    feature_items: '112 элементов', feature_days: '28 дней', feature_community: 'Доступ к сообществу',
    buy_course: 'Открыть курс', restore: 'Восстановить покупки',
    register_title: 'Создать аккаунт', register_password: 'Пароль', register_save: 'Сохранить',
    login_title: 'С возвращением', login_cta: 'Войти', login_email: 'E-mail', login_password: 'Пароль',
    have_account: 'Уже есть аккаунт? Войти', or_continue_with: 'Или войти через',
    continue_apple: 'Продолжить с Apple', continue_google: 'Продолжить с Google',
    tab_course: 'Курс', tab_feed: 'Сообщество', tab_profile: 'Профиль',
    course_day: 'День {{day}}', course_locked: 'Следующие элементы откроются в 00:00.',
    course_completed_all: 'Вы завершили программу!',
    feed_locked_title: 'Сообщество', subscribe_community: 'Подписаться на сообщество',
    profile_level: 'Уровень', profile_streak: 'Серия', profile_joker: 'Джокер', profile_progress: 'Прогресс',
    joker_available: 'доступен', joker_used: 'использован',
    language: 'Язык', logout: 'Выйти', delete_account: 'Удалить аккаунт (GDPR)',
    delete_confirm_title: 'Удалить аккаунт', delete_confirm_body: 'Данные будут безвозвратно удалены.',
    cancel: 'Отмена', delete: 'Удалить',
    level_1: 'Гость', level_2: 'Новичок', level_3: 'Продвинутый', level_4: 'Профи', level_5: 'Мастер',
    error_generic: 'Что-то пошло не так', error_offline: 'Офлайн — показан кеш',
    forgot_link: 'Забыли пароль?', forgot_title: 'Сброс пароля', forgot_hint: 'Мы отправим код на e-mail.', send_code: 'Отправить код', code_sent: 'Код отправлен — проверьте почту.', reset_title: 'Новый пароль', code_label: 'Код', new_password: 'Новый пароль', reset_cta: 'Сохранить пароль',
  },
  es: {
    next: 'Siguiente', continue: 'Continuar', back: 'Atrás',
    branch_title: 'Elige tu camino', variant_a: 'Opción A', variant_b: 'Opción B',
    objection_title: 'Un momento',
    email_title: 'Sigue adelante', email_subtitle: 'Introduce tu correo para continuar.',
    email_placeholder: 'Correo electrónico', email_invalid: 'Introduce una dirección válida',
    paywall_title: 'Programa principal', paywall_subtitle: 'Desbloquea el programa completo.',
    feature_items: '112 elementos', feature_days: '28 días', feature_community: 'Acceso a la comunidad',
    buy_course: 'Desbloquear curso', restore: 'Restaurar compras',
    register_title: 'Crear cuenta', register_password: 'Contraseña', register_save: 'Guardar',
    login_title: 'Bienvenido de nuevo', login_cta: 'Iniciar sesión', login_email: 'Correo', login_password: 'Contraseña',
    have_account: '¿Ya tienes cuenta? Inicia sesión', or_continue_with: 'O continúa con',
    continue_apple: 'Continuar con Apple', continue_google: 'Continuar con Google',
    tab_course: 'Curso', tab_feed: 'Comunidad', tab_profile: 'Perfil',
    course_day: 'Día {{day}}', course_locked: 'Los siguientes elementos se abren a las 00:00.',
    course_completed_all: '¡Has completado el programa!',
    feed_locked_title: 'Comunidad', subscribe_community: 'Suscribirse a la comunidad',
    profile_level: 'Nivel', profile_streak: 'Racha', profile_joker: 'Comodín', profile_progress: 'Progreso',
    joker_available: 'disponible', joker_used: 'usado',
    language: 'Idioma', logout: 'Cerrar sesión', delete_account: 'Eliminar cuenta (GDPR)',
    delete_confirm_title: 'Eliminar cuenta', delete_confirm_body: 'Tus datos se eliminarán de forma permanente.',
    cancel: 'Cancelar', delete: 'Eliminar',
    level_1: 'Invitado', level_2: 'Principiante', level_3: 'Avanzado', level_4: 'Pro', level_5: 'Maestro',
    error_generic: 'Algo salió mal', error_offline: 'Sin conexión — contenido en caché',
    forgot_link: '¿Olvidaste la contraseña?', forgot_title: 'Restablecer contraseña', forgot_hint: 'Te enviaremos un código por correo.', send_code: 'Enviar código', code_sent: 'Código enviado — revisa tu correo.', reset_title: 'Nueva contraseña', code_label: 'Código', new_password: 'Nueva contraseña', reset_cta: 'Guardar contraseña',
  },
  fr: {
    next: 'Suivant', continue: 'Continuer', back: 'Retour',
    branch_title: 'Choisis ta voie', variant_a: 'Option A', variant_b: 'Option B',
    objection_title: 'Un instant',
    email_title: 'Reste motivé', email_subtitle: 'Saisis ton e-mail pour continuer.',
    email_placeholder: 'Adresse e-mail', email_invalid: 'Saisis une adresse valide',
    paywall_title: 'Programme principal', paywall_subtitle: 'Débloque le programme complet.',
    feature_items: '112 éléments', feature_days: '28 jours', feature_community: 'Accès communauté',
    buy_course: 'Débloquer le cours', restore: 'Restaurer les achats',
    register_title: 'Créer un compte', register_password: 'Mot de passe', register_save: 'Enregistrer',
    login_title: 'Bon retour', login_cta: 'Se connecter', login_email: 'E-mail', login_password: 'Mot de passe',
    have_account: 'Déjà un compte ? Se connecter', or_continue_with: 'Ou continuer avec',
    continue_apple: 'Continuer avec Apple', continue_google: 'Continuer avec Google',
    tab_course: 'Cours', tab_feed: 'Communauté', tab_profile: 'Profil',
    course_day: 'Jour {{day}}', course_locked: 'Les prochains éléments s’ouvrent à 00:00.',
    course_completed_all: 'Tu as terminé le programme !',
    feed_locked_title: 'Communauté', subscribe_community: 'S’abonner à la communauté',
    profile_level: 'Niveau', profile_streak: 'Série', profile_joker: 'Joker', profile_progress: 'Progression',
    joker_available: 'disponible', joker_used: 'utilisé',
    language: 'Langue', logout: 'Se déconnecter', delete_account: 'Supprimer le compte (GDPR)',
    delete_confirm_title: 'Supprimer le compte', delete_confirm_body: 'Tes données seront définitivement supprimées.',
    cancel: 'Annuler', delete: 'Supprimer',
    level_1: 'Invité', level_2: 'Débutant', level_3: 'Avancé', level_4: 'Pro', level_5: 'Maître',
    error_generic: 'Une erreur est survenue', error_offline: 'Hors ligne — contenu en cache',
    forgot_link: 'Mot de passe oublié ?', forgot_title: 'Réinitialiser le mot de passe', forgot_hint: 'Nous t’enverrons un code par e-mail.', send_code: 'Envoyer le code', code_sent: 'Code envoyé — vérifie tes e-mails.', reset_title: 'Nouveau mot de passe', code_label: 'Code', new_password: 'Nouveau mot de passe', reset_cta: 'Enregistrer le mot de passe',
  },
  it: {
    next: 'Avanti', continue: 'Continua', back: 'Indietro',
    branch_title: 'Scegli il tuo percorso', variant_a: 'Opzione A', variant_b: 'Opzione B',
    objection_title: 'Un momento',
    email_title: 'Vai avanti', email_subtitle: 'Inserisci la tua email per continuare.',
    email_placeholder: 'Indirizzo email', email_invalid: 'Inserisci un indirizzo valido',
    paywall_title: 'Programma principale', paywall_subtitle: 'Sblocca il programma completo.',
    feature_items: '112 elementi', feature_days: '28 giorni', feature_community: 'Accesso alla community',
    buy_course: 'Sblocca il corso', restore: 'Ripristina acquisti',
    register_title: 'Crea account', register_password: 'Password', register_save: 'Salva',
    login_title: 'Bentornato', login_cta: 'Accedi', login_email: 'Email', login_password: 'Password',
    have_account: 'Hai già un account? Accedi', or_continue_with: 'Oppure continua con',
    continue_apple: 'Continua con Apple', continue_google: 'Continua con Google',
    tab_course: 'Corso', tab_feed: 'Community', tab_profile: 'Profilo',
    course_day: 'Giorno {{day}}', course_locked: 'I prossimi elementi si sbloccano alle 00:00.',
    course_completed_all: 'Hai completato il programma!',
    feed_locked_title: 'Community', subscribe_community: 'Abbonati alla community',
    profile_level: 'Livello', profile_streak: 'Serie', profile_joker: 'Jolly', profile_progress: 'Progresso',
    joker_available: 'disponibile', joker_used: 'usato',
    language: 'Lingua', logout: 'Esci', delete_account: 'Elimina account (GDPR)',
    delete_confirm_title: 'Elimina account', delete_confirm_body: 'I tuoi dati verranno rimossi definitivamente.',
    cancel: 'Annulla', delete: 'Elimina',
    level_1: 'Ospite', level_2: 'Principiante', level_3: 'Avanzato', level_4: 'Pro', level_5: 'Maestro',
    error_generic: 'Qualcosa è andato storto', error_offline: 'Offline — contenuto in cache',
    forgot_link: 'Password dimenticata?', forgot_title: 'Reimposta password', forgot_hint: 'Ti invieremo un codice via email.', send_code: 'Invia codice', code_sent: 'Codice inviato — controlla l’email.', reset_title: 'Nuova password', code_label: 'Codice', new_password: 'Nuova password', reset_cta: 'Salva password',
  },
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

export const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts);
export const levelName = (level: number) => i18n.t(`level_${Math.min(5, Math.max(1, level))}`);
