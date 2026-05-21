'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AnalyzePage() {
  const [owner, setOwner] = useState('@ilia_pali0');
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem('persona_train_owner');
      if (v) setOwner(v);
    } catch {}
  }, []);

  async function analyze() {
    if (!owner.trim() || !transcript.trim()) return;
    setLoading(true);
    setStatus({ kind: 'info', text: 'Claude Sonnet 4.6 анализирует транскрипт… (10-30s)' });
    setResult(null);
    try {
      const res = await fetch('/api/voice/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner_handle: owner.trim(), transcript }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus({ kind: 'err', text: data.error + ': ' + (data.details || '').slice(0, 200) });
      } else {
        setResult(data);
        setStatus({
          kind: 'ok',
          text: `✓ ${data.meta.transcript_chars} chars · $${data.meta.cost_usd} · ${(data.meta.elapsed_ms / 1000).toFixed(1)}s`,
        });
      }
    } catch (e) {
      setStatus({ kind: 'err', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <Link href="/cabinet" className="mb-6 inline-block text-[10px] uppercase tracking-[0.2em] text-muted hover:text-accent">
          ← Кабинет
        </Link>
        <h1 className="text-3xl font-bold">
          <span className="text-accent">Analyze</span> · профиль голоса бренда
        </h1>
        <p className="mt-3 text-[12px] text-muted">
          Вставь транскрипт подкаста / интервью / монолога. Claude вытащит identity / tone / values / favorite_phrases /
          style_examples — это профиль для AI-агентов продаж.
        </p>

        <section className="mt-8 rounded-2xl border border-white/[0.06] bg-s1 p-6">
          <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted">Owner</div>
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-s2 px-4 py-3 text-[13px] outline-none focus:border-accent"
          />

          <div className="mt-4 mb-2 text-[10px] uppercase tracking-[0.15em] text-muted">Transcript</div>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={12}
            placeholder="Вставь сюда расшифровку 1-3 подкастов целиком, обычным текстом"
            className="w-full resize-y rounded-xl border border-white/10 bg-s2 px-4 py-3 text-[12px] leading-relaxed outline-none focus:border-accent"
          />
          <div className="mt-1 text-[10px] text-muted">{transcript.length} chars · до ~150k</div>

          <div className="mt-5">
            <button
              onClick={analyze}
              disabled={loading || !transcript.trim()}
              className="rounded-xl bg-accent px-6 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-bg disabled:opacity-40"
            >
              🧠 Извлечь профиль
            </button>
          </div>

          {status && (
            <div
              className={`mt-4 rounded-xl border p-3 text-[12px] ${
                status.kind === 'ok'
                  ? 'border-green/30 bg-green/5 text-green'
                  : status.kind === 'err'
                    ? 'border-red/30 bg-red/5 text-red'
                    : 'border-cyan/30 bg-cyan/5 text-cyan'
              }`}
            >
              {status.text}
            </div>
          )}

          {result && (
            <pre className="mt-4 max-h-[600px] overflow-auto rounded-xl border border-white/10 bg-s2 p-4 text-[11px] leading-relaxed text-text">
              {JSON.stringify(result.profile, null, 2)}
            </pre>
          )}
        </section>
      </div>
    </main>
  );
}
