'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VOICE_PRESETS as HEYGEN_VOICES } from '@/lib/heygen-voices';
import { ELEVENLABS_VOICE_PRESETS } from '@/lib/elevenlabs-voices';
import { MAX_REALISM_MOTION_PROMPT } from '@/lib/heygen-motion';
import {
  VIDEO_ENGINES,
  VIDEO_ENGINE_LIST,
  engineConfig,
  type VideoEngine,
  type EngineAspect,
  type VoiceProvider,
} from '@/lib/video-engines';

const PERSONA_TRAIN_URL =
  process.env.NEXT_PUBLIC_PERSONA_TRAIN_URL ?? 'https://persona-train.46-62-215-11.nip.io';

type Avatar = {
  id: string;
  styleLabel: string;
  style: string;
  imageUrl: string;
};

type VoiceOption = { voice_id: string; label: string; language: string };

const VOICE_CATALOGS: Record<VoiceProvider, VoiceOption[]> = {
  heygen: HEYGEN_VOICES,
  elevenlabs: ELEVENLABS_VOICE_PRESETS,
};

const DEFAULT_SCRIPT =
  'Привет. Это говорит мой цифровой двойник — мой AI-аватар.\n\n' +
  'Я записал пятнадцать минут своего голоса и загрузил одну фотографию — и теперь модель говорит за меня моим же голосом.\n\n' +
  'Знаешь, что меня поразило больше всего? То, что я наконец перестал бояться камеры. Достаточно одной хорошей фотографии — и я снова в эфире.\n\n' +
  'Это не магия. Это новый способ работать.';

const CUSTOM_VOICE_LS_KEY = 'persona-studio:customVoiceId';

