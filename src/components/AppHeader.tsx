'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu, X, Mic, Brain, Bot, Sparkles,
  MessageSquare, User, BookOpen, Search, History,
} from 'lucide-react'

type LeafItem = { href: string; label: string; icon: typeof Menu }
type GroupItem = { label: string; icon: typeof Menu; children: LeafItem[] }
type Item = LeafItem | GroupItem

const ITEMS: Item[] = [
  { href: '/transcribe', label: 'Транскрибация', icon: Mic },
  {
    label: 'Я',
    icon: Brain,
    children: [
      { href: '/me', label: 'Чат', icon: MessageSquare },
      { href: '/me/profile', label: 'Профиль', icon: User },
      { href: '/me/library', label: 'База знаний', icon: BookOpen },
      { href: '/me/search', label: 'Поиск', icon: Search },
    ],
  },
  { href: '/assistants', label: 'Ассистенты', icon: Bot },
  { href: '/materials', label: 'Материалы', icon: Sparkles },
]

function getSectionTitle(pathname: string): string {
  if (pathname.startsWith('/me')) return 'Я'
  if (pathname.startsWith('/assistants')) return 'Ассистенты'
  if (pathname.startsWith('/materials')) return 'Материалы'
  return 'Транскрибация'
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/me') return pathname === '/me'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function AppHeader() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() || ''
  const title = getSectionTitle(pathname)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-apple-line bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between px-4 sm:px-6">
          <h1 className="text-[15px] font-semibold tracking-tight text-apple-ink">{title}</h1>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-full text-apple-ink transition-colors hover:bg-apple-bg-soft active:bg-apple-bg-soft"
            aria-label="Открыть меню"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-40 bg-black/25 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`fixed right-0 top-0 z-50 h-full w-[86%] max-w-xs bg-white shadow-2xl transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-label="Меню"
      >
        <div className="flex h-12 items-center justify-between border-b border-apple-line px-4">
          <span className="text-[15px] font-semibold text-apple-ink">Меню</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-full text-apple-ink transition-colors hover:bg-apple-bg-soft"
            aria-label="Закрыть меню"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="overflow-y-auto p-3 pb-8">
          {ITEMS.map((item, i) => {
            if ('children' in item) {
              const GroupIcon = item.icon
              return (
                <div key={i} className="mt-3 first:mt-0">
                  <div className="flex items-center gap-2.5 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-apple-faint">
                    <GroupIcon className="h-3.5 w-3.5" />
                    {item.label}
                  </div>
                  {item.children.map((c) => {
                    const Icon = c.icon
                    const active = isActive(pathname, c.href)
                    return (
                      <Link
                        key={c.href}
                        href={c.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors ${
                          active
                            ? 'bg-apple-bg-soft text-apple-ink'
                            : 'text-apple-muted hover:bg-apple-bg-soft hover:text-apple-ink'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {c.label}
                      </Link>
                    )
                  })}
                </div>
              )
            }
            const Icon = item.icon
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-semibold transition-colors first:mt-0 ${
                  active
                    ? 'bg-apple-bg-soft text-apple-ink'
                    : 'text-apple-ink hover:bg-apple-bg-soft'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}

          <div className="my-4 border-t border-apple-line" />

          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-apple-faint">
            Быстрые ссылки
          </div>
          <Link
            href="/transcribe#history"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-apple-muted transition-colors hover:bg-apple-bg-soft hover:text-apple-ink"
          >
            <History className="h-4 w-4" />
            История транскриптов
          </Link>
          <Link
            href="/me"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-apple-muted transition-colors hover:bg-apple-bg-soft hover:text-apple-ink"
          >
            <MessageSquare className="h-4 w-4" />
            История чатов
          </Link>
          <Link
            href="/materials"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-apple-muted transition-colors hover:bg-apple-bg-soft hover:text-apple-ink"
          >
            <Sparkles className="h-4 w-4" />
            Сгенерированные материалы
          </Link>
        </nav>
      </aside>
    </>
  )
}
