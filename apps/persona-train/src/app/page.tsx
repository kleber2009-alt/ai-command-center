import Link from 'next/link';

export default function Landing() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-5 pt-20 pb-32">
        {/* ── hero ───────────────────────────────────────── */}
        <div className="mb-3 text-[10px] uppercase tracking-[0.3em] text-accent">
          PERSONA TRAIN · MVP
        </div>
        <h1 className="text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
          Обучи AI-агента
          <br />
          <span className="text-accent">своему голосу</span>
        </h1>
        <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-muted">
          Шли голосовые в Telegram — бот копит, ElevenLabs клонирует, аватар обучается на кружках.
          Озвучивает любой текст твоим голосом и собирает структурированный профиль голоса бренда для AI-агентов продаж.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/cabinet"
            className="rounded-xl bg-accent px-6 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-bg transition hover:-translate-y-px hover:bg-[#aed040]"
          >
            Открыть кабинет →
          </Link>
          <a
            href="https://t.me/ilia_pali0_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-cyan/40 px-6 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-cyan transition hover:bg-cyan/5"
          >
            Telegram-бот →
          </a>
        </div>

        {/* ── 4 пилона ───────────────────────────────────── */}
        <section className="mt-24 grid gap-4 md:grid-cols-2">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-white/[0.06] bg-s1 p-6"
            >
              <div className="mb-3 text-[9px] uppercase tracking-[0.3em] text-muted">
                {p.kicker}
              </div>
              <h3 className="text-lg font-bold">{p.title}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">{p.body}</p>
              <code className="mt-4 inline-block rounded bg-s2 px-2 py-1 text-[10px] text-cyan">
                {p.endpoint}
              </code>
            </div>
          ))}
        </section>

        {/* ── how it works ───────────────────────────────── */}
        <section className="mt-24">
          <div className="mb-6 text-[9px] uppercase tracking-[0.3em] text-muted">
            Как это работает
          </div>
          <ol className="space-y-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/40 text-[11px] font-bold text-accent">
                  {i + 1}
                </div>
                <div>
                  <div className="font-bold">{s.title}</div>
                  <div className="text-[12px] leading-relaxed text-muted">{s.body}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="mt-24 text-center text-[10px] tracking-[0.15em] text-muted">
          Persona Train · ElevenLabs IVC · Anthropic Sonnet 4.6 ·{' '}
          <Link href="/api/health" className="text-cyan hover:underline">
            health
          </Link>
        </footer>
      </div>
    </main>
  );
}

const PILLARS = [
  {
    kicker: 'voice cloning',
    title: 'Клон голоса из накопленного',
    body: 'Шлёшь voice-notes — бот складывает в samples. На пороге 180с автоматически переклонирует через ElevenLabs IVC.',
    endpoint: 'POST /api/voice/train',
  },
  {
    kicker: 'text-to-voice',
    title: 'Озвучка любого текста',
    body: 'Любой текст в боте → voice-note твоим голосом. Дальше пересылаешь native-share Telegram.',
    endpoint: 'POST /api/voice/generate',
  },
  {
    kicker: 'voice analyzer',
    title: 'Профиль голоса бренда',
    body: 'Транскрипт → Claude Sonnet 4.6 → структурированный JSON (tone, values, favorite_phrases, style_examples).',
    endpoint: 'POST /api/voice/analyze',
  },
  {
    kicker: 'avatar training',
    title: 'Аватар из кружков',
    body: 'Кружки копятся как avatar_samples. /avatar → пайплайн в HeyGen/Higgsfield (provider call в follow-up).',
    endpoint: 'POST /api/avatar/train',
  },
];

const STEPS = [
  {
    title: 'Привязка',
    body: 'В кабинете создаёшь one-time код, в боте /start @твой_handle XXX-XXX. Чат привязан к owner.',
  },
  {
    title: 'Шли голосовые',
    body: 'Любое voice/audio в бот → попадает в voice_samples. Прогресс-бар к auto-train порогу.',
  },
  {
    title: 'Train / generate',
    body: '/train пересоздаёт voice_id из накопленного. Дальше любой текст в чат → бот отвечает voice-note.',
  },
  {
    title: 'Расширения',
    body: 'Кружки → /avatar (HeyGen). Транскрипты → /analyze (профиль голоса для агентов).',
  },
];
