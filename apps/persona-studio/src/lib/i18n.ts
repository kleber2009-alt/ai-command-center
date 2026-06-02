// Lightweight i18n for the persona-studio shell.
//
// Scope: navigation chrome (sidebar, top bar, AI Director, switcher). Page
// bodies are mostly Russian already and read their own copy. Adding a new
// canonical English string anywhere in those shells = add a row to RU_DICT.
//
// English is the canonical key; Russian is the translation. If a key is
// missing from RU_DICT we fall back to the key itself, so the UI never
// shows an empty string.
//
// This module is import-safe from both server and client components. The
// `getLocale()` helper that reads cookies lives in `i18n-server.ts` so
// `next/headers` doesn't leak into the client bundle.

export type Locale = 'ru' | 'en';
export const LOCALE_COOKIE = 'persona-locale';
export const DEFAULT_LOCALE: Locale = 'ru';

const RU_DICT: Record<string, string> = {
  // ── Sidebar sections ──
  Home: 'Главная',
  Create: 'Создать',
  Pipelines: 'Пайплайны',
  Library: 'Библиотека',
  Discover: 'Обзор',
  Automation: 'Автоматизация',
  Settings: 'Настройки',
  Admin: 'Админ',

  // ── Sidebar items ──
  Avatar: 'Аватар',
  Voice: 'Голос',
  Video: 'Видео',
  Carousel: 'Карусель',
  Montage: 'Монтаж',
  'Content Factory': 'Фабрика контента',
  'Reels Engine': 'Reels-движок',
  'AI Clone': 'AI-двойник',
  Avatars: 'Аватары',
  Covers: 'Обложки',
  Videos: 'Видео',
  Assets: 'Ассеты',
  Research: 'Ресёрч',
  'Hook Gallery': 'Галерея хуков',
  Radars: 'Радары',
  Folders: 'Папки',
  'Viral Posts (legacy)': 'Виральные посты (legacy)',
  Queue: 'Очередь',
  Scheduled: 'Запланировано',
  'AI Agents': 'AI-агенты',
  Subscription: 'Подписка',
  Integrations: 'Интеграции',
  Console: 'Консоль',

  // ── Sidebar hints ──
  '1 photo → 10 avatars': '1 фото → 10 аватаров',
  'clone & train': 'клонирование и обучение',
  'talking-photo': 'говорящее фото',
  'editorial slides': 'editorial-слайды',
  'Submagic edit': 'монтаж Submagic',
  'niche-based viral hunt': 'поиск виральных по нише',
  'millions-of-views hooks': 'хуки на миллионы просмотров',
  'saved niche trackers': 'сохранённые трекеры ниш',
  'bloggers · videos · ideas': 'блогеры · видео · идеи',

  // ── Sidebar footer ──
  Tokens: 'Токены',
  Plan: 'План',
  Creator: 'Креатор',
  'Help & Docs →': 'Помощь и доки →',

  // ── Top action bar ──
  'Search anything…': 'Найти что угодно…',
  Notifications: 'Уведомления',
  'Create Content': 'Создать контент',
  'Quick create': 'Быстро создать',
  'Sign out': 'Выйти',

  // ── Quick create actions ──
  'Create Reel': 'Создать Reel',
  'Create Carousel': 'Создать карусель',
  'Talking Video': 'Говорящее видео',
  'Generate Avatar': 'Сгенерировать аватар',
  'Train Voice': 'Обучить голос',
  'talking-head video': 'видео с говорящим лицом',
  'avatar + script': 'аватар + сценарий',
  'voice + avatar': 'голос + аватар',
  '10 styles batch': 'батч из 10 стилей',
  'persona train': 'обучение персоны',

  // ── AI Director bar ──
  'AI Director': 'AI-режиссёр',
  beta: 'бета',
  'Tell AI what to create. It will handle the rest.':
    'Скажи AI, что создать. Остальное он сделает сам.',
  hide: 'скрыть',
  'What do you want to create today?': 'Что хочешь создать сегодня?',
  send: 'отправить',
  'Open AI Director': 'Открыть AI-режиссёра',
  'Collapse director bar': 'Свернуть AI-режиссёра',
  'Viral Reel about habits': 'Виральный Reel про привычки',
  'Motivational carousel': 'Мотивационная карусель',
  'Talking video about AI': 'Говорящее видео про AI',
  'Productivity tips video': 'Видео про продуктивность',

  // ── Misc UI chrome ──
  'Toggle navigation': 'Открыть меню',
};

export function t(key: string, locale: Locale): string {
  if (locale === 'en') return key;
  return RU_DICT[key] ?? key;
}

export function isLocale(value: unknown): value is Locale {
  return value === 'ru' || value === 'en';
}
