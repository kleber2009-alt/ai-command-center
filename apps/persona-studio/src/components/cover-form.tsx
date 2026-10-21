'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';

type Avatar = { id: string; styleLabel: string; style: string; imageUrl: string };

export function CoverForm({ avatars, initialAvatarId, cost }: { avatars: Avatar[]; initialAvatarId?: string; cost: number }) {
  const router = useRouter();
  const [avatarId, setAvatarId] = useState<string>(initialAvatarId ?? avatars[0]?.id ?? '');
  const [title, setTitle] = useState('Я СОЗДАЛ СЕБЕ AI-АВАТАРА');
  const [subtitle, setSubtitle] = useState('И ОН ДЕЛАЕТ КОНТЕНТ ЗА МЕНЯ');
  const [cta, setCta] = useState('SWIPE LEFT →');
  const [niche, setNiche] = useState('');
  const [style, setStyle] = useState('ai-visionary');
  const [aspect, setAspect] = useState<Aspect>('4:5');
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
    <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
      <div className="panel reveal grid gap-5 p-5 sm:p-6">
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

        <AspectPicker value={aspect} onChange={setAspect} />

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {busy ? 'Генерирую…' : `Создать обложку · ${cost} токенов`}
            {!busy && <ArrowRight size={16} aria-hidden />}
          </button>
          {error && (
            <span className="fade-in w-full rounded-2xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
              /ERROR — {error}
            </span>
          )}
        </div>
      </div>

      {/* preview */}
      <aside className="panel reveal p-5 lg:sticky lg:top-6" style={{ ['--i' as string]: 1 } as React.CSSProperties}>
        <div className="mb-3 flex items-center gap-2">
          <span className="sec-num">/ preview</span>
          <span className="text-[12px] tabular-nums text-text-mute">{aspect}</span>
        </div>
        <div
          className={`${ASPECT_CLASS[aspect]} relative overflow-hidden rounded-[20px] border border-border-2`}
          style={{
            background:
              'linear-gradient(170deg, rgba(255,61,139,0.22) 0%, rgba(11,11,13,0.92) 100%)',
            backgroundImage: selectedAvatar?.imageUrl
              ? `linear-gradient(180deg, rgba(11,11,13,0) 0%, rgba(11,11,13,0.82) 90%), url(${selectedAvatar.imageUrl})`
              : 'linear-gradient(170deg, rgba(255,61,139,0.22) 0%, rgba(11,11,13,0.92) 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 p-5 flex flex-col justify-between">
            <span className="self-start rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur-md">/ cover · {aspect}</span>
            <div>
              <div className="break-words text-[22px] font-extrabold leading-[1.05] tracking-[-0.02em] text-text">{title}</div>
              {subtitle && (
                <div className="mt-1.5 break-words text-[14px] font-medium leading-tight text-pink">{subtitle}</div>
              )}
              {cta && (
                <div className="mt-4 inline-block max-w-full break-words rounded-full bg-pink px-3 py-1 text-[11px] font-semibold text-white">{cta}</div>
              )}
            </div>
          </div>
        </div>
        <p className="mt-4 border-t border-border-soft pt-3 text-[12px] leading-relaxed text-text-mute">
          Это набросок. Финальную обложку рендерит Nano Banana 2.
        </p>
      </aside>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-0.5 text-[12px] leading-snug text-text-mute">{hint}</span>}
    </label>
  );
}

type Aspect = '4:5' | '1:1' | '9:16';

const ASPECT_CLASS: Record<Aspect, string> = {
  '4:5': 'aspect-[4/5]',
  '1:1': 'aspect-square',
  '9:16': 'aspect-[9/16]',
};

const ASPECT_OPTIONS: Array<{ value: Aspect; label: string; hint: string; box: string }> = [
  { value: '4:5', label: '4:5', hint: 'Instagram пост / обложка карусели', box: 'w-8 h-10' },
  { value: '1:1', label: '1:1', hint: 'квадрат — лента, миниатюра', box: 'w-9 h-9' },
  { value: '9:16', label: '9:16', hint: 'Reels / Stories / Shorts', box: 'w-6 h-10' },
];

function AspectPicker({ value, onChange }: { value: Aspect; onChange: (v: Aspect) => void }) {
  return (
    <div className="grid gap-2">
      <span className="label">Aspect</span>
      <div role="radiogroup" aria-label="Формат обложки" className="grid grid-cols-3 gap-2">
        {ASPECT_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={`flex flex-col items-center gap-2 rounded-[18px] border px-3 py-3.5 transition-all duration-300 ease-settle ${
                active
                  ? 'border-blue bg-blue/[0.14] shadow-glow'
                  : 'border-border-soft bg-white/[0.04] hover:border-border-2 hover:bg-white/[0.07]'
              }`}
            >
              <span
                className={`${opt.box} block rounded-md border-2 transition-colors ${active ? 'border-gold bg-blue/20' : 'border-text-mute'}`}
                aria-hidden
              />
              <span className={`text-[13px] font-bold tabular-nums ${active ? 'text-text' : 'text-text-dim'}`}>
                {opt.label}
              </span>
              <span className="text-center text-[11px] leading-tight text-text-mute">
                {opt.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
