import type { ModuleEntry } from '../_types'

const miniApp: ModuleEntry = {
  slug: 'mini-app',
  name: 'AI Office Mini App',
  tagline:
    'Telegram Mini App для AI Growth Office: онбординг, контент, AI-чат внутри @AI_Growth_Office_Bot.',
  status: 'dev',
  baseUrl: 'https://ai-office.46-62-215-11.nip.io/mini-app/',
  docsPath: 'apps/ai-office/mini-app',
  capabilities: [
    'Telegram Mini App стартует через бота',
    'Tabs: онбординг, контент, чат',
    'Тематика AI Growth Office',
  ],
  backend: [{ label: 'Static + functions', path: 'apps/ai-office/mini-app' }],
  ui: [{ label: 'Telegram bot', path: '@AI_Growth_Office_Bot/app' }],
  notes:
    'Сейчас под зонтом ai-office, не отдельное приложение. Модулем = шаблон Telegram Mini App + npm @ai-office/mini-app-template с встроенным AI-чатом.',
}

export default miniApp
