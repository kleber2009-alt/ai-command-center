import type { ModuleEntry } from '../_types'

const personaStudio: ModuleEntry = {
  slug: 'persona-studio',
  name: 'Persona Studio',
  tagline:
    '1 фото → 10 AI-аватаров → talking-photo видео (HeyGen V) или обложка карусели. Модуль для интеграции в любой проект через REST API + TypeScript SDK.',
  status: 'beta',
  packageName: '@persona-studio/sdk',
  version: '0.1.0',
  baseUrl: 'https://persona-app.46-62-215-11.nip.io',
  docsPath: 'apps/persona-studio/sdk/README.md',
  capabilities: [
    'Аватары: 10 стилей из одной фотографии',
    'Видео: talking-photo через HeyGen V (фотореалистичная мимика)',
    'Обложки: карусель для соцсетей из выбранного аватара',
    'Биллинг: токены + transactional refund на failure',
    'Auth: session OR Bearer ps_<key> на одних и тех же endpoints',
  ],
  backend: [
    { label: 'Prisma: модель ApiKey', path: 'apps/persona-studio/prisma/schema.prisma' },
    { label: 'Helper getCurrentUserOrApiKey()', path: 'apps/persona-studio/src/lib/auth.ts' },
    { label: 'POST/GET /api/keys', path: 'apps/persona-studio/src/app/api/keys/route.ts' },
    { label: 'DELETE /api/keys/:id', path: 'apps/persona-studio/src/app/api/keys/[id]/route.ts' },
    { label: '/api/videos', path: 'apps/persona-studio/src/app/api/videos/route.ts' },
    { label: '/api/avatars', path: 'apps/persona-studio/src/app/api/avatars/route.ts' },
    { label: '/api/upload', path: 'apps/persona-studio/src/app/api/upload/route.ts' },
    { label: '/api/generate-avatars', path: 'apps/persona-studio/src/app/api/generate-avatars/route.ts' },
    { label: '/api/generate-cover', path: 'apps/persona-studio/src/app/api/generate-cover/route.ts' },
    { label: '/api/covers', path: 'apps/persona-studio/src/app/api/covers/route.ts' },
    { label: '/api/billing/balance', path: 'apps/persona-studio/src/app/api/billing/balance/route.ts' },
  ],
  sdkMethods: [
    { name: 'uploadPhoto(file)', description: 'POST /api/upload → upload id' },
    { name: 'generateAvatars({ uploadId })', description: 'POST /api/generate-avatars (списывает 10 токенов)' },
    { name: 'getAvatarGeneration(id)', description: 'GET /api/generate-avatars?id — статус batch' },
    { name: 'listAvatars()', description: 'GET /api/avatars' },
    { name: 'selectAvatar(id)', description: 'POST /api/avatars/:id/select' },
    { name: 'createVideo({...})', description: 'POST /api/videos (HeyGen V, 30 токенов)' },
    { name: 'getVideo(id) / listVideos()', description: 'GET /api/videos' },
    { name: 'createCover({...}) / getCover(id) / listCovers()', description: '/api/generate-cover, /api/covers' },
    { name: 'getBalance()', description: 'GET /api/billing/balance' },
    { name: 'waitFor(poll, opts?)', description: 'Polling helper до completed/failed' },
  ],
  ui: [
    { label: 'Страница управления ключами', path: '/settings/keys' },
    { label: 'API keys manager component', path: 'apps/persona-studio/src/components/api-keys-manager.tsx' },
    { label: 'TopNav пункт «API keys»', path: 'apps/persona-studio/src/components/nav.tsx' },
  ],
  quickstart: `import { createPersonaClient } from '@persona-studio/sdk';

const ps = createPersonaClient({
  baseUrl: 'https://persona-app.46-62-215-11.nip.io',
  apiKey:  process.env.PERSONA_API_KEY!,
});

const upload = await ps.uploadPhoto({ name: 'me.jpg', data: buf, type: 'image/jpeg' });
const job    = await ps.generateAvatars({ uploadId: upload.id });
const gen    = await ps.waitFor(() => ps.getAvatarGeneration(job.id));
const best   = gen.avatars.find(a => a.status === 'done')!;
const video  = await ps.createVideo({
  avatarId: best.id,
  script:   'Привет!',
  voiceId:  'ru-male-1',
});`,
}

export default personaStudio
