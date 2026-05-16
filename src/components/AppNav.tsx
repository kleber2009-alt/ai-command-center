'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AudioLines, History } from 'lucide-react'

const ITEMS = [
  { href: '/transcribe', label: 'Транскрибация', Icon: AudioLines },
  { href: '/history',    label: 'История',      Icon: History },
] as const

export default function AppNav() {
  const pathname = usePathname() || ''
  return (
    <nav className="sticky top-0 z-20 bg-slate-950/85 backdrop-blur border-b border-slate-800/60">
      <div className="mx-auto w-full max-w-2xl px-3 sm:px-5">
        <div className="flex items-center gap-1 h-12">
          {ITEMS.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium border transition-all ${
                  active
                    ? 'bg-indigo-600/15 text-indigo-300 border-indigo-500/30'
                    : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
