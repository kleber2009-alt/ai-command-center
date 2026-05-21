'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type AvatarSample = {
  id: string;
  source: string;
  duration_seconds: number | null;
  byte_size: number;
  consumed: boolean;
  created_at: string;
};

export default function AvatarPage() {
  const [owner, setOwner] = useState('@ilia_pali0');
  const [samples, setSamples] = useState<AvatarSample[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem('persona_train_owner');
      if (v) setOwner(v);
    } catch {}
  }, []);

  useEffect(() => {
    if (!owner.trim()) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  async function refresh() {
    const res = await fetch(`/api/avatar/sample?owner=${encodeURIComponent(owner)}`);
    if (res.ok) {
      const data = await res.json();
      setSamples(data.samples || []);
    }
  }

  async function upload() {
    if (!file || !owner.trim()) return;
    const fd = new FormData();
    fd.append('owner_handle', owner.trim());
    fd.append('source', 'web');
    fd.append('file', file);
    setStatus({ kind: 'info', text: 'Загружаю кружок…' });
    const res = await fetch('/api/avatar/sample', { method: 'POST', body: fd });
    const data = await res.json();
    setStatus(res.ok
      ? { kind: 'ok', text: `+1 sample · pending ${data.pending_count} · ${Math.round(data.pending_seconds)}s` }
      : { kind: 'err', text: JSON.stringify(data).slice(0, 200) });
    refresh();
  }

  async function train() {
    if (!confirm('Запустить обучение аватара из накопленных кружков?')) return;
    const res = await fetch('/api/avatar/train', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner_handle: owner, provider: 'heygen' }),
    });
    const data = await res.json();
    setStatus(res.ok
      ? { kind: 'ok', text: `Reserved: ${data.avatar_id} · ${data.consumed_samples} samples (${data.seconds_used}s). Provider call в follow-up.` }
      : { kind: 'err', text: JSON.stringify(data).slice(0, 200) });
    refresh();
  }

  const pending = samples.filter((s) => !s.consumed);
  const pendingSec = pending.reduce((s, r) => s + Number(r.duration_seconds || 0), 0);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <Link href="/cabinet" className="mb-6 inline-block text-[10px] uppercase tracking-[0.2em] text-muted hover:text-accent">
          ← Кабинет
        </Link>
        <h1 className="text-3xl font-bold">
          <span className="text-accent">Avatar</span> · обучение на кружках
        </h1>
        <p className="mt-3 text-[12px] text-muted">
          Шли кружки в @ilia_pali0_bot — копится здесь. /avatar (или кнопка ниже) запустит обучение через HeyGen Custom
          Avatar / Higgsfield Character. Provider-pipeline сейчас в стабе — резервирует avatar_id и помечает samples
          consumed.
        </p>

        <section className="mt-8 rounded-2xl border border-white/[0.06] bg-s1 p-6">
          <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted">Owner</div>
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-s2 px-4 py-3 text-[13px] outline-none focus:border-accent"
          />

          <div className="mt-6 grid grid-cols-3 gap-3 rounded-xl border border-white/10 bg-s2 p-4">
            <Stat label="Pending кружков" value={String(pending.length)} />
            <Stat label="Total seconds" value={Math.round(pendingSec) + 's'} />
            <Stat label="Total ever" value={String(samples.length)} />
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted">Загрузить кружок / видео</div>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-[12px] text-muted"
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={upload}
              disabled={!file}
              className="rounded-xl border border-accent/40 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent disabled:opacity-40"
            >
              + Sample
            </button>
            <button
              onClick={train}
              disabled={pending.length === 0}
              className="rounded-xl bg-accent px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-bg disabled:opacity-40"
            >
              Train avatar →
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
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.15em] text-muted">{label}</div>
    </div>
  );
}
