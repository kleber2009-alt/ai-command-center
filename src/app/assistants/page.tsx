import Link from 'next/link'
import {
  BookOpen, ChevronRight, Filter, Flame, LayoutGrid, Magnet,
  MessagesSquare, Package, Send, Sparkles, Target,
} from 'lucide-react'
import { assistants } from '@/data/assistants'

const ICONS: Record<string, any> = {
  Target, MessagesSquare, Send, Flame, Package, Filter, BookOpen, Magnet, LayoutGrid, Sparkles,
}

export default function AssistantsPage() {
  return (
    <div className="space-y-6">
      <p className="text-[14px] text-apple-muted sm:text-[15px]">
        Выбери ассистента — у каждого свой промпт и своя задача.
      </p>

      <ul className="overflow-hidden rounded-apple-lg border border-apple-line bg-white shadow-apple-sm">
        {assistants.map((a, i) => {
          const Icon = ICONS[a.icon] ?? Sparkles
          return (
            <li key={a.id} className={i > 0 ? 'border-t border-apple-line' : ''}>
              <Link
                href={`/assistants/${a.id}`}
                className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-apple-bg-soft sm:px-5"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-apple-bg-soft text-apple-ink transition-colors group-hover:bg-white group-hover:shadow-apple-sm">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[15px] font-medium text-apple-ink sm:text-base">{a.name}</h2>
                  <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-apple-muted sm:text-sm">
                    {a.description}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-apple-faint group-hover:text-apple-muted" />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
