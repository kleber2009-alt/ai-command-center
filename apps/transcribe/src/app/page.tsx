import Link from 'next/link'
import {
  Mic, Sparkles, Brain, Bot, ArrowRight, Languages,
  FileText, MessageSquare, BookOpen, Zap, Wand2,
} from 'lucide-react'

export const metadata = {
  title: 'Транскрибация · ИИ-инструмент для контента',
  description:
    'Расшифровывай YouTube, Reels и подкасты за секунды. Делай саммари, переводы, посты, сценарии Reels и карусели. Личная база знаний с RAG-чатом.',
}

const FEATURES = [
  {
    icon: Mic,
    title: 'Мгновенная транскрибация',
    body:
      'Вставь ссылку YouTube, Instagram Reels, TikTok, X или прямой аудиофайл — получи расшифровку за секунды. Автоматическое распознавание языка.',
    accent: 'YouTube · Reels · TikTok · X · MP3 · WAV',
  },
  {
    icon: Wand2,
    title: 'AI-генерация контента',
    body:
      'Из одного транскрипта — пост в Telegram, сценарий Reels, карусель для Instagram. Сохраняй стиль автора, выбирай формат.',
    accent: 'Telegram-пост · Reels · Carousel · Remix',
  },
  {
    icon: Languages,
    title: 'Саммари и перевод',
    body:
      'Короткое саммари с тезисами или перевод на английский/русский — оба сохраняются вместе с транскриптом.',
    accent: 'Тезисы · RU ↔ EN · Кеш',
  },
  {
    icon: Brain,
    title: 'Личная база знаний',
    body:
      'Загружай документы (PDF, DOCX, Markdown), вставляй заметки, импортируй транскрипты. Всё это становится контекстом для чата.',
    accent: 'PDF · DOCX · MD · CSV · импорт из транскриптов',
  },
  {
    icon: MessageSquare,
    title: 'RAG-чат «второй мозг»',
    body:
      'Спроси у своей библиотеки что угодно — отвечает Claude Sonnet с цитатами из твоих документов. Помнит профиль и проекты.',
    accent: 'Claude Sonnet 4 · Цитаты · Профиль',
  },
  {
    icon: Bot,
    title: '9 специализированных ассистентов',
    body:
      'JTBD-интервью, CustDev, копирайтинг, маркетинг, нейминг, продуктовая стратегия. Каждый — со своим промптом и стилем.',
    accent: '9 экспертов · История чатов · Цитаты',
  },
]

const QUICK_STATS = [
  { value: '<10 сек', label: 'YouTube → текст' },
  { value: '6+', label: 'форматов контента' },
  { value: '9', label: 'AI-ассистентов' },
  { value: '∞', label: 'личная база знаний' },
]

