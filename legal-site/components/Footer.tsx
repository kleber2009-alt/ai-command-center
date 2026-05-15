import { Scale } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="border-t border-ink-50/10 bg-ink-950 text-ink-50/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-ink-50/5 text-gold-400">
            <Scale className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <span className="font-serif text-base text-ink-50/85">
            Lex<span className="text-gold-500">&nbsp;·&nbsp;</span>Partners
          </span>
        </div>

        <div className="text-xs">
          © {new Date().getFullYear()} Lex & Partners. Все права защищены.
        </div>
      </div>
    </footer>
  )
}
