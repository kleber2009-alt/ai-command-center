'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, CheckSquare, BarChart2, FileText, Settings, Zap, MessageSquare } from 'lucide-react'

const nav = [
  { href: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/team',          icon: Users,           label: 'AI Team' },
  { href: '/tasks',         icon: CheckSquare,     label: 'Задачи' },
  { href: '/conversations', icon: MessageSquare,   label: 'Диалоги' },
  { href: '/metrics',       icon: BarChart2,       label: 'Метрики' },
  { href: '/briefing',      icon: FileText,        label: 'Брифинг' },
  { href: '/settings',      icon: Settings,        label: 'Настройки' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <div className="flex min-h-screen bg-slate-950">
      <aside className="fixed left-0 top-0 h-screen w-56 bg-slate-900 border-r border-slate-800 flex flex-col z-40">
        <div className="px-4 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-xs font-bold text-white tracking-wider uppercase leading-tight">AI Command</div>
              <div className="text-[10px] text-slate-500 leading-tight">Business OS</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ href, icon: Icon, label }) => {
            const active = path === href
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
            <div className="text-slate-500 font-medium mb-0.5">AI Mastery Platform</div>
            v0.1.0 · claude-sonnet-4-6
          </div>
        </div>
      </aside>
      <main className="flex-1 ml-56 min-h-screen overflow-x-hidden">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  )
}
