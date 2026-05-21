'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function GeneratePage() {
  const [owner, setOwner] = useState('@ilia_pali0');
  const [text, setText] = useState('Привет! Это тест моего цифрового голоса.');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem('persona_train_owner');
      if (v) setOwner(v);
    } catch {}
  }, []);

  async function generate() {
    if (!owner.trim() || !text.trim()) return;
    setLoading(true);
    setStatus({ kind: 'info', text: 'Озвучиваю через ElevenLabs… (3-8s)' });
    try {
      const res = await fetch('/api/voice/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner_handle: owner.trim(), text }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus({ kind: 'err', text: data.error + ': ' + (data.details || '').slice(0, 200) });
      } else {
        setAudioUrl(data.audio_url);
        setStatus({ kind: 'ok', text: `✓ ${data.char_count} chars · ${(data.bytes / 1024).toFixed(0)} KB · ${data.model}` });
      }
    } catch (e) {
      setStatus({ kind: 'err', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <Link href="/cabinet" className="mb-6 inline-block text-[10px] uppercase tracking-[0.2em] text-muted hover:text-accent">
          ← Кабинет
        </Link>
        <h1 className="text-3xl font-bold">
          <span className="text-accent">Generate</span> · TTS
        </h1>
        <p className="mt-3 text-[12px] text-muted">Любой текст — voice-note твоим голосом. До 1500 символов.</p>

        <section className="mt-8 rounded-2xl border border-white/[0.06] bg-s1 p-6">
          <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted">Owner</div>
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-s2 px-4 py-3 text-[13px] outline-none focus:border-accent"
          />

          <div className="mt-4 mb-2 text-[10px] uppercase tracking-[0.15em] text-muted">Text</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="w-full resize-y rounded-xl border border-white/10 bg-s2 px-4 py-3 text-[13px] leading-relaxed outline-none focus:border-accent"
            maxLength={1500}
          />
          <div className="mt-1 text-[10px] text-muted">{text.length}/1500</div>

          <div className="mt-5">
            <button
              onClick={generate}
              disabled={loading || !text.trim()}
              className="rounded-xl bg-accent px-6 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-bg disabled:opacity-40"
            >
              🎧 Сгенерировать
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

          {audioUrl && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-s2 p-3">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio src={audioUrl} controls autoPlay className="flex-1" />
              <a href={audioUrl} download className="rounded border border-white/10 px-3 py-2 text-[10px] text-muted hover:text-text">
                ⬇
              </a>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
