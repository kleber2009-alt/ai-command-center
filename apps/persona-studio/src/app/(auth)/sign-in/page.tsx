import { signIn } from '@/lib/auth';

export const metadata = { title: 'Sign in — Persona Studio' };

export default function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
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
          Magic link на почту — без паролей. Бонус 10 токенов сразу после первого входа.
        </p>

        <SignInForm error={searchParams} />

        <p className="mono text-[10px] tracking-widest uppercase text-text-mute mt-10">
          Загружая фото, ты соглашаешься с обработкой изображения лица.
        </p>
      </div>
    </main>
  );
}

async function SignInForm({ error }: { error: Promise<{ error?: string; sent?: string }> }) {
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
      <button type="submit" className="btn-primary justify-center">
        Прислать magic-link →
      </button>
      {params.sent && (
        <p className="mono text-[11px] text-cyan tracking-wider mt-2">
          /SENT — проверь почту (на dev — mailpit на :8025).
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
