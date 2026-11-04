import type { ModuleEntry } from '../_types'

const personaTrain: ModuleEntry = {
  slug: 'persona-train',
  name: 'Persona Train',
  tagline:
    'Voice clone (ElevenLabs IVC) + avatar-семплы для дообучения. Отдельная ветка persona-train.aicex.club.',
  status: 'dev',
  baseUrl: 'https://persona-train.aicex.club',
  docsPath: 'apps/persona-train/CLAUDE.md',
  capabilities: [
    'Сбор voice-семплов в Telegram-боте',
    'Создание voice через ElevenLabs IVC',
    'Avatar-семплы для последующего дообучения',
    'Shared voices table с voice-bot',
  ],
  backend: [
    { label: 'Source', path: 'apps/persona-train' },
    { label: 'Web :3030', path: 'persona-train-web' },
  ],
  ui: [
    { label: 'Web', path: 'persona-train.aicex.club' },
    { label: 'Telegram bot', path: '@ilia_pali0_bot' },
  ],
  notes:
    'Не значится в Command Center как продукт — отдельная инициатива. Полноценный модуль = REST для подачи семплов + Bearer + npm @persona-train/sdk.',
}

export default personaTrain
