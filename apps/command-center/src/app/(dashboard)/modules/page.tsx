'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Package, ArrowRight, ExternalLink, Boxes, Workflow } from 'lucide-react'
import { BUNDLES, BLOCKS, CATEGORIES, type BlockId, type Category } from '@/modules/bundles'
import { StatusBadge, FlowChips } from './bundle-ui'
import TechModules from './TechModules'

export default function ModulesPage() {
  const [tab, setTab] = useState<'bundles' | 'tech'>('bundles')
  const [cat, setCat] = useState<Category | ''>('')
  const [block, setBlock] = useState<BlockId | ''>('')

  const list = useMemo(
    () => BUNDLES.filter(b => (!cat || b.category === cat) && (!block || b.blocks.includes(block))),
    [cat, block],
  )
  const live = BUNDLES.filter(b => b.status === 'production').length
  const usage = (id: BlockId) => BUNDLES.filter(b => b.blocks.includes(id)).length

  return (
    <div className="animate-slide-in space-y-5">
      <header className="pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <Package className="w-5 h-5 text-indigo-400" />
          <h1 className="text-xl font-bold text-slate-100">Готовые модули</h1>
        </div>
        <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
          Готовые связки — рабочие решения «вход → результат», собранные из наших модулей: транскрибатор, сценарий,
          аватар HeyGen, монтаж, карусели, Telegram-карточки, офис агентов. У каждой — описание, шаги, где запустить
          и мини-презентация.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <TabBtn on={tab === 'bundles'} onClick={() => setTab('bundles')} icon={<Workflow className="w-3.5 h-3.5" />}>
            Связки · {BUNDLES.length} <span className="text-emerald-400/80 ml-1">({live} работают)</span>
          </TabBtn>
          <TabBtn on={tab === 'tech'} onClick={() => setTab('tech')} icon={<Boxes className="w-3.5 h-3.5" />}>
            Технические модули
          </TabBtn>
        </div>
      </header>

      {tab === 'tech' ? <TechModules /> : (
        <>
          <section className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Блоки, из которых собраны связки</h2>
              {block && <button onClick={() => setBlock('')} className="text-[11px] text-indigo-400 hover:text-indigo-300">сбросить</button>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {BLOCKS.map(bl => (
                <button key={bl.id} title={bl.what} onClick={() => setBlock(block === bl.id ? '' : bl.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${block === bl.id
                    ? 'bg-indigo-600/25 text-indigo-200 border-indigo-500/40'
                    : 'bg-slate-800/60 text-slate-300 border-slate-700/60 hover:border-slate-600'}`}>
                  {bl.name} <span className="text-slate-500 font-mono">{usage(bl.id)}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              {block ? BLOCKS.find(b => b.id === block)!.what : 'Нажмите на блок — останутся связки, где он работает. Цифра — в скольких связках.'}
            </p>
          </section>

          <div className="flex flex-wrap gap-2">
            <Chip on={cat === ''} onClick={() => setCat('')}>Все · {BUNDLES.length}</Chip>
            {CATEGORIES.map(c => (
              <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)} title={c.about}>
                {c.label} · {BUNDLES.filter(b => b.category === c.id).length}
              </Chip>
            ))}
          </div>

          {CATEGORIES.filter(c => list.some(b => b.category === c.id)).map(c => (
            <section key={c.id} className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-bold text-slate-100">{c.label}</h2>
                <span className="text-xs text-slate-500">{c.about}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {list.filter(b => b.category === c.id).map(b => {
                  const first = b.launch.find(l => l.url)
                  return (
                    <article key={b.slug} className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden hover:border-slate-600 transition-all flex flex-col">
                      <div className="p-5 flex-1 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-11 h-11 rounded-xl bg-slate-700/40 flex items-center justify-center text-2xl flex-shrink-0">{b.emoji}</div>
                          <div className="min-w-0 flex-1">
                            <Link href={`/modules/${b.slug}`} className="text-base font-bold text-slate-100 hover:text-indigo-300 leading-tight block">{b.name}</Link>
                            <div className="mt-1"><StatusBadge s={b.status} /></div>
                          </div>
                        </div>
                        <p className="text-sm text-slate-300 leading-snug">{b.pitch}</p>
                        <div className="text-xs space-y-1">
                          <div><span className="text-slate-500">Вход: </span><span className="text-slate-300">{b.input}</span></div>
                          <div><span className="text-slate-500">Выход: </span><span className="text-slate-300">{b.output}</span></div>
                        </div>
                        <FlowChips b={b} />
                      </div>
                      <div className="px-5 py-3 border-t border-slate-700/40 bg-slate-800/30 flex items-center gap-2">
                        <Link href={`/modules/${b.slug}`}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-indigo-600 border border-indigo-500 hover:bg-indigo-500 transition-all">
                          Демо и описание <ArrowRight className="w-3 h-3" />
                        </Link>
                        {first && (
                          <a href={first.url} target="_blank" rel="noopener noreferrer" title={first.label}
                            className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs text-slate-300 border border-slate-700/50 hover:border-slate-600 hover:bg-slate-700/20 transition-all">
                            Запустить <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
          {list.length === 0 && <div className="text-center py-12 text-sm text-slate-500">Нет связок с этим фильтром</div>}
        </>
      )}
    </div>
  )
}

function TabBtn({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${on
        ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
        : 'text-slate-400 border-slate-700/50 hover:border-slate-600 hover:text-slate-300'}`}>
      {icon}{children}
    </button>
  )
}

function Chip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className={`px-3 py-1.5 rounded-full text-xs transition-all border ${on
        ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
        : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:border-slate-600 hover:text-slate-300'}`}>
      {children}
    </button>
  )
}
