'use client'

export function Nav() {
  const links = [
    { href: '#how', label: 'Как это работает' },
    { href: '#included', label: 'Что входит' },
    { href: '#pricing', label: 'Цены' },
    { href: '#faq', label: 'FAQ' },
  ]
  return (
    <header className="sticky top-0 z-50 bg-ink/90 backdrop-blur border-b border-bone/10">
      <nav className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <a href="#top" className="font-mono text-sm tracking-[0.2em] text-bone">
          AI OFFICE
        </a>
        <ul className="hidden md:flex items-center gap-10 font-mono text-[11px] tracking-[0.18em] uppercase text-bone/70">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="hover:text-lime transition-colors">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <a
          href="#pricing"
          className="font-mono text-[11px] tracking-[0.18em] uppercase border border-bone/30 px-4 py-2 hover:border-lime hover:text-lime transition-colors"
        >
          Начать
        </a>
      </nav>
    </header>
  )
}
