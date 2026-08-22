'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LayoutGrid, Zap, Wallet, Bot, Package, Menu, X, Building2 } from 'lucide-react'

const nav = [
  { href: '/office',    icon: Building2,   label: 'Офис' },
  { href: '/dashboard', icon: LayoutGrid, label: 'Проекты' },
  { href: '/balances',  icon: Wallet,     label: 'Балансы' },
  { href: '/bots',      icon: Bot,        label: 'Боты' },
  { href: '/modules',   icon: Package,    label: 'Готовые модули' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)

  // Close the mobile drawer whenever navigation occurs.
  useEffect(() => { setOpen(false) }, [path])

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Mobile top bar — hamburger + branding, hidden on desktop */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 z-30 flex items-center gap-3 px-4 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <button
          onClick={() => setOpen(true)}
          aria-label="Открыть меню"
          className="p-1.5 -ml-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-all">
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80">
          <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-xs font-bold text-white tracking-wider uppercase leading-tight">Command Center</div>
            <div className="text-[10px] text-slate-500 leading-tight">project hub</div>
          </div>
        </Link>
      </header>

      {/* Backdrop behind the drawer on mobile */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
      )}

      {/* Sidebar — fixed on desktop, slide-out drawer on mobile */}
      <aside
        className={`fixed left-0 top-0 h-screen w-64 lg:w-56 bg-slate-900 border-r border-slate-800 flex flex-col z-50 transition-transform duration-300 ease-out lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}>
        <div className="px-4 py-5 border-b border-slate-800 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80">
            <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-xs font-bold text-white tracking-wider uppercase leading-tight">Command Center</div>
              <div className="text-[10px] text-slate-500 leading-tight">project hub</div>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Закрыть меню"
            className="lg:hidden p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ href, icon: Icon, label }) => {
            const active =
              path === href ||
              (href === '/dashboard' && path.startsWith('/projects')) ||
              (href === '/office' && path.startsWith('/office'))
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

      <main className="flex-1 lg:ml-56 min-h-screen overflow-x-hidden pt-14 lg:pt-0">
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  )
}
