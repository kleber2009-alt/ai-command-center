import type { ModuleEntry } from '../_types'

const igAgent: ModuleEntry = {
  slug: 'ig-agent',
  name: 'ig-agent',
  tagline:
    'Instagram DM agent: SendPulse webhook → Claude classifier → responder → owner alerts через общий @newnewnnn_bot. Кабинет magic-link на ig.46-62-215-11.nip.io.',
  status: 'production',
  baseUrl: 'https://ig.46-62-215-11.nip.io',
  docsPath: 'apps/ig-agent/CLAUDE.md',
  capabilities: [
    'SendPulse webhook → contacts/conversations/messages в shared aisales-postgres',
    'Classifier на Claude Haiku 4.5 с prompt caching',
    'Responder в тоне владельца через SendPulse REST',
    'Magic-link админ-SPA (fork ai-sales dashboard-prototype)',
    'Owner alerts через общий @newnewnnn_bot (tg-agent inbox)',
    'DigestScheduler 03:00 UTC + 🧠 Сводки в админке',
  ],
  backend: [
    { label: 'Webhook POST /webhook/sendpulse', path: 'apps/ig-agent/src/pipeline.ts' },
    { label: 'SendPulse client (OAuth + send + get)', path: 'apps/ig-agent/src/sendpulse/client.ts' },
    { label: 'Admin server :8081 (Hono)', path: 'apps/ig-agent/src/admin/server.ts' },
    { label: 'Migrations 0001_init / ig_digests', path: 'apps/ig-agent/src/db/migrations/' },
    { label: 'Magic-link auth', path: 'apps/ig-agent/src/admin/auth.ts' },
    { label: 'DigestScheduler', path: 'apps/ig-agent/src/scheduler/digest.ts' },
  ],
  ui: [
    { label: 'Admin (magic-link)', path: 'ig.46-62-215-11.nip.io' },
    { label: 'Notifier — @newnewnnn_bot (shared с tg-agent)', path: 't.me/newnewnnn_bot' },
  ],
  notes:
    'Архитектура — копия tg-agent с тремя заменами: транспорт (SendPulse webhook), исходящие (SendPulse REST), хранилище (Postgres). Owner-нотификации шерят бот с tg-agent — один общий inbox. Подключён в cross-source /memory tg-agent для общего семантического поиска.',
}

export default igAgent
