'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AudioLines, Bot, Brain, Instagram } from 'lucide-react'

const TABS = [
  { href: '/transcribe', label: 'Транскрипция', Icon: AudioLines },
  { href: '/assistants', label: 'Ассистенты', Icon: Bot },
  { href: '/instagram-intelligence', label: 'Instagram', Icon: Instagram },
  { href: '/me', label: 'Я', Icon: Brain },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-apple-line bg-white/90 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex max-w-2xl items-stretch">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== '/transcribe' && href !== '/me' && pathname.startsWith(href)) || (href === '/me' && (pathname === '/me' || pathname.startsWith('/me/')))
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
                active ? 'text-apple-ink' : 'text-apple-faint hover:text-apple-muted'
              }`}
            >
              <Icon className={`h-[22px] w-[22px] ${active ? 'stroke-[2.2]' : 'stroke-[1.6]'}`} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
      {/* iPhone home indicator safe area */}
      <div className="h-[env(safe-area-inset-bottom,0px)]" />
    </nav>
  )
}