export function VideoForm({
  avatars,
  initialAvatarId,
  initialScript,
}: {
  avatars: Avatar[];
  initialAvatarId?: string;
  // Если страница пришла из парсера с уже переписанным сценарием — подставляем
  // его как стартовое значение textarea. Reset-кнопка всё равно возвращает к
  // DEFAULT_SCRIPT, потому что initialScript — одноразовая «подача».
  initialScript?: string;
}) {
  const router = useRouter();
  const [engine, setEngine] = useState<VideoEngine>('heygen-v5');
  // Если URL-параметр avatarId не соответствует ни одному из готовых аватаров
  // (удалён, ещё генерится, или принадлежит другому юзеру) — fallback на первый
  // доступный, чтобы не сабмитить заведомо невалидный id.
  const resolvedInitial =
    initialAvatarId && avatars.some((a) => a.id === initialAvatarId)
      ? initialAvatarId
      : (avatars[0]?.id ?? '');
  const [avatarId, setAvatarId] = useState<string>(resolvedInitial);
  const [script, setScript] = useState(initialScript?.trim() || DEFAULT_SCRIPT);
  const [voiceId, setVoiceId] = useState<string>(HEYGEN_VOICES[0]?.voice_id ?? '');
  const [customVoiceId, setCustomVoiceId] = useState<string>('');
  const [aspect, setAspect] = useState<EngineAspect>('9:16');
  const [quality, setQuality] = useState<'1080p' | '2k'>('2k');
  const [background, setBackground] = useState<string>('#0a0a0a');
  const [subtitles, setSubtitles] = useState(true);
  const [motionPrompt, setMotionPrompt] = useState<string>('');
  const [motionAdvancedOpen, setMotionAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Подхватываем сохранённый custom voice_id из localStorage при монтировании.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CUSTOM_VOICE_LS_KEY);
      if (saved) setCustomVoiceId(saved);
    } catch {
      // ignore
    }
  }, []);

  const cfg = useMemo(() => engineConfig(engine), [engine]);
  const voiceCatalog = VOICE_CATALOGS[cfg.voiceProvider];
  const selected = avatars.find((a) => a.id === avatarId);
  const customActive = cfg.voiceProvider === 'elevenlabs' && customVoiceId.trim().length > 0;
  const effectiveVoiceId = customActive ? customVoiceId.trim() : voiceId;
  const voice = customActive
    ? { voice_id: customVoiceId.trim(), label: 'Custom (IVC)', language: 'ru' }
    : voiceCatalog.find((v) => v.voice_id === voiceId) ?? voiceCatalog[0];

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
    if (!effectiveVoiceId) {
      setError('Выбери голос');
      return;
    }
    setError(null);
    setBusy(true);
    // Save the custom voice_id for next visit.
    if (customActive) {
      try { window.localStorage.setItem(CUSTOM_VOICE_LS_KEY, customVoiceId.trim()); } catch { /* ignore */ }
    }
    try {
      const body: Record<string, unknown> = {
        avatarId,
        engine,
        script,
        voiceId: effectiveVoiceId,
        aspect,
        quality,
        background,
        subtitles,
        language: voice?.language ?? 'ru',
      };
      if (cfg.heygenVersion) body.heygenVersion = cfg.heygenVersion;
      // motion_prompt принимает только Avatar IV; для Avatar V HeyGen его игнорирует
      // (а у нас он переклассифицировал бы видео в IV), поэтому отправляем строго для IV.
      const trimmedMotion = motionPrompt.trim();
      if (cfg.heygenVersion === 'IV' && trimmedMotion.length > 0) {
        body.motionPrompt = trimmedMotion;
      }

      let res: Response;
      try {
        res = await fetch('/api/videos', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (netErr) {
        setError(`network: ${netErr instanceof Error ? netErr.message : String(netErr)}`);
        setBusy(false);
        return;
      }

      // Защищаемся от пустого/HTML-ответа: читаем text, потом пробуем JSON.
      const raw = await res.text();
      let json: { id?: string; error?: string; message?: string; have?: number; need?: number; status?: string } | null = null;
      if (raw) {
        try { json = JSON.parse(raw); } catch { json = null; }
      }

      if (!res.ok || !json || json.error) {
        const code = json?.error;
        const msg =
          code === 'insufficient_tokens'
            ? `Недостаточно токенов: ${json?.have}/${json?.need}`
            : code === 'avatar_not_found'
              ? 'Аватар не найден — выбери другого из списка'
              : code === 'avatar_not_ready'
                ? `Аватар ещё не готов (status: ${json?.status ?? 'unknown'})`
                : code === 'script_required'
                  ? 'Скрипт обязателен (минимум 5 символов)'
                  : code === 'voice_required'
                    ? 'Выбери голос'
                    : code === 'UNAUTHORIZED'
                      ? 'Сессия истекла — перезайди в аккаунт'
                      : code === 'internal_error'
                        ? `Сервер: ${json?.message ?? 'internal_error'}`
                        : code
                          ? code
                          : `HTTP ${res.status}${raw ? `: ${raw.slice(0, 200)}` : ''}`;
        setError(msg);
        setBusy(false);
        return;
      }
      if (!json.id) {
        setError('Сервер вернул пустой ответ без id видео');
        setBusy(false);
        return;
      }
      router.push(`/videos?focus=${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="grid gap-5">
        <Field label="Engine" hint={cfg.description}>
          <select
            className="input"
            value={engine}
            onChange={(e) => {
              const next = e.target.value as VideoEngine;
              setEngine(next);
              const nextCfg = VIDEO_ENGINES[next];
              if (!nextCfg.supportedAspects.includes(aspect)) setAspect(nextCfg.supportedAspects[0]);
              if (nextCfg.voiceProvider !== cfg.voiceProvider) {
                const nextCatalog = VOICE_CATALOGS[nextCfg.voiceProvider];
                setVoiceId(nextCatalog[0]?.voice_id ?? '');
              }
            }}
          >
            {VIDEO_ENGINE_LIST.map((slug) => (
              <option key={slug} value={slug}>
                {VIDEO_ENGINES[slug].label} · {VIDEO_ENGINES[slug].cost} tok
              </option>
            ))}
          </select>
        </Field>

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
            `шаблон оптимизирован под lipsync (~25 сек, естественные паузы, риторический вопрос для вариативности мимики)`
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

        <Field
          label="Voice"
          hint={
            customActive
              ? '↓ используется Custom voice (IVC) — preset из dropdown игнорируется'
              : cfg.voiceProvider === 'heygen'
                ? 'Голос HeyGen + язык'
                : 'ElevenLabs · мультиязык (ru/en)'
          }
        >
          <select
            className="input"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            disabled={customActive}
          >
            {voiceCatalog.map((v) => (
              <option key={v.voice_id} value={v.voice_id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>

        {cfg.voiceProvider === 'elevenlabs' && (
          <Field
            label="Custom voice (IVC)"
            hint={
              <>
                Свой обученный голос из <a href={`${PERSONA_TRAIN_URL}/cabinet`} target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">Persona Train</a>.
                Вставь сюда <code className="mono text-cyan">voice_id</code> — он перебьёт preset выше. Сохраняется локально.
              </>
            }
          >
            <div className="flex gap-2">
              <input
                type="text"
                className="input mono flex-1"
                value={customVoiceId}
                onChange={(e) => setCustomVoiceId(e.target.value)}
                placeholder="elv_xxxxxxxxxxxxxxxxxxxxxxxxx"
                spellCheck={false}
                autoComplete="off"
              />
              {customVoiceId && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setCustomVoiceId('');
                    try { window.localStorage.removeItem(CUSTOM_VOICE_LS_KEY); } catch { /* ignore */ }
                  }}
                  title="Сбросить и вернуться к preset"
                >
                  reset
                </button>
              )}
            </div>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Aspect">
            <select
              className="input"
              value={aspect}
              onChange={(e) => setAspect(e.target.value as EngineAspect)}
            >
              {cfg.supportedAspects.map((a) => (
                <option key={a} value={a}>
                  {a === '9:16' ? '9:16 — Reels / TikTok / Shorts' : a === '1:1' ? '1:1 — Instagram square' : '16:9 — YouTube / Web'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quality" hint="Разрешение рендера (только HeyGen)">
            <select
              className="input"
              value={quality}
              onChange={(e) => setQuality(e.target.value as '1080p' | '2k')}
              disabled={cfg.voiceProvider !== 'heygen'}
            >
              <option value="2k">2K (QHD) — макс. реализм</option>
              <option value="1080p">1080p (FullHD) — быстрее</option>
            </select>
          </Field>
        </div>

        {cfg.voiceProvider === 'heygen' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Background" hint="HEX-цвет фона (только HeyGen)">
              <input
                type="text"
                className="input mono"
                value={background}
                maxLength={9}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="#0a0a0a"
              />
            </Field>
            <Field label="Subtitles" hint="Включить субтитры (только HeyGen)">
              <label className="flex items-center gap-3 input cursor-pointer">
                <input
                  type="checkbox"
                  checked={subtitles}
                  onChange={(e) => setSubtitles(e.target.checked)}
                  className="accent-lime w-4 h-4"
                />
                <span className="mono text-xs tracking-widest uppercase">
                  {subtitles ? 'on' : 'off'}
                </span>
              </label>
            </Field>
          </div>
        )}

        {cfg.heygenVersion === 'IV' && (
          <div className="border border-border">
            <button
              type="button"
              onClick={() => setMotionAdvancedOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 mono text-[10px] tracking-widest uppercase text-text-mute hover:text-cyan"
            >
              <span>/ advanced · motion prompt {motionPrompt.trim() ? '· custom' : '· default'}</span>
              <span>{motionAdvancedOpen ? '−' : '+'}</span>
            </button>
            {motionAdvancedOpen && (
              <div className="px-4 pb-4 space-y-2">
                <p className="mono text-[10px] tracking-wider text-text-dim">
                  Описание движения для Avatar IV motion engine (English).
                  Пусто = использовать дефолт max-realism.
                </p>
                <textarea
                  className="input mono text-[11px] leading-snug w-full min-h-[140px]"
                  value={motionPrompt}
                  onChange={(e) => setMotionPrompt(e.target.value.slice(0, 2000))}
                  placeholder={MAX_REALISM_MOTION_PROMPT}
                  maxLength={2000}
                />
                <div className="flex items-center justify-between mono text-[10px] tracking-widest uppercase">
                  <button
                    type="button"
                    onClick={() => setMotionPrompt(MAX_REALISM_MOTION_PROMPT)}
                    className="text-cyan hover:underline"
                  >
                    insert default
                  </button>
                  {motionPrompt && (
                    <button
                      type="button"
                      onClick={() => setMotionPrompt('')}
                      className="text-pink hover:underline"
                    >
                      reset
                    </button>
                  )}
                  <span className="text-text-mute">{motionPrompt.length}/2000</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Submitting…' : `Generate video · ${cfg.cost} tokens →`}
          </button>
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
            {cfg.label} · voice: {cfg.voiceProvider}
          </span>
          {error && <span className="mono text-[11px] text-pink tracking-wider">/ERROR — {error}</span>}
        </div>
      </div>

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
          <div className="flex justify-between"><span className="text-text-mute uppercase">engine</span><span>{cfg.label}</span></div>
          <div className="flex justify-between">
            <span className="text-text-mute uppercase">voice</span>
            <span className={customActive ? 'text-lime' : ''}>
              {voice?.label}{customActive ? ` · ${customVoiceId.slice(0, 8)}…` : ''}
            </span>
          </div>
          <div className="flex justify-between"><span className="text-text-mute uppercase">aspect</span><span>{aspect}</span></div>
          {cfg.voiceProvider === 'heygen' && (
            <>
              <div className="flex justify-between"><span className="text-text-mute uppercase">quality</span><span>{quality === '2k' ? '2K · QHD' : '1080p · FullHD'}</span></div>
              <div className="flex justify-between"><span className="text-text-mute uppercase">bg</span><span>{background}</span></div>
            </>
          )}
        </div>
        <p className="mono text-[10px] tracking-widest uppercase text-text-mute mt-3">
          {cfg.description}
        </p>
      </aside>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mono text-[10px] tracking-wider text-text-mute mt-1">{hint}</span>}
    </label>
  );
}
