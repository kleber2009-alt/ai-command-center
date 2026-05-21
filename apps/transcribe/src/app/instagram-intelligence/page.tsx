'use client'
import Link from 'next/link'
import { Instagram, TrendingUp, FileText, Search, BarChart2, Lightbulb } from 'lucide-react'

export default function InstagramIntelligenceHub() {
  return (
    <main className="min-h-screen bg-apple-bg-soft px-4 pb-32 pt-10">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-apple-lg">
            <Instagram className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-apple-ink">Instagram Intelligence</h1>
          <p className="mt-1.5 text-sm text-apple-muted">
            Анализ аккаунтов, ресёрч конкурентов и идеи для контента
          </p>
        </div>

        {/* Main cards */}
        <div className="space-y-3">
          <Link
            href="/instagram-intelligence/account"
            className="flex items-center gap-4 rounded-apple bg-white p-5 shadow-apple transition hover:shadow-apple-lg active:scale-[0.99]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50">
              <Search className="h-5 w-5 text-apple-blue" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-apple-ink">Анализ аккаунта</div>
              <div className="mt-0.5 text-sm text-apple-muted">
                Введи username → топ Reels, хуки, паттерны, рекомендации
              </div>
            </div>
            <svg className="h-4 w-4 shrink-0 text-apple-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          <Link
            href="/instagram-intelligence/trends"
            className="flex items-center gap-4 rounded-apple bg-white p-5 shadow-apple transition hover:shadow-apple-lg active:scale-[0.99]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-apple-ink">Тренд-ресёрч</div>
              <div className="mt-0.5 text-sm text-apple-muted">
                Список конкурентов → viral score, тренды, идеи контента
              </div>
            </div>
            <svg className="h-4 w-4 shrink-0 text-apple-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Feature list */}
        <div className="mt-8 rounded-apple bg-white p-5 shadow-apple">
          <h2 className="mb-4 text-sm font-semibold text-apple-ink">Что умеет модуль</h2>
          <div className="space-y-3">
            {[
              { Icon: BarChart2, text: 'Viral Score по формуле: views×0.5 + likes×0.2 + comments×0.2 + engRate×0.1' },
              { Icon: Lightbulb, text: 'AI-анализ хуков: тип, сила, почему сработал' },
              { Icon: FileText, text: 'Паттерны вирусности с разбором структуры: hook → setup → value → CTA' },
              { Icon: TrendingUp, text: '10 идей новых Reels + 10 хуков на основе анализа конкурентов' },
              { Icon: Instagram, text: 'Транскрибация видео через существующий Deepgram pipeline' },
            ].map(({ Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0 text-apple-muted">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-sm text-apple-muted">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Requirements note */}
        <p className="mt-6 text-center text-xs text-apple-faint">
          Требуется APIFY_API_TOKEN · ANTHROPIC_API_KEY
        </p>
      </div>
    </main>
  )
}
