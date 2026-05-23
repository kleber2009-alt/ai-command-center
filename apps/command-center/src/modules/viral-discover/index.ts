import type { ModuleEntry } from '../_types'

const viralDiscover: ModuleEntry = {
  slug: 'viral-discover',
  name: 'Залётный / Viral Discover',
  tagline:
    'Парсер вирусных рилз по нишам, доставка лучших в Telegram. Кабинет landings/viral-discover/cabinet/.',
  status: 'production',
  baseUrl: 'https://parser.46-62-215-11.nip.io',
  docsPath: 'apps/infra-worker/handlers/viral_discover.js',
  capabilities: [
    'Поиск вирусных reels по тегам/нишам',
    'Cabinet UI с фильтрами',
    'Доставка в @parser_instaa_bot',
    'parser_bot.js lib для shared логики',
  ],
  backend: [
    { label: 'Discover handler', path: 'apps/infra-worker/handlers/viral_discover.js' },
    { label: 'parser_bot lib', path: 'apps/infra-worker/lib/parser_bot.js' },
  ],
  ui: [
    { label: 'Cabinet', path: 'landings/viral-discover/cabinet/' },
    { label: 'Telegram', path: '@parser_instaa_bot' },
  ],
  notes:
    'Production-инструмент, milestone 6/6. Embed-модуль = публичный REST для запуска поиска и подписки на batch-результаты + Bearer-auth.',
}

export default viralDiscover
