'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AudioLines, Bot, BookOpen, Brain, History, Menu, MessageSquare,
  Sparkles, User, X,
} from 'lucide-react'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  match?: (pathname: string) => boolean
}

const PRIMARY: NavItem[] = [
  { href: '/transcribe', label: 'Транскрибация', icon: AudioLines },
  { href: '/me', label: 'Я', icon: Brain, match: (p) => p === '/me' },
  { href: '/me/profile', label: 'Профиль', icon: User },
  { href: '/me/library', label: 'База знаний', icon: BookOpen },
  { href: '/assistants', label: 'Ассистенты', icon: Bot },
]

const QUICK: NavItem[] = [
  { href: '/transcribe', label: 'История транскриптов', icon: History },
  { href: '/me', label: 'Чат', icon: MessageSquare, match: (p) => p === '/me' },
  { href: '/assistants', label: 'Все ассистенты', icon: Sparkles },
]

function isActive(item: NavItem, pathname: string): boolean {
  if (item.match) return item.match(pathname)
  if (item.href === '/') return pathname === '/'
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

export default function NavDrawer() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() || '/'

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  if (pathname.startsWith('/admin')) return null

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Открыть меню"
        className="fixed left-3 top-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full border border-apple-line bg-white/90 text-apple-ink shadow-apple-sm backdrop-blur transition-colors hover:bg-apple-bg-soft sm:left-4 sm:top-4"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!open}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Меню"
        className={`fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-[320px] flex-col border-r border-apple-line bg-white shadow-apple-lg transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-apple-line px-5 py-4">
          <span className="text-[13px] font-semibold uppercase tracking-wider text-apple-faint">
            Меню
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Закрыть меню"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-apple-muted transition-colors hover:bg-apple-bg-soft hover:text-apple-ink"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {PRIMARY.map((item) => {
              const Icon = item.icon
              const active = isActive(item, pathname)
              return (
                <li key={`primary-${item.href}-${item.label}`}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${
                      active
                        ? 'bg-apple-bg-soft text-apple-ink'
                        : 'text-apple-ink hover:bg-apple-bg-soft'
                    }`}
                  >
                    <Icon className={`h-[18px] w-[18px] ${active ? 'text-apple-blue' : 'text-apple-muted'}`} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>

          <div className="mt-6 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-apple-faint">
            Быстрые ссылки
          </div>
          <ul className="space-y-1">
            {QUICK.map((item) => {
              const Icon = item.icon
              return (
                <li key={`quick-${item.href}-${item.label}`}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-apple-muted transition-colors hover:bg-apple-bg-soft hover:text-apple-ink"
                  >
                    <Icon className="h-4 w-4 text-apple-faint" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>
    </>
  )
}
