'use client'

import { Package, ExternalLink, Copy, Check, FileCode, KeyRound, Database, Layers } from 'lucide-react'
import { useState } from 'react'

type ModuleEntry = {
  slug: string
  name: string
  tagline: string
  status: 'production' | 'beta' | 'dev'
  packageName: string
  version: string
  baseUrl: string
  docsPath: string
  capabilities: string[]
  backend: { label: string; path: string }[]
  sdkMethods: { name: string; description: string }[]
  ui: { label: string; path: string }[]
  quickstart: string
}

const MODULES: ModuleEntry[] = [
  {
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
  },
]

const STATUS_STYLE: Record<ModuleEntry['status'], { bg: string; text: string; label: string }> = {
  production: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Production' },
  beta:       { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  label: 'Beta' },
  dev:        { bg: 'bg-amber-500/10',   text: 'text-amber-400',   label: 'Dev' },
}

export default function ModulesPage() {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-6 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-5 h-5 text-indigo-400" />
            <h1 className="text-2xl font-bold text-white">Готовые модули</h1>
          </div>
          <p className="text-sm text-slate-400 max-w-2xl">
            Самодостаточные модули, готовые к встраиванию в любой проект. У каждого — REST API +
            TypeScript SDK + UI для управления API-ключами. Заходишь в инстанс, выпускаешь ключ,
            ставишь npm-пакет — интеграция готова.
          </p>
        </div>
        <div className="text-xs text-slate-500 font-mono">{MODULES.length} модул(ей)</div>
      </header>

      {MODULES.map((m) => {
        const status = STATUS_STYLE[m.status]
        return (
          <article
            key={m.slug}
            className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
          >
            <header className="flex items-start justify-between gap-4 p-5 border-b border-slate-800">
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-bold text-white">{m.name}</h2>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${status.bg} ${status.text}`}>
                    {status.label}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">v{m.version}</span>
                </div>
                <p className="text-sm text-slate-400 max-w-3xl">{m.tagline}</p>
              </div>
              <a
                href={m.baseUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 whitespace-nowrap"
              >
                Open app <ExternalLink className="w-3 h-3" />
              </a>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-slate-800">
              {/* Install + quickstart */}
              <section className="bg-slate-900 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <FileCode className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Install + quickstart</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs text-emerald-400 font-mono bg-slate-950 border border-slate-800 px-3 py-2 rounded truncate">
                      npm i {m.packageName}
                    </code>
                    <button
                      onClick={() => copy(`npm i ${m.packageName}`, `install-${m.slug}`)}
                      className="p-2 text-slate-400 hover:text-white bg-slate-950 border border-slate-800 rounded"
                      title="Copy"
                    >
                      {copied === `install-${m.slug}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <pre className="text-[11px] text-slate-300 font-mono bg-slate-950 border border-slate-800 p-3 rounded overflow-x-auto leading-relaxed">
{m.quickstart}
                  </pre>
                  <button
                    onClick={() => copy(m.quickstart, `code-${m.slug}`)}
                    className="text-[11px] text-slate-400 hover:text-indigo-400 flex items-center gap-1"
                  >
                    {copied === `code-${m.slug}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === `code-${m.slug}` ? 'copied' : 'copy code'}
                  </button>
                </div>
              </section>

              {/* Capabilities */}
              <section className="bg-slate-900 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Возможности</h3>
                </div>
                <ul className="space-y-2">
                  {m.capabilities.map((c) => (
                    <li key={c} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-indigo-400 mt-1.5 w-1 h-1 rounded-full bg-indigo-400 flex-shrink-0" />
                      {c}
                    </li>
                  ))}
                </ul>
              </section>

              {/* Backend */}
              <section className="bg-slate-900 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Database className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Backend</h3>
                </div>
                <ul className="space-y-1.5">
                  {m.backend.map((b) => (
                    <li key={b.path} className="text-xs flex items-baseline gap-2">
                      <span className="text-slate-300 flex-shrink-0">{b.label}</span>
                      <span className="text-slate-600 font-mono truncate" title={b.path}>{b.path}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* SDK methods */}
              <section className="bg-slate-900 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <FileCode className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">SDK · {m.sdkMethods.length} методов</h3>
                </div>
                <ul className="space-y-1.5">
                  {m.sdkMethods.map((s) => (
                    <li key={s.name} className="text-xs grid grid-cols-[auto_1fr] gap-2">
                      <code className="text-indigo-400 font-mono whitespace-nowrap">{s.name}</code>
                      <span className="text-slate-500 truncate" title={s.description}>{s.description}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* UI / Auth */}
              <section className="bg-slate-900 p-5 lg:col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <KeyRound className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">UI · авторизация и управление ключами</h3>
                </div>
                <ul className="space-y-1.5">
                  {m.ui.map((u) => (
                    <li key={u.path} className="text-xs flex items-baseline gap-2">
                      <span className="text-slate-300 flex-shrink-0">{u.label}</span>
                      <span className="text-slate-600 font-mono truncate" title={u.path}>{u.path}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 p-3 bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-400 leading-relaxed">
                  <strong className="text-slate-300">Auth flow:</strong>{' '}
                  все публичные endpoints принимают либо session-cookie (web-юзер), либо{' '}
                  <code className="text-indigo-400 font-mono">Authorization: Bearer ps_&lt;key&gt;</code>{' '}
                  (внешняя интеграция). Plaintext возвращается ровно один раз при создании. Хранится sha256-хеш + 8-символьный префикс для UI.
                </div>
              </section>
            </div>

            <footer className="px-5 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span className="font-mono">{m.docsPath}</span>
              <a
                href={`${m.baseUrl}/settings/keys`}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                Manage API keys <ExternalLink className="w-3 h-3" />
              </a>
            </footer>
          </article>
        )
      })}
    </div>
  )
}
