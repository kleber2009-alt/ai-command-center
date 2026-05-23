import type { ModuleEntry } from '../_types'

const transcribe: ModuleEntry = {
  slug: 'transcribe',
  name: 'Транскрибация',
  tagline:
    'Аудио/видео → текст + AI-суммаризация, перевод, рерайт. Telegram Mini App + веб-кабинет. Flagship-продукт.',
  status: 'production',
  baseUrl: 'https://transcribe.46-62-215-11.nip.io',
  docsPath: 'apps/transcribe/CLAUDE.md',
  capabilities: [
    'Транскрибация аудио/видео (multilingual)',
    'AI-функции: summarize / translate / generate (Claude Haiku 4.5)',
    'Чат с ассистентами /me и /assistants (Claude Sonnet 4.6)',
    'Telegram Mini App: tma.46-62-215-11.nip.io',
    'Админ-кабинет /admin',
  ],
  backend: [
    { label: '/api/transcribe', path: 'apps/transcribe/src/app/api/transcribe' },
    { label: '/api/me/chat', path: 'apps/transcribe/src/app/api/me/chat' },
    { label: '/api/assistants/chat', path: 'apps/transcribe/src/app/api/assistants/chat' },
  ],
  ui: [
    { label: 'Web UI', path: 'transcribe.46-62-215-11.nip.io' },
    { label: 'Telegram Mini App', path: 'tma.46-62-215-11.nip.io' },
    { label: 'Admin panel', path: '/admin' },
  ],
  notes:
    'Production-продукт, но как embed-модуль ещё не упакован: нет публичного REST с Bearer-auth, нет npm SDK, нет UI для ApiKey. Следующий кандидат на полную SDK-обёртку.',
}

export default transcribe
