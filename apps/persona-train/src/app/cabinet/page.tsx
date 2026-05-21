'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Voice = {
  id: string;
  display_name: string | null;
  provider: string;
  provider_voice_id: string;
  sample_seconds: number | null;
  created_at: string;
};

type Status = {
  owner_handle: string;
  current: Voice | null;
  archived: Voice[];
  samples: { pending_count: number; pending_seconds: number; total_count: number };
  auto_retrain_threshold_seconds: number;
};

const OWNER_KEY = 'persona_train_owner';

export default function Cabinet() {
  const [owner, setOwner] = useState('@ilia_pali0');
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [bindingToken, setBindingToken] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(OWNER_KEY);
      if (saved) setOwner(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (!owner.trim()) return;
    try { localStorage.setItem(OWNER_KEY, owner.trim()); } catch {}
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch(`/api/voice/list?owner=${encodeURIComponent(owner)}`);
      if (res.ok) setStatus((await res.json()) as Status);
    } finally {
      setLoading(false);
    }
  }

  async function train() {
    if (!confirm('Пере-клонировать голос из накопленных samples?')) return;
    const res = await fetch('/api/voice/train', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner_handle: owner }),
    });
    const data = await res.json();
    alert(res.ok ? `✓ Готово: ${data.consumed_samples} samples, ${data.seconds_used}s` : `Error: ${JSON.stringify(data)}`);
    refresh();
  }

  async function getBindingToken() {
    const res = await fetch('/api/voice/binding-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner_handle: owner }),
    });
    const data = await res.json();
    if (res.ok) setBindingToken(data.token);
    else alert(`Error: ${JSON.stringify(data)}`);
  }

  const pendingRatio = status
    ? Math.min(100, Math.round((status.samples.pending_seconds / status.auto_retrain_threshold_seconds) * 100))
    : 0;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <Link href="/" className="mb-6 inline-block text-[10px] uppercase tracking-[0.2em] text-muted hover:text-accent">
          ← На главную
        </Link>

        <h1 className="text-3xl font-bold">
          Кабинет <span className="text-accent">Persona Train</span>
        </h1>

        {/* owner ── */}
        <section className="mt-8 rounded-2xl border border-white/[0.06] bg-s1 p-5">
          <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted">Owner handle</div>
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="@your_handle"
            className="w-full rounded-xl border border-white/10 bg-s2 px-4 py-3 text-[13px] outline-none focus:border-accent"
          />
        </section>

        {/* status ── */}
        <section className="mt-5 rounded-2xl border border-white/[0.06] bg-s1 p-5">
          <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-muted">
            <span>Активный голос</span>
            <button onClick={refresh} disabled={loading} className="text-cyan hover:underline disabled:opacity-50">
              {loading ? '...' : 'refresh'}
            </button>
          </div>
          {status?.current ? (
            <div>
              <div className="text-lg font-bold">{status.current.display_name || status.current.provider_voice_id}</div>
              <div className="mt-2 text-[11px] text-muted">
                Provider: {status.current.provider} · <code className="text-cyan">{status.current.provider_voice_id}</code>
                <br />
                Created: {new Date(status.current.created_at).toLocaleString('ru-RU')}
                {status.current.sample_seconds ? ` · sample ${status.current.sample_seconds}s` : ''}
              </div>
            </div>
          ) : (
            <div className="text-[12px] italic text-muted">Голоса ещё нет — накопи samples в боте или загрузи в /cabinet/train.</div>
          )}
        </section>

        {/* samples ── */}
        <section className="mt-5 rounded-2xl border border-white/[0.06] bg-s1 p-5">
          <div className="mb-3 text-[10px] uppercase tracking-[0.15em] text-muted">Pending samples</div>
          {status && (
            <>
              <div className="text-2xl font-bold">
                {status.samples.pending_count}× ·{' '}
                <span className="text-accent">{Math.round(status.samples.pending_seconds)}s</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-s2">
                <div
                  className="h-full bg-gradient-to-r from-red via-accent to-green transition-all"
                  style={{ width: `${pendingRatio}%` }}
                />
              </div>
              <div className="mt-2 text-[10px] text-muted">
                {pendingRatio}% из {status.auto_retrain_threshold_seconds}s до auto-train
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={train}
                  disabled={!status || status.samples.pending_count === 0}
                  className="rounded-xl bg-accent px-5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-bg disabled:opacity-40"
                >
                  Train сейчас →
                </button>
                <Link href="/cabinet/train" className="rounded-xl border border-cyan/40 px-5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan">
                  Загрузить файл
                </Link>
                <Link href="/cabinet/generate" className="rounded-xl border border-white/10 px-5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted hover:text-text">
                  Тест-генерация
                </Link>
              </div>
            </>
          )}
        </section>

        {/* TG bot binding ── */}
        <section className="mt-5 rounded-2xl border border-white/[0.06] bg-s1 p-5">
          <div className="mb-3 text-[10px] uppercase tracking-[0.15em] text-muted">Telegram-бот</div>
          <p className="text-[12px] leading-relaxed text-muted">
            Шли голосовые в{' '}
            <a href="https://t.me/ilia_pali0_bot" target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">
              @ilia_pali0_bot
            </a>{' '}
            — копится в samples. Для активации команд из чужого чата (если нужно) — привязка через one-time код.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={getBindingToken}
              disabled={!status?.current}
              className="rounded-xl border border-accent/40 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-accent disabled:opacity-40"
            >
              Получить код привязки
            </button>
            {bindingToken && (
              <code className="rounded bg-s2 px-3 py-2 text-[12px] text-accent">/start {owner} {bindingToken}</code>
            )}
          </div>
        </section>

        {/* sub-pages ── */}
        <section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { href: '/cabinet/train', label: 'Train' },
            { href: '/cabinet/generate', label: 'Generate' },
            { href: '/cabinet/analyze', label: 'Analyze' },
            { href: '/cabinet/avatar', label: 'Avatar' },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-xl border border-white/10 bg-s1 px-4 py-3 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-muted hover:border-accent/40 hover:text-accent"
            >
              {l.label}
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