export default function LandingPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-apple-bg text-apple-ink">
      {/* Ambient amber halo behind the hero */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] bg-amber-radial" />

      {/* ───── Header ───── */}
      <header className="sticky top-0 z-20 border-b border-apple-line bg-apple-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-amber to-amber-600 text-apple-bg">
              <Zap className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Транскрайб</span>
          </div>
          <nav className="flex items-center gap-1 text-[13px] font-medium text-apple-muted">
            <a href="#features" className="hidden rounded-md px-3 py-1.5 hover:text-apple-ink sm:inline-block">
              Возможности
            </a>
            <a href="#stats" className="hidden rounded-md px-3 py-1.5 hover:text-apple-ink sm:inline-block">
              Зачем
            </a>
            <Link
              href="/transcribe"
              className="ml-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-amber px-3.5 py-1.5 text-[13px] font-semibold text-apple-bg shadow-[0_0_24px_-6px_rgba(251,191,36,0.6)] transition-colors hover:bg-amber-300"
            >
              Открыть
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </nav>
        </div>
      </header>

      {/* ───── Hero ───── */}
      <section className="mx-auto max-w-6xl px-5 pb-12 pt-20 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-apple-line bg-apple-bg-elev px-3 py-1.5 text-[12px] font-medium text-brand-amber">
            <Sparkles className="h-3.5 w-3.5" />
            Claude Sonnet 4 · Deepgram · OpenAI
          </div>
          <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Превращай любое видео в{' '}
            <span className="bg-gradient-to-r from-brand-amber to-amber-300 bg-clip-text text-transparent">
              готовый контент
            </span>{' '}
            за минуту.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-apple-muted sm:text-lg">
            Транскрипт YouTube или Reels → саммари, перевод, карусель,
            сценарий Reels, пост в Telegram. Личная база знаний с
            RAG-чатом по твоим материалам. Без копипасты.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/transcribe"
              className="btn-amber inline-flex items-center gap-2"
            >
              <Mic className="h-4 w-4" />
              Расшифровать видео
            </Link>
            <Link
              href="/me"
              className="inline-flex items-center gap-2 rounded-xl border border-apple-line bg-apple-bg-elev px-4 py-2.5 text-[14px] font-medium text-apple-ink transition-colors hover:bg-apple-bg-soft"
            >
              <Brain className="h-4 w-4 text-brand-amber" />
              Открыть второй мозг
            </Link>
          </div>
        </div>

        {/* Stats strip */}
        <div
          id="stats"
          className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {QUICK_STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-apple-line bg-apple-bg-elev px-4 py-5 text-center"
            >
              <div className="bg-gradient-to-br from-brand-amber to-amber-300 bg-clip-text text-2xl font-bold text-transparent">
                {s.value}
              </div>
              <div className="mt-1 text-[12px] font-medium text-apple-faint">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Features ───── */}
      <section id="features" className="mx-auto max-w-6xl px-5 pb-24">
        <div className="mb-10 text-center">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-brand-amber">
            Возможности
          </div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Всё нужное для контентмейкера в одном месте
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <article
                key={f.title}
                className="glow-card group relative overflow-hidden p-6 transition-transform hover:-translate-y-0.5"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-300/10 ring-1 ring-brand-amber/30">
                  <Icon className="h-5 w-5 text-brand-amber" />
                </div>
                <h3 className="text-[17px] font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-apple-muted">{f.body}</p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-apple-line bg-apple-bg-soft px-2.5 py-1 text-[11px] font-medium text-apple-faint">
                  {f.accent}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* ───── Bottom CTA ───── */}
      <section className="mx-auto max-w-4xl px-5 pb-24">
        <div className="glow-card relative overflow-hidden px-8 py-14 text-center sm:px-12">
          <div className="absolute inset-0 -z-10 bg-amber-radial opacity-60" />
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-500/30 to-amber-300/10 ring-1 ring-brand-amber/30">
            <FileText className="h-6 w-6 text-brand-amber" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Один транскрипт — десяток форматов.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[14px] text-apple-muted sm:text-[15px]">
            Вставь ссылку — получи готовые материалы. Без водяных знаков, без лимитов на длину.
          </p>
          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/transcribe" className="btn-amber inline-flex items-center gap-2">
              <Mic className="h-4 w-4" />
              Начать
            </Link>
            <Link
              href="/assistants"
              className="inline-flex items-center gap-2 rounded-xl border border-apple-line bg-apple-bg-elev px-4 py-2.5 text-[14px] font-medium text-apple-ink transition-colors hover:bg-apple-bg-soft"
            >
              <Bot className="h-4 w-4 text-brand-amber" />
              Посмотреть ассистентов
            </Link>
          </div>
        </div>
      </section>

      {/* ───── Footer ───── */}
      <footer className="border-t border-apple-line bg-apple-bg-elev">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-[12px] text-apple-faint sm:flex-row">
          <div className="flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5" />
            Self-hosted · SQLite + sqlite-vec · Caddy
          </div>
          <div className="flex items-center gap-4">
            <Link href="/transcribe" className="hover:text-apple-ink">Транскрибация</Link>
            <Link href="/me" className="hover:text-apple-ink">Я</Link>
            <Link href="/assistants" className="hover:text-apple-ink">Ассистенты</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
