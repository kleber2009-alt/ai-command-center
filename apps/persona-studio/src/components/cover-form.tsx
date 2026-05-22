'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Avatar = { id: string; styleLabel: string; style: string; imageUrl: string };

export function CoverForm({ avatars, initialAvatarId }: { avatars: Avatar[]; initialAvatarId?: string }) {
  const router = useRouter();
  const [avatarId, setAvatarId] = useState<string>(initialAvatarId ?? avatars[0]?.id ?? '');
  const [title, setTitle] = useState('Я СОЗДАЛ СЕБЕ AI-АВАТАРА');
  const [subtitle, setSubtitle] = useState('И ОН ДЕЛАЕТ КОНТЕНТ ЗА МЕНЯ');
  const [cta, setCta] = useState('SWIPE LEFT →');
  const [niche, setNiche] = useState('');
  const [style, setStyle] = useState('ai-visionary');
  const [aspect, setAspect] = useState<'4:5' | '1:1' | '9:16'>('4:5');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAvatar = avatars.find((a) => a.id === avatarId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!avatarId) {
      setError('Сначала нужен хотя бы один готовый аватар');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/generate-cover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ avatarId, title, subtitle, cta, niche, style, aspect }),
      });
      const json = (await res.json()) as { id: string } | { error: string; have?: number; need?: number };
      if (!res.ok || 'error' in json) {
        const msg =
          'error' in json
            ? json.error === 'insufficient_tokens'
              ? `Недостаточно токенов: ${json.have}/${json.need}`
              : json.error
            : `failed_${res.status}`;
        setError(msg);
        setBusy(false);
        return;
      }
      router.push(`/covers?focus=${json.id}`);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="grid gap-5">
        <Field label="Avatar" hint="Выбери лицо для обложки">
          <select className="input" value={avatarId} onChange={(e) => setAvatarId(e.target.value)}>
            {avatars.length === 0 && <option value="">Нет готовых аватаров</option>}
            {avatars.map((a) => (
              <option key={a.id} value={a.id}>
                {a.styleLabel} · {a.id.slice(0, 6)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Headline" hint="Главный текст обложки (3-7 слов)">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </Field>

        <Field label="Subtitle" hint="Подзаголовок, опционально">
          <input className="input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={200} />
        </Field>

        <Field label="CTA" hint="Призыв — Swipe / Save / Read…">
          <input className="input" value={cta} onChange={(e) => setCta(e.target.value)} maxLength={80} />
        </Field>

        <Field label="Niche" hint="Кому это адресовано (опционально)">
          <input className="input" value={niche} onChange={(e) => setNiche(e.target.value)} maxLength={120} placeholder="founders / creators / coaches…" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Style preset">
            <select className="input" value={style} onChange={(e) => setStyle(e.target.value)}>
              <option value="ai-visionary">AI Visionary</option>
              <option value="viral-reels-cover">Viral Reels Cover</option>
              <option value="dark-premium">Dark Premium</option>
              <option value="editorial-fashion">Editorial Fashion</option>
              <option value="cinematic-creator">Cinematic Creator</option>
              <option value="minimal-apple-style">Minimal Apple Style</option>
            </select>
          </Field>
          <Field label="Aspect">
            <select className="input" value={aspect} onChange={(e) => setAspect(e.target.value as '4:5' | '1:1' | '9:16')}>
              <option value="4:5">4:5 — Instagram cover</option>
              <option value="1:1">1:1 — square</option>
              <option value="9:16">9:16 — Reels / Stories</option>
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Generating…' : 'Generate cover · 3 tokens →'}
          </button>
          {error && <span className="mono text-[11px] text-pink tracking-wider">/ERROR — {error}</span>}
        </div>
      </div>

      {/* preview */}
      <aside className="bg-surface border border-border p-5">
        <div className="mono text-[10px] tracking-widest uppercase text-pink mb-3">/ preview · 4:5</div>
        <div
          className="aspect-[4/5] border border-border-2 relative overflow-hidden"
          style={{
            background:
              'linear-gradient(170deg, #2a0a20 0%, #14050f 100%)',
            backgroundImage: selectedAvatar?.imageUrl
              ? `linear-gradient(180deg, rgba(8,8,8,0.0) 0%, rgba(8,8,8,0.8) 90%), url(${selectedAvatar.imageUrl})`
              : 'linear-gradient(170deg, #2a0a20 0%, #14050f 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 p-5 flex flex-col justify-between">
            <span className="mono text-[10px] tracking-widest uppercase text-text-mute">/ cover · {aspect}</span>
            <div>
              <div className="font-serif text-[24px] leading-[1.05] uppercase tracking-tight text-text">{title}</div>
              {subtitle && (
                <div className="font-serif italic text-[15px] text-pink mt-1 leading-tight">{subtitle}</div>
              )}
              {cta && (
                <div className="mono text-[10px] tracking-widest uppercase text-pink font-bold mt-4">{cta}</div>
              )}
            </div>
          </div>
        </div>
        <p className="mono text-[10px] tracking-widest uppercase text-text-mute mt-3">
          Это набросок. Финальную обложку рендерит Nano Banana 2.
        </p>
      </aside>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mono text-[10px] tracking-wider text-text-mute mt-1">{hint}</span>}
    </label>
  );
}
