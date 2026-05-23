import type { ModuleEntry } from '../_types'

const aiHub: ModuleEntry = {
  slug: 'ai-hub',
  name: 'AI Creative Hub',
  tagline:
    'SaaS-агрегатор нейросетевых инструментов с токен-кошельком, BullMQ-очередями и провайдерами (Replicate / ElevenLabs / OpenAI).',
  status: 'dev',
  baseUrl: 'https://aihub-app.46-62-215-11.nip.io',
  docsPath: 'apps/ai-hub/CLAUDE.md',
  capabilities: [
    'Wallet через SECURITY DEFINER функции Postgres',
    'Провайдер-абстракция: Replicate / ElevenLabs / OpenAI / другие',
    'Очередь генераций через BullMQ',
    'Auth.js + Telegram Mini App @aicex_one_bot',
  ],
  backend: [
    { label: 'Wallet RPC', path: 'apps/ai-hub/src/server/wallet' },
    { label: 'Providers', path: 'apps/ai-hub/src/server/providers' },
    { label: 'Worker (BullMQ)', path: 'apps/ai-hub/src/worker' },
  ],
  ui: [
    { label: 'Web app', path: 'aihub-app.46-62-215-11.nip.io' },
    { label: 'Marketing', path: 'aihub.46-62-215-11.nip.io' },
    { label: 'TMA', path: '@aicex_one_bot' },
  ],
  notes:
    'Сам по себе SaaS, а не embed. Модулем стать может через wallet-API: «подключите свой токен-кошелёк к нашему AI Hub», Bearer-auth, npm @ai-hub/sdk.',
}

export default aiHub
