import { signIn } from '@/lib/auth';

export const metadata = { title: 'Sign in — Persona Studio' };

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

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex items-baseline gap-3 mb-10">
          <span className="inline-block w-[7px] h-[7px] rounded-full bg-lime translate-y-[-1px]" />
          <span className="mono text-[12px] tracking-widest font-bold uppercase">Persona Studio</span>
          <span className="mono text-[11px] tracking-[0.18em] text-text-dim">v0.1 · beta</span>
        </div>

        <p className="sec-num mb-3">/ 00 · access</p>
        <h1 className="font-serif text-[44px] leading-[1.05] mb-3">Войди в студию.</h1>
        <p className="font-serif text-[16px] text-text-dim mb-8 max-w-[40ch]">
          Один клик через Google — без паролей. Бонус 10 токенов сразу после первого входа.
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

        {!googleOn && !emailOn && (
          <div className="border border-border-2 bg-surface p-5">
            <p className="mono text-[10px] tracking-widest uppercase text-pink mb-2">/ no-providers</p>
            <p className="font-serif text-[14px] text-text-dim">
              Sign-in temporarily unavailable. Свяжись с админом в Telegram —{' '}
              <a href="https://t.me/ilia_pali0" className="text-cyan hover:underline">@ilia_pali0</a>.
            </p>
          </div>
        )}

        <p className="mono text-[10px] tracking-widest uppercase text-text-mute mt-10">
          Загружая фото, ты соглашаешься с обработкой изображения лица.
        </p>
      </div>
    </main>
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
      <button type="submit" className="btn-ghost justify-center">
        Прислать magic-link →
      </button>
      {params.sent && (
        <p className="mono text-[11px] text-cyan tracking-wider mt-2">
          /SENT — проверь почту.
        </p>
      )}
      {params.error && (
        <p className="mono text-[11px] text-pink tracking-wider mt-2">
          /ERROR — {params.error}
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
