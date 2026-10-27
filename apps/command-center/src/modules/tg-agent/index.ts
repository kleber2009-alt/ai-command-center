import type { ModuleEntry } from '../_types'

const tgAgent: ModuleEntry = {
  slug: 'tg-agent',
  name: 'tg-agent',
  tagline:
    'Telegram-агент для групп: классификатор сообщений + decision engine + автогенерация ответов + CRM. Production в @newnewnnn_bot.',
  status: 'production',
  baseUrl: 'https://tg.aicex.club',
  docsPath: 'apps/tg-agent/CLAUDE.md',
  capabilities: [
    'Pipeline: ingest → classify → decide → respond',
    'Claude Haiku 4.5 для классификатора и респондера',
    'CRM-таблица контактов и историй диалогов',
    'Admin-панель tg.aicex.club',
  ],
  backend: [
    { label: 'Classifier', path: 'apps/tg-agent/src/classifier' },
    { label: 'Decision engine', path: 'apps/tg-agent/src/decision' },
    { label: 'Responder', path: 'apps/tg-agent/src/responder' },
    { label: 'CRM', path: 'apps/tg-agent/src/crm' },
  ],
  ui: [
    { label: 'Admin panel', path: 'tg.aicex.club' },
    { label: 'Telegram bot', path: '@newnewnnn_bot' },
  ],
  notes:
    'Production-сервис, но не SDK: интегрируется через подключение бота, не через npm-пакет. Embed-модуль = REST API для «привяжи свой канал» + Bearer-auth.',
}

export default tgAgent
