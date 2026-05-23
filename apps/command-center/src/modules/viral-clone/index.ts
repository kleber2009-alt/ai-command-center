import type { ModuleEntry } from '../_types'

const viralClone: ModuleEntry = {
  slug: 'viral-clone',
  name: 'Reels Cloner',
  tagline:
    'Клонирование вирусных Reels: парсер источника → реренеринг под бренд. Через Telegram /clone в @your_transscribe_bot.',
  status: 'production',
  baseUrl: 'https://t.me/your_transscribe_bot',
  docsPath: 'apps/infra-worker/handlers/viral_clone.js',
  capabilities: [
    'Скачивание исходника (yt-dlp companion)',
    'Парсинг текста, музыки, ритма',
    'Очередь job через infra-worker',
    'Доставка в Telegram',
  ],
  backend: [
    { label: 'Worker handler', path: 'apps/infra-worker/handlers/viral_clone.js' },
    { label: 'Sweep job', path: 'apps/infra-worker/handlers/viral_clone_sweep.js' },
  ],
  ui: [{ label: 'Telegram /clone', path: '@your_transscribe_bot' }],
  notes:
    'Сейчас живёт хэндлером внутри infra-worker, не как самостоятельное приложение. Модулем = выделить в apps/viral-clone + REST API + Bearer.',
}

export default viralClone
