import { Building2, ChevronRight, Mic, ShoppingBag } from 'lucide-react'

type Project = {
  id: string
  name: string
  description: string
  icon: typeof Building2
  href?: string
}

const projects: Project[] = [
  {
    id: 'ai-office',
    name: 'ИИ-офис',
    description: 'Командный центр: ассистенты, второй мозг, доска задач — всё в одном месте.',
    icon: Building2,
    href: '/assistants',
  },
  {
    id: 'ai-sales',
    name: 'Отдел продаж',
    description: 'Мульти-агентная система продаж в Instagram и Telegram с клонированным голосом и общей базой знаний.',
    icon: ShoppingBag,
  },
  {
    id: 'transcribe',
    name: 'Транскрибация',
    description: 'Транскрипция YouTube, Instagram Reels и аудио — с саммари, переводом и генерацией контента.',
    icon: Mic,
    href: '/transcribe',
  },
]

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-apple-ink sm:text-[34px]">
          Мои проекты
        </h1>
        <p className="mt-1 text-[15px] text-apple-muted sm:text-base">
          Три направления, которые сейчас в работе.
        </p>
      </header>

      <ul className="overflow-hidden rounded-apple-lg border border-apple-line bg-white shadow-apple-sm">
        {projects.map((p, i) => {
          const Icon = p.icon
          const content = (
            <div className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-apple-bg-soft sm:px-5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-apple-bg-soft text-apple-ink transition-colors group-hover:bg-white group-hover:shadow-apple-sm">
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[15px] font-medium text-apple-ink sm:text-base">{p.name}</h2>
                <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-apple-muted sm:text-sm">
                  {p.description}
                </p>
              </div>
              {p.href && <ChevronRight className="h-4 w-4 shrink-0 text-apple-faint group-hover:text-apple-muted" />}
            </div>
          )
          return (
            <li key={p.id} className={i > 0 ? 'border-t border-apple-line' : ''}>
              {p.href ? <a href={p.href}>{content}</a> : content}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
