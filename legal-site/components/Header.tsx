'use client'

import { useState } from 'react'
import { Scale, Menu, X, Phone } from 'lucide-react'

const NAV = [
  { href: '#services', label: 'Услуги' },
  { href: '#about', label: 'О фирме' },
  { href: '#contact', label: 'Контакты' },
]

export default function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-ink-200/70 bg-ink-50/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <a href="#top" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-ink-900 text-gold-400">
            <Scale className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <span className="font-serif text-xl font-semibold tracking-wide text-ink-900">
            Lex<span className="text-gold-500">&nbsp;·&nbsp;</span>Partners
          </span>
        </a>

        <nav className="hidden items-center gap-10 md:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="text-sm font-medium text-ink-900/70 transition-colors hover:text-gold-600"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-5 md:flex">
          <a
            href="tel:+74951234567"
            className="flex items-center gap-2 text-sm font-medium text-ink-900 hover:text-gold-600"
          >
            <Phone className="h-4 w-4" />
            +7 (495) 123-45-67
          </a>
          <a
            href="#contact"
            className="rounded-sm bg-ink-900 px-5 py-2.5 text-sm font-medium text-ink-50 transition-colors hover:bg-ink-950"
          >
            Консультация
          </a>
        </div>

        <button
          aria-label="Меню"
          onClick={() => setOpen((v) => !v)}
          className="rounded-sm border border-ink-200 p-2 text-ink-900 md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-ink-200 bg-ink-50 md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-4">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="rounded-sm px-3 py-3 text-sm text-ink-900 hover:bg-ink-100"
              >
                {n.label}
              </a>
            ))}
            <a
              href="#contact"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-sm bg-ink-900 px-5 py-3 text-center text-sm font-medium text-ink-50"
            >
              Бесплатная консультация
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
