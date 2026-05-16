'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, Sparkles, Languages, LayoutGrid, Video, Shuffle, Send } from 'lucide-react'

type TabKey = 'view' | 'summary' | 'translate' | 'carousel' | 'reels-new' | 'reels-remix' | 'tg-post'

const TABS: Array<{ key: TabKey; label: string; path: string; Icon: any; color: string }> = [
  { key: 'view',        label: 'Транскрипт', path: '',             Icon: FileText,   color: 'text-slate-300' },
  { key: 'summary',     label: 'Саммари',    path: '/summary',     Icon: Sparkles,   color: 'text-violet-300' },
  { key: 'translate',   label: 'Перевод',    path: '/translate',   Icon: Languages,  color: 'text-emerald-300' },
  { key: 'carousel',    label: 'Карусель',   path: '/carousel',    Icon: LayoutGrid, color: 'text-cyan-300' },
  { key: 'reels-new',   label: 'Рилс',       path: '/reels-new',   Icon: Video,      color: 'text-fuchsia-300' },
  { key: 'reels-remix', label: 'Ремикс',     path: '/reels-remix', Icon: Shuffle,    color: 'text-pink-300' },
  { key: 'tg-post',     label: 'TG-пост',    path: '/tg-post',     Icon: Send,       color: 'text-sky-300' },
]

export default function TranscriptTabs({ id }: { id: string }) {
  const pathname = usePathname() || ''
  const base = `/t/${id}`
  return (
    <div className="-mx-3 sm:mx-0 overflow-x-auto">
      <div className="px-3 sm:px-0 flex gap-1.5 min-w-max">
        {TABS.map(({ key, label, path, Icon, color }) => {
          const href = base + path
          const active = pathname === href
          return (
            <Link
              key={key}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border whitespace-nowrap transition-all ${
                active
                  ? `bg-slate-800/80 border-slate-700 ${color}`
                  : 'bg-transparent border-slate-800/60 text-slate-500 hover:text-slate-300 hover:border-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
