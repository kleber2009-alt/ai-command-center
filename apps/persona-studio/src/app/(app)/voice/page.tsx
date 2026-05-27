import Link from 'next/link';
import { PageHero } from '@/components/shell/page-hero';

export const metadata = { title: 'Voice training — Persona Studio' };

const PERSONA_TRAIN_URL = 'https://persona-train.46-62-215-11.nip.io';
const PERSONA_TRAIN_BOT = 'https://t.me/ilia_pali0_bot';

const PILLARS = [
  {
    kicker: 'voice cloning',
    title: 'Клон голоса из накопленного',
    body: 'Шлёшь голосовые в Telegram — бот складывает в samples. На пороге 180с автоматически переклонирует через ElevenLabs IVC.',
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
    body: 'Кружки копятся как avatar_samples. /avatar → пайплайн в HeyGen/Higgsfield.',
    endpoint: 'POST /api/avatar/train',
  },
];

const STEPS = [
  {
    title: 'Привязка',
    body: 'В кабинете Persona Train создаёшь one-time код, в боте /start @твой_handle XXX-XXX. Чат привязан к owner.',
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
    title: 'В Persona Studio',
    body: 'Берёшь voice_id из кабинета Persona Train, вставляешь в форму генерации видео — аватар заговорит твоим голосом (engine ElevenLabs).',
  },
];

export default function VoicePage() {
  return (
    <div className="grid gap-12">
      <PageHero
        eyebrow="PERSONA TRAIN · IVC · 02"
        title={
          <>
            Train your avatar
            <br />
            to speak <span className="italic text-gold">in your own voice</span>.
          </>
        }
        description={
          <>
            Send voice notes to the Telegram bot — samples accumulate, ElevenLabs IVC clones your timbre.
            You get a personal <code className="mono text-[12px] text-gold">voice_id</code> that you paste
            into the video form, and the avatar starts narrating any script in your voice.
          </>
        }
        meta={
          <>
            <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted">External</div>
            <a
              href={PERSONA_TRAIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-serif italic text-gold hover:underline text-[14px]"
            >
              persona-train.46-62-215-11.nip.io →
            </a>
          </>
        }
        actions={[
          { label: 'Open Persona Train', href: `${PERSONA_TRAIN_URL}/cabinet` },
          { label: 'Telegram bot', href: PERSONA_TRAIN_BOT, tone: 'ghost' },
          { label: 'I already have voice_id', href: '/videos/new', tone: 'ghost' },
        ]}
      />

      {/* ── 4 пилона ───────────────────────────────────── */}
      <section>
        <div className="mb-6 flex items-baseline gap-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Capabilities</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
        </div>
        <div className="grid gap-[2px] md:grid-cols-2 bg-border border border-border">
          {PILLARS.map((p) => (
            <div key={p.title} className="bg-surface p-6">
              <div className="mb-3 mono text-[9px] uppercase tracking-[0.3em] text-text-mute">
                {p.kicker}
              </div>
              <h3 className="font-serif text-[20px] leading-tight">{p.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-text-dim">{p.body}</p>
              <code className="mt-4 inline-block bg-surface-2 px-2 py-1 mono text-[10px] text-cyan">
                {p.endpoint}
              </code>
            </div>
          ))}
        </div>
      </section>

      {/* ── how it works ───────────────────────────────── */}
      <section>
        <div className="mb-6 flex items-baseline gap-3">
          <span className="sec-num">/02</span>
          <span className="sec-title">How it works</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
        </div>
        <ol className="space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4 border-l-2 border-border pl-6 py-1">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-lime/40 mono text-[12px] font-bold text-lime -ml-[1.65rem] bg-bg">
                {i + 1}
              </div>
              <div>
                <div className="font-serif italic text-[18px]">{s.title}</div>
                <div className="text-[13px] leading-relaxed text-text-dim mt-1">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── how-to-use в Persona Studio ───────────────── */}
      <section className="border border-border-2 bg-surface p-8">
        <div className="mono text-[10px] uppercase tracking-[0.3em] text-lime mb-3">
          / handoff to videos
        </div>
        <h2 className="font-serif text-[28px] leading-tight mb-4">
          Как использовать обученный голос в видео
        </h2>
        <ol className="grid gap-3 text-[13px] leading-relaxed text-text-dim list-decimal pl-5">
          <li>
            Открой <a href={`${PERSONA_TRAIN_URL}/cabinet`} target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">кабинет Persona Train</a>,
            привяжи Telegram-бот и накачай голосовых.
          </li>
          <li>После <code className="mono text-[12px] text-cyan">/train</code> скопируй свой <code className="mono text-[12px] text-cyan">voice_id</code> (ElevenLabs IVC).</li>
          <li>
            На странице <Link href="/videos/new" className="text-cyan hover:underline">/videos/new</Link> выбери
            движок с провайдером <code className="mono text-[12px] text-cyan">ElevenLabs</code> и
            вставь свой <code className="mono text-[12px] text-cyan">voice_id</code> в поле «Custom voice (IVC)».
          </li>
          <li>Аватар озвучит скрипт твоим голосом.</li>
        </ol>
      </section>

      <footer className="text-center mono text-[10px] tracking-[0.15em] text-text-mute">
        Persona Train · ElevenLabs IVC · Anthropic Sonnet 4.6
      </footer>
    </div>
  );
}
