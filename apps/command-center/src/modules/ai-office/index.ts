import type { ModuleEntry } from '../_types'

const aiOffice: ModuleEntry = {
  slug: 'ai-office',
  name: 'AI Growth Office',
  tagline:
    'Интерактивный pixel-office с 10 AI-агентами + диалоговый виджет. Стартовая страница экосистемы.',
  status: 'production',
  baseUrl: 'https://ai-office.46-62-215-11.nip.io',
  docsPath: 'apps/ai-office/CLAUDE.md',
  capabilities: [
    '10 интерактивных AI-агентов на canvas',
    'Диалоговый виджет',
    'Voice-эндпоинты для persona-train',
    'Netlify Functions',
    'Уже встраивается iframe-ом в landings/aisales-system (office-embed.html)',
  ],
  backend: [
    { label: 'Static + Functions', path: 'apps/ai-office' },
    { label: 'Embed-страница', path: 'landings/aisales-system/office-embed.html' },
  ],
  ui: [
    { label: 'Public', path: 'ai-growth-office.ru' },
    { label: 'Self-host', path: 'ai-office.46-62-215-11.nip.io' },
  ],
  notes:
    'Уже работает как embed через iframe. Полноценный модуль = JS-loader + конфиг + npm @ai-growth-office/embed для встраивания одной строкой <script>.',
}

export default aiOffice
