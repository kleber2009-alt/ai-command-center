'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VOICE_PRESETS } from '@/lib/heygen-voices';

type Avatar = {
  id: string;
  styleLabel: string;
  style: string;
  imageUrl: string;
};

// Скрипт-«эталон» под talking-photo HeyGen, заточенный под максимальную
// реалистичность лип-синка:
//   • ~25 сек — модель успевает выйти за первые «рваные» 2 секунды разгона
//   • короткие предложения и явные паузы (точка, тире, многоточие) →
//     естественные breath-pauses в lipsync
//   • один риторический вопрос — даёт вариативность мимики
//     (поднятие бровей, наклон головы)
//   • первое лицо, разговорный регистр — модель обучена именно на нём
//   • никаких длинных слов-скороговорок и аббревиатур
const DEFAULT_SCRIPT =
  'Привет. Это говорит мой цифровой двойник — мой AI-аватар.\n\n' +
  'Я записал пятнадцать минут своего голоса и загрузил одну фотографию — и теперь модель говорит за меня моим же голосом.\n\n' +
  'Знаешь, что меня поразило больше всего? То, что я наконец перестал бояться камеры. Достаточно одной хорошей фотографии — и я снова в эфире.\n\n' +
  'Это не магия. Это новый способ работать.';

export function VideoForm({ avatars, initialAvatarId }: { avatars: Avatar[]; initialAvatarId?: string }) {
  const router = useRouter();
  const [avatarId, setAvatarId] = useState<string>(initialAvatarId ?? avatars[0]?.id ?? '');
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [voiceId, setVoiceId] = useState<string>(VOICE_PRESETS[0]?.voice_id ?? '');
  const [aspect, setAspect] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [background, setBackground] = useState<string>('#0a0a0a');
  const [subtitles, setSubtitles] = useState(true);
  const [heygenVersion, setHeygenVersion] = useState<'V' | 'IV'>('V');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = avatars.find((a) => a.id === avatarId);
  const voice = VOICE_PRESETS.find((v) => v.voice_id === voiceId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!avatarId) {
      setError('Сначала выбери аватара');
      return;
    }
    if (script.trim().length < 5) {
      setError('Скрипт слишком короткий (минимум 5 символов)');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          avatarId,
          script,
          voiceId,
          language: voice?.language ?? 'ru',
          aspect,
          background,
          subtitles,
          heygenVersion,
        }),
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
      router.push(`/videos?focus=${json.id}`);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="grid gap-5">
        <Field label="Avatar" hint="Лицо, которое будет говорить">
          <select className="input" value={avatarId} onChange={(e) => setAvatarId(e.target.value)}>
            {avatars.length === 0 && <option value="">Нет готовых аватаров</option>}
            {avatars.map((a) => (
              <option key={a.id} value={a.id}>
                {a.styleLabel} · {a.id.slice(0, 6)}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Script"
          hint={
            `Текст, который произнесёт аватар · ${script.length}/1500 · ` +
            `шаблон оптимизирован под HeyGen lipsync (~25 сек, естественные паузы, риторический вопрос для вариативности мимики)`
          }
        >
          <div className="grid gap-2">
            <textarea
              className="input"
              rows={9}
              value={script}
              maxLength={1500}
              onChange={(e) => setScript(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setScript(DEFAULT_SCRIPT)}
              disabled={script === DEFAULT_SCRIPT}
              className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-cyan disabled:opacity-40 disabled:hover:text-text-mute self-start"
            >
              ↺ вернуть realism-шаблон
            </button>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Voice" hint="Голос HeyGen + язык">
            <select className="input" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
              {VOICE_PRESETS.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Aspect">
            <select className="input" value={aspect} onChange={(e) => setAspect(e.target.value as '9:16' | '1:1' | '16:9')}>
              <option value="9:16">9:16 — Reels / TikTok / Shorts</option>
              <option value="1:1">1:1 — Instagram square</option>
              <option value="16:9">16:9 — YouTube / Web</option>
            </select>
          </Field>
        </div>

        <Field label="HeyGen model" hint="Версия модели HeyGen · V — новейшая, фотореалистичная мимика">
          <select
            className="input"
            value={heygenVersion}
            onChange={(e) => setHeygenVersion(e.target.value as 'V' | 'IV')}
          >
            <option value="V">HeyGen V — Avatar V (recommended · default)</option>
            <option value="IV">HeyGen IV — Avatar IV (legacy)</option>
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Background" hint="HEX-цвет фона">
            <input
              type="text"
              className="input mono"
              value={background}
              maxLength={9}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="#0a0a0a"
            />
          </Field>
          <Field label="Subtitles" hint="Включить субтитры">
            <label className="flex items-center gap-3 input cursor-pointer">
              <input
                type="checkbox"
                checked={subtitles}
                onChange={(e) => setSubtitles(e.target.checked)}
                className="accent-lime w-4 h-4"
              />
              <span className="mono text-xs tracking-widest uppercase">
                {subtitles ? 'on' : 'off'} <span className="text-text-mute">· (currently rendered server-side)</span>
              </span>
            </label>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Submitting…' : 'Generate video · 30 tokens →'}
          </button>
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
            HeyGen · talking photo · ~2-4 мин рендер
          </span>
          {error && <span className="mono text-[11px] text-pink tracking-wider">/ERROR — {error}</span>}
        </div>
      </div>

      {/* preview */}
      <aside className="bg-surface border border-border p-5">
        <div className="mono text-[10px] tracking-widest uppercase text-cyan mb-3">/ preview · {aspect}</div>
        <div
          className={`relative overflow-hidden border border-border-2 ${
            aspect === '9:16' ? 'aspect-[9/16]' : aspect === '1:1' ? 'aspect-square' : 'aspect-video'
          }`}
          style={{
            background:
              selected?.imageUrl
                ? `linear-gradient(180deg, rgba(8,8,8,0.0) 0%, rgba(8,8,8,0.7) 100%), url(${selected.imageUrl})`
                : 'linear-gradient(170deg, #0a1820 0%, #051018 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 p-4 flex flex-col justify-between">
            <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
              / {selected?.styleLabel ?? '—'}
            </span>
            <div className="font-serif italic text-[14px] text-cyan leading-tight max-w-[24ch]">
              «{script.slice(0, 90)}{script.length > 90 ? '…' : ''}»
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-1.5 mono text-[10px] tracking-wider text-text-dim">
          <div className="flex justify-between"><span className="text-text-mute uppercase">voice</span><span>{voice?.label}</span></div>
          <div className="flex justify-between"><span className="text-text-mute uppercase">aspect</span><span>{aspect}</span></div>
          <div className="flex justify-between"><span className="text-text-mute uppercase">bg</span><span>{background}</span></div>
          <div className="flex justify-between"><span className="text-text-mute uppercase">model</span><span>HeyGen {heygenVersion}</span></div>
        </div>
        <p className="mono text-[10px] tracking-widest uppercase text-text-mute mt-3">
          Это набросок. Финальное видео рендерит HeyGen {heygenVersion}.
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
