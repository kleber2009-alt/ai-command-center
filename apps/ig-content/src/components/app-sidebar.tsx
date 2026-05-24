'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Megaphone,
  BarChart3,
  Sparkles,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Кампании', icon: Megaphone },
  { href: '/analytics', label: 'Аналитика', icon: BarChart3 },
]

export function AppSidebar({ email }: { email: string | null }) {
  const pathname = usePathname()

  return (
    <aside className="flex w-60 flex-col border-r border-border bg-card/50 p-4">
      <div className="mb-8 flex items-center gap-2 px-2 text-primary">
        <Sparkles className="h-5 w-5" />
        <span className="font-semibold leading-tight">
          IG Serial
          <span className="block text-xs font-normal text-muted-foreground">
            Content OS
          </span>
        </span>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border pt-4">
        <p className="truncate px-3 pb-2 text-xs text-muted-foreground" title={email ?? ''}>
          {email ?? 'Гость'}
        </p>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
        </form>
      </div>
    </aside>
  )
}
