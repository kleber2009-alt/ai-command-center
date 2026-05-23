'use client'

import { Package, ExternalLink, Copy, Check, FileCode, KeyRound, Database, Layers, Info } from 'lucide-react'
import { useState } from 'react'
import { MODULES, type ModuleEntry } from '@/modules'

const STATUS_STYLE: Record<ModuleEntry['status'], { bg: string; text: string; label: string }> = {
  production: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Production' },
  beta:       { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  label: 'Beta' },
  dev:        { bg: 'bg-amber-500/10',   text: 'text-amber-400',   label: 'Dev' },
  planned:    { bg: 'bg-slate-500/10',   text: 'text-slate-400',   label: 'Planned' },
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
            Каталог продуктов экосистемы. Каждый модуль — отдельная папка в{' '}
            <code className="text-indigo-400 font-mono">apps/command-center/src/modules/</code>.
            Production / Beta / Dev — рабочие приложения; Planned — есть, но ещё не упакованы
            как embed-модуль с REST API + Bearer-auth + TypeScript SDK.
          </p>
        </div>
        <div className="text-xs text-slate-500 font-mono whitespace-nowrap">{MODULES.length} модул(ей)</div>
      </header>

      {MODULES.map((m) => {
        const status = STATUS_STYLE[m.status]
        const hasSdk = !!m.packageName && !!m.sdkMethods?.length
        return (
          <article
            key={m.slug}
            className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
          >
            <header className="flex items-start justify-between gap-4 p-5 border-b border-slate-800">
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h2 className="text-xl font-bold text-white">{m.name}</h2>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${status.bg} ${status.text}`}>
                    {status.label}
                  </span>
                  {m.version && <span className="text-xs text-slate-500 font-mono">v{m.version}</span>}
                  <span className="text-[10px] text-slate-600 font-mono">{m.slug}</span>
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
              {hasSdk ? (
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
                    {m.quickstart && (
                      <>
                        <pre className="text-[11px] text-slate-300 font-mono bg-slate-950 border border-slate-800 p-3 rounded overflow-x-auto leading-relaxed">
{m.quickstart}
                        </pre>
                        <button
                          onClick={() => copy(m.quickstart!, `code-${m.slug}`)}
                          className="text-[11px] text-slate-400 hover:text-indigo-400 flex items-center gap-1"
                        >
                          {copied === `code-${m.slug}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copied === `code-${m.slug}` ? 'copied' : 'copy code'}
                        </button>
                      </>
                    )}
                  </div>
                </section>
              ) : (
                <section className="bg-slate-900 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-slate-500" />
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Статус интеграции</h3>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {m.notes ??
                      'Приложение работает, но ещё не упаковано как самостоятельный embed-модуль (REST API + Bearer-auth + npm SDK + UI для ApiKey).'}
                  </p>
                </section>
              )}

              {m.capabilities?.length ? (
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
              ) : null}

              {m.backend?.length ? (
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
              ) : null}

              {m.sdkMethods?.length ? (
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
              ) : null}

              {m.ui?.length ? (
                <section className="bg-slate-900 p-5 lg:col-span-2">
                  <div className="flex items-center gap-2 mb-3">
                    <KeyRound className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">UI / точки входа</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {m.ui.map((u) => (
                      <li key={u.path} className="text-xs flex items-baseline gap-2">
                        <span className="text-slate-300 flex-shrink-0">{u.label}</span>
                        <span className="text-slate-600 font-mono truncate" title={u.path}>{u.path}</span>
                      </li>
                    ))}
                  </ul>
                  {hasSdk && (
                    <div className="mt-4 p-3 bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-400 leading-relaxed">
                      <strong className="text-slate-300">Auth flow:</strong>{' '}
                      все публичные endpoints принимают либо session-cookie (web-юзер), либо{' '}
                      <code className="text-indigo-400 font-mono">Authorization: Bearer ps_&lt;key&gt;</code>{' '}
                      (внешняя интеграция). Plaintext возвращается ровно один раз при создании. Хранится sha256-хеш + 8-символьный префикс для UI.
                    </div>
                  )}
                </section>
              ) : null}
            </div>

            <footer className="px-5 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500 gap-4 flex-wrap">
              <span className="font-mono truncate">{m.docsPath ?? `apps/command-center/src/modules/${m.slug}/`}</span>
              {hasSdk ? (
                <a
                  href={`${m.baseUrl}/settings/keys`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 whitespace-nowrap"
                >
                  Manage API keys <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-slate-600 font-mono whitespace-nowrap">apps/command-center/src/modules/{m.slug}/</span>
              )}
            </footer>
          </article>
        )
      })}
    </div>
  )
}
