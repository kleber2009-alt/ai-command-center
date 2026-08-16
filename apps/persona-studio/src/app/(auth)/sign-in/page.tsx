import { signIn } from '@/lib/auth';

export const metadata = { title: 'Sign in — Persona Studio' };
// Force per-request rendering so the page reflects current runtime env
// (AUTH_GOOGLE_ID, EMAIL_SERVER_HOST) — otherwise Next.js statically
// pre-renders at build time and bakes in whatever providers existed then.
export const dynamic = 'force-dynamic';

function hasGoogle(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

function hasEmail(): boolean {
  // Mailpit is a dev capture SMTP that doesn't deliver to real inboxes — hide.
  const host = process.env.EMAIL_SERVER_HOST;
  return Boolean(host && host !== 'mailpit');
}

export default function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const googleOn = hasGoogle();
  const emailOn = hasEmail();
  const bonus = Number(process.env.SIGNUP_BONUS_TOKENS ?? 10);

  return (
    <main className="min-h-[100svh] grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* LEFT: sign-in form */}
      <section className="flex items-center justify-center px-5 sm:px-8 py-12 lg:py-16">
        <div className="w-full max-w-[440px]">
          <div className="flex items-baseline gap-3 mb-10">
            <span className="inline-block w-[7px] h-[7px] rounded-full bg-lime translate-y-[-1px]" />
            <span className="mono text-[12px] tracking-widest font-bold uppercase">Persona Studio</span>
            <span className="mono text-[11px] tracking-[0.18em] text-text-dim hidden sm:inline">v0.1 · beta</span>
          </div>

          <p className="sec-num mb-3">/ 00 · access</p>
          <h1 className="font-serif text-[40px] sm:text-[44px] leading-[1.05] mb-3">Войди в студию.</h1>
          <p className="font-serif text-[15px] sm:text-[16px] text-text-dim mb-8 max-w-[40ch]">
            Один клик через Google — без паролей. Бонус {bonus} токенов сразу после первого входа.
          </p>

          {googleOn && <GoogleButton />}

          {googleOn && emailOn && (
            <div className="flex items-center gap-3 my-6">
              <span className="flex-1 border-b border-border" />
              <span className="mono text-[10px] tracking-widest uppercase text-text-mute">or</span>
              <span className="flex-1 border-b border-border" />
            </div>
          )}

          {emailOn && <EmailForm error={searchParams} />}

          {!googleOn && !emailOn && <NoProviders />}

          <p className="mono text-[10px] tracking-widest uppercase text-text-mute mt-10 leading-[1.6]">
            Загружая фото, ты соглашаешься с обработкой изображения лица.
          </p>
        </div>
      </section>

      {/* RIGHT: showcase — hidden on small viewports to keep first-touch fast */}
      <aside
        aria-label="Примеры обложек, сгенерированных в Persona Studio"
        className="hidden lg:flex relative flex-col justify-center border-l border-border bg-[#050505] overflow-hidden"
      >
        {/* subtle gradient haze */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.35] bg-[radial-gradient(60%_50%_at_70%_30%,#1a2a05_0%,transparent_70%),radial-gradient(50%_45%_at_30%_75%,#2a0510_0%,transparent_70%)]" />

        <div className="relative px-10 xl:px-16 py-12">
          <div className="flex items-baseline justify-between mb-8">
            <p className="sec-num">/ examples</p>
            <p className="mono text-[10px] tracking-widest uppercase text-text-mute">обложки · карусели</p>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:gap-4 max-w-[640px]">
            {SHOWCASE.map((c, i) => (
              <CoverPreview key={i} {...c} />
            ))}
          </div>

          <div className="mt-10 max-w-[440px]">
            <p className="font-serif italic text-[14px] text-text-dim leading-[1.6]">
              Одно фото — десять аватаров, виральные обложки и говорящее видео. Всё в одной студии, без переключения между приложениями.
            </p>
          </div>
        </div>
      </aside>
    </main>
  );
}

// NextAuth passes machine error codes (?error=Configuration etc.) — show
// the user something actionable instead.
function authErrorText(code: string): string {
  switch (code) {
    case 'Configuration':
      return 'вход временно недоступен, попробуй позже.';
    case 'AccessDenied':
      return 'доступ запрещён для этого аккаунта.';
    case 'Verification':
      return 'ссылка из письма устарела — запроси новую.';
    case 'EmailSignInError':
    case 'EmailSend':
      return 'не удалось отправить письмо — проверь адрес и попробуй ещё раз.';
    default:
      return 'не получилось войти — попробуй ещё раз.';
  }
}

function NoProviders() {
  // Support contact is configurable so the personal admin handle never
  // hardcodes into a client-facing error.
  const supportUrl = process.env.SUPPORT_TELEGRAM_URL;
  return (
    <div className="border border-border-2 bg-surface p-5">
      <p className="mono text-[10px] tracking-widest uppercase text-pink mb-2">/ no-providers</p>
      <p className="font-serif text-[14px] text-text-dim">
        Вход временно недоступен.{' '}
        {supportUrl ? (
          <>
            Напиши в поддержку —{' '}
            <a href={supportUrl} className="text-cyan hover:underline">Telegram</a>.
          </>
        ) : (
          'Попробуй позже.'
        )}
      </p>
    </div>
  );
}

type Cover = {
  kicker: string;
  title: string;
  subtitle: string;
  cta: string;
  tone: 'lime' | 'pink' | 'cyan' | 'warm';
};

const SHOWCASE: Cover[] = [
  { kicker: '01 · burnout', title: 'ВЫГОРАНИЕ — ЭТО НЕ ЛЕНЬ', subtitle: 'симптомы, которые ты пропустил', cta: 'читать', tone: 'pink' },
  { kicker: '02 · hooks', title: 'ПОЧЕМУ ТВОЙ ХУК СКУЧНЫЙ', subtitle: 'пять фиксов от автора с 2M', cta: 'разбор', tone: 'lime' },
  { kicker: '03 · story', title: 'Я ПРОВАЛИЛСЯ 47 РАЗ', subtitle: 'и сделал один виральный', cta: 'история', tone: 'cyan' },
  { kicker: '04 · rhythm', title: 'НЕ ПОСТЬ. ВЫПУСКАЙ.', subtitle: 'новый ритм для Instagram', cta: 'метод', tone: 'warm' },
  { kicker: '05 · craft', title: 'ОДНО ФОТО — ДЕСЯТЬ ЛИЦ', subtitle: 'за две минуты, без фотографа', cta: 'попробуй', tone: 'lime' },
  { kicker: '06 · cold start', title: 'КОНТЕНТ БЕЗ ВДОХНОВЕНИЯ', subtitle: 'парсер найдёт, что выстрелит', cta: 'парсер', tone: 'pink' },
];

function CoverPreview({ kicker, title, subtitle, cta, tone }: Cover) {
  const toneRing: Record<Cover['tone'], string> = {
    lime: 'from-[#1a2a05] via-[#0a0a0a] to-[#050505]',
    pink: 'from-[#2a0510] via-[#0a0a0a] to-[#050505]',
    cyan: 'from-[#051a1a] via-[#0a0a0a] to-[#050505]',
    warm: 'from-[#2a1505] via-[#0a0a0a] to-[#050505]',
  };
  const toneText: Record<Cover['tone'], string> = {
    lime: 'text-lime',
    pink: 'text-pink',
    cyan: 'text-cyan',
    warm: 'text-warm',
  };
  return (
    <div
      className={`relative aspect-[4/5] border border-border bg-gradient-to-br ${toneRing[tone]} p-3 xl:p-4 flex flex-col justify-between overflow-hidden`}
    >
      <div className="flex items-start justify-between">
        <p className={`mono text-[8px] tracking-widest uppercase ${toneText[tone]}`}>{kicker}</p>
        <span className="mono text-[8px] tracking-widest uppercase text-text-mute">4:5</span>
      </div>

      <div>
        <p
          className="font-serif font-bold uppercase leading-[1.0] text-[13px] xl:text-[15px] text-text"
          style={{ letterSpacing: '-0.01em' }}
        >
          {title}
        </p>
        <p className={`font-serif italic text-[10px] xl:text-[11px] mt-1 ${toneText[tone]}`}>{subtitle}</p>
      </div>

      <div className="flex items-center justify-between">
        <span className={`mono text-[8px] tracking-widest uppercase ${toneText[tone]}`}>→ {cta}</span>
        <span className="mono text-[7px] tracking-widest uppercase text-text-faint">persona</span>
      </div>
    </div>
  );
}

function GoogleButton() {
  async function action() {
    'use server';
    await signIn('google', { redirectTo: '/dashboard' });
  }
  return (
    <form action={action}>
      <button type="submit" className="btn-primary justify-center w-full flex items-center gap-3">
        <GoogleGlyph />
        <span>Войти через Google</span>
      </button>
    </form>
  );
}

async function EmailForm({ error }: { error: Promise<{ error?: string; sent?: string }> }) {
  const params = await error;

  async function action(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').trim();
    if (!email) return;
    await signIn('nodemailer', { email, redirectTo: '/dashboard' });
  }

  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-2">
        <span className="label">Email</span>
        <input
          name="email"
          type="email"
          required
          placeholder="you@studio.com"
          className="input"
          autoComplete="email"
        />
      </label>
      <button type="submit" className="btn-ghost justify-center w-full">
        Прислать magic-link →
      </button>
      {params.sent && (
        <p className="mono text-[11px] text-cyan tracking-wider mt-2">
          /SENT — проверь почту.
        </p>
      )}
      {params.error && (
        <p className="mono text-[11px] text-pink tracking-wider mt-2">
          /ERROR — {authErrorText(params.error)}
        </p>
      )}
    </form>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.87 2.69-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.92v2.34A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.96H.92A9 9 0 0 0 0 9c0 1.45.35 2.83.92 4.04l3.03-2.34z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .92 4.96l3.03 2.34C4.66 5.17 6.65 3.58 9 3.58z"/>
    </svg>
  );
}
