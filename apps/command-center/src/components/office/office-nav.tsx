'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/office', label: 'Обзор' },
  { href: '/office/hq', label: 'Штаб' },
  { href: '/office/agents', label: 'Агенты' },
  { href: '/office/decisions', label: 'Решения' },
  { href: '/office/memory', label: 'Память' },
  { href: '/office/model', label: 'Модель' },
]

export function OfficeNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
              active
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:border-slate-600 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
