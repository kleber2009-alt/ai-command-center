import Link from 'next/link'

export default function MeTabs({ active }: { active: 'chat' | 'profile' | 'library' | 'search' }) {
  const tabs = [
    { id: 'chat', href: '/me', label: 'Чат' },
    { id: 'search', href: '/me/search', label: 'Поиск' },
    { id: 'profile', href: '/me/profile', label: 'Профиль' },
    { id: 'library', href: '/me/library', label: 'База' },
  ] as const
  return (
    <nav className="inline-flex rounded-full bg-apple-bg-soft p-0.5">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
            active === t.id ? 'bg-white text-apple-ink shadow-apple-sm' : 'text-apple-muted hover:text-apple-ink'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
