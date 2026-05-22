'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Zap, Wallet, Bot, Package } from 'lucide-react'

const nav = [
  { href: '/dashboard', icon: LayoutGrid, label: 'Проекты' },
  { href: '/balances',  icon: Wallet,     label: 'Балансы' },
  { href: '/bots',      icon: Bot,        label: 'Боты' },
  { href: '/modules',   icon: Package,    label: 'Готовые модули' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <div className="flex min-h-screen bg-slate-950">
      <aside className="fixed left-0 top-0 h-screen w-56 bg-slate-900 border-r border-slate-800 flex flex-col z-40">
        <div className="px-4 py-5 border-b border-slate-800">
          <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80">
            <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-xs font-bold text-white tracking-wider uppercase leading-tight">Command Center</div>
              <div className="text-[10px] text-slate-500 leading-tight">project hub</div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ href, icon: Icon, label }) => {
            const active =
              path === href ||
              (href === '/dashboard' && path.startsWith('/projects'))
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  active
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="px-4 py-4 border-t border-slate-800">
          <div className="text-[10px] text-slate-600 leading-relaxed">
            <div className="text-slate-500 font-medium mb-0.5">Hetzner / aisales-prod</div>
            self-hosted
          </div>
        </div>
      </aside>
      <main className="flex-1 ml-56 min-h-screen overflow-x-hidden">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  )
}
