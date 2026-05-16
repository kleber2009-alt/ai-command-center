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
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold sm:text-2xl">ИИ-ассистенты</h1>
        <p className="text-sm text-slate-400">
          Выбери ассистента — у каждого свой промпт и своя задача.
        </p>
      </header>

      <ul className="space-y-2">
        {assistants.map((a) => {
          const Icon = ICONS[a.icon] ?? Sparkles
          return (
            <li key={a.id}>
              <Link
                href={`/assistants/${a.id}`}
                className="group flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-slate-700 hover:bg-slate-900"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-200 group-hover:bg-slate-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate text-sm font-medium text-slate-100 sm:text-base">{a.name}</h2>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-slate-300" />
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs text-slate-400 sm:text-sm">
                    {a.description}
                  </p>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
