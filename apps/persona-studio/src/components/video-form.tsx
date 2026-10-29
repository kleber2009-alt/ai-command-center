'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronDown, Loader2, RotateCcw } from 'lucide-react';
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
import { errorText, exceptionText } from '@/lib/error-text';
import { statusLabel } from '@/lib/i18n';

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
  initialEngine = 'heygen-v5',
}: {
  avatars: Avatar[];
  /** Engine preselected in the form — the studio default (see defaultEngine()). */
  initialEngine?: VideoEngine;
  initialAvatarId?: string;
  // Если страница пришла из парсера с уже переписанным сценарием — подставляем
  // его как стартовое значение textarea. Reset-кнопка всё равно возвращает к
  // DEFAULT_SCRIPT, потому что initialScript — одноразовая «подача».
  initialScript?: string;
}) {
  const router = useRouter();
  const [engine, setEngine] = useState<VideoEngine>(initialEngine);
  // Если URL-параметр avatarId не соответствует ни одному из готовых аватаров
  // (удалён, ещё генерится, или принадлежит другому юзеру) — fallback на первый
  // доступный, чтобы не сабмитить заведомо невалидный id.
  const resolvedInitial =
    initialAvatarId && avatars.some((a) => a.id === initialAvatarId)
      ? initialAvatarId
      : (avatars[0]?.id ?? '');
  const [avatarId, setAvatarId] = useState<string>(resolvedInitial);
  const [script, setScript] = useState(initialScript?.trim() || DEFAULT_SCRIPT);
  const [voiceId, setVoiceId] = useState<string>(
    VOICE_CATALOGS[VIDEO_ENGINES[initialEngine].voiceProvider][0]?.voice_id ?? '',
  );
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
    ? { voice_id: customVoiceId.trim(), label: 'Свой голос', language: 'ru' }
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
                ? `Аватар ещё не готов (статус: ${statusLabel(json?.status) || 'неизвестен'})`
                : code === 'script_required'
                  ? 'Скрипт обязателен (минимум 5 символов)'
                  : code === 'voice_required'
                    ? 'Выбери голос'
                    : code === 'UNAUTHORIZED'
                      ? 'Сессия истекла — перезайди в аккаунт'
                      : errorText(json, res.status);
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
      setError(exceptionText(e));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
      <div className="panel reveal grid gap-5 p-5 sm:p-6">
        <Field label="Движок" hint={cfg.description}>
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
                {VIDEO_ENGINES[slug].label} · {VIDEO_ENGINES[slug].cost} ток.
              </option>
            ))}
          </select>
        </Field>

        <Field label="Аватар" hint="Лицо, которое будет говорить">
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
          label="Сценарий"
          hint={
            `Текст, который произнесёт аватар · ${script.length}/1500 · ` +
            `шаблон оптимизирован под синхронизацию губ (~25 сек, естественные паузы, риторический вопрос для вариативности мимики)`
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
              className="inline-flex items-center gap-1.5 self-start rounded-full border border-border-soft bg-white/[0.04] px-3.5 py-1.5 text-[13px] text-text-dim transition-colors hover:bg-white/[0.07] hover:text-text disabled:opacity-40 disabled:hover:bg-white/[0.04]"
            >
              <RotateCcw size={13} aria-hidden />
              вернуть реалистичный шаблон
            </button>
          </div>
        </Field>

        <Field
          label="Голос"
          hint={
            customActive
              ? 'используется свой голос — пресет из списка игнорируется'
              : cfg.voiceProvider === 'heygen'
                ? 'Встроенный голос + язык'
                : 'Голос · мультиязык (ru/en)'
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
            label="Свой голос (ID)"
            hint={
              <>
                Свой обученный голос — вставьте <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-cyan">ID</code>, он перебьёт
                выбранный из списка. Сохраняется локально.
              </>
            }
          >
            <div className="flex gap-2">
              <input
                type="text"
                className="input mono flex-1"
                value={customVoiceId}
                onChange={(e) => setCustomVoiceId(e.target.value)}
                placeholder="ID голоса"
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
                  title="Сбросить и вернуться к голосу из списка"
                >
                  сбросить
                </button>
              )}
            </div>
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Формат">
            <select
              className="input"
              value={aspect}
              onChange={(e) => setAspect(e.target.value as EngineAspect)}
            >
              {cfg.supportedAspects.map((a) => (
                <option key={a} value={a}>
                  {a === '9:16' ? '9:16 — Reels / TikTok / Shorts' : a === '1:1' ? '1:1 — квадрат для Instagram' : '16:9 — YouTube / сайт'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Качество" hint="Разрешение рендера (только HeyGen)">
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Фон" hint="HEX-цвет фона (только HeyGen)">
              <input
                type="text"
                className="input mono"
                value={background}
                maxLength={9}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="#0a0a0a"
              />
            </Field>
            <Field label="Субтитры" hint="Включить субтитры (только HeyGen)">
              <span className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-border-soft bg-white/[0.05] px-4 py-[7px]">
                <input
                  type="checkbox"
                  checked={subtitles}
                  onChange={(e) => setSubtitles(e.target.checked)}
                  className="toggle"
                />
                <span className={`text-[13px] font-semibold ${subtitles ? 'text-text' : 'text-text-mute'}`}>
                  {subtitles ? 'вкл' : 'выкл'}
                </span>
              </span>
            </Field>
          </div>
        )}

        {cfg.heygenVersion === 'IV' && (
          <div className="overflow-hidden rounded-[20px] border border-border-soft bg-white/[0.03]">
            <button
              type="button"
              onClick={() => setMotionAdvancedOpen((v) => !v)}
              aria-expanded={motionAdvancedOpen}
              className="flex w-full items-center justify-between px-4 py-3 text-[13px] font-medium text-text-dim transition-colors hover:bg-white/[0.04] hover:text-text"
            >
              <span>/ дополнительно · промпт движения {motionPrompt.trim() ? '· свой' : '· по умолчанию'}</span>
              <ChevronDown size={16} aria-hidden className={`transition-transform duration-300 ease-settle ${motionAdvancedOpen ? 'rotate-180' : ''}`} />
            </button>
            {motionAdvancedOpen && (
              <div className="fade-in space-y-3 px-4 pb-4">
                <p className="text-[12px] text-text-dim">
                  Описание движения для движка Avatar IV (на английском).
                  Пусто = максимально реалистичный вариант по умолчанию.
                </p>
                <textarea
                  className="input !min-h-[140px] w-full !font-mono !text-[12px] !leading-snug"
                  value={motionPrompt}
                  onChange={(e) => setMotionPrompt(e.target.value.slice(0, 2000))}
                  placeholder={MAX_REALISM_MOTION_PROMPT}
                  maxLength={2000}
                />
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <button
                    type="button"
                    onClick={() => setMotionPrompt(MAX_REALISM_MOTION_PROMPT)}
                    className="rounded-full border border-border-soft bg-white/[0.04] px-3.5 py-1.5 text-[13px] text-text-dim hover:bg-white/[0.07] hover:text-text"
                  >
                    вставить по умолчанию
                  </button>
                  {motionPrompt && (
                    <button
                      type="button"
                      onClick={() => setMotionPrompt('')}
                      className="rounded-full border border-pink/30 bg-pink/10 px-3.5 py-1.5 text-[13px] text-pink hover:bg-pink/15"
                    >
                      сбросить
                    </button>
                  )}
                  <span className="ml-auto tabular-nums text-text-mute">{motionPrompt.length}/2000</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {busy ? 'Отправляю…' : `Создать видео · ${cfg.cost} токенов`}
            {!busy && <ArrowRight size={16} aria-hidden />}
          </button>
          <span className="text-[12px] text-text-mute">
            {cfg.label} · голос: {cfg.voiceProvider}
          </span>
          {error && (
            <span className="fade-in w-full rounded-2xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
              Ошибка — {error}
            </span>
          )}
        </div>
      </div>

      <aside className="panel reveal p-5 lg:sticky lg:top-6" style={{ ['--i' as string]: 1 } as React.CSSProperties}>
        <div className="mb-3 flex items-center gap-2">
          <span className="sec-num">/ превью</span>
          <span className="text-[12px] tabular-nums text-text-mute">{aspect}</span>
        </div>
        <div
          className={`relative overflow-hidden rounded-[20px] border border-border-2 transition-[aspect-ratio] ${
            aspect === '9:16' ? 'aspect-[9/16]' : aspect === '1:1' ? 'aspect-square' : 'aspect-video'
          }`}
          style={{
            background:
              selected?.imageUrl
                ? `linear-gradient(180deg, rgba(11,11,13,0) 0%, rgba(11,11,13,0.75) 100%), url(${selected.imageUrl})`
                : 'linear-gradient(170deg, rgba(31,123,255,0.22) 0%, rgba(11,11,13,0.9) 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 p-4 flex flex-col justify-between">
            <span className="self-start rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur-md">
              {selected?.styleLabel ?? '—'}
            </span>
            <div className="max-w-[24ch] text-[14px] font-semibold leading-tight tracking-[-0.01em] text-white">
              «{script.slice(0, 90)}{script.length > 90 ? '…' : ''}»
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-[12px] text-text-dim [&>div]:gap-3">
          <div className="flex justify-between"><span className="text-text-mute">движок</span><span>{cfg.label}</span></div>
          <div className="flex justify-between">
            <span className="text-text-mute">голос</span>
            <span className={customActive ? 'text-lime' : ''}>
              {voice?.label}{customActive ? ` · ${customVoiceId.slice(0, 8)}…` : ''}
            </span>
          </div>
          <div className="flex justify-between"><span className="text-text-mute">формат</span><span>{aspect}</span></div>
          {cfg.voiceProvider === 'heygen' && (
            <>
              <div className="flex justify-between"><span className="text-text-mute">качество</span><span>{quality === '2k' ? '2K · QHD' : '1080p · FullHD'}</span></div>
              <div className="flex justify-between"><span className="text-text-mute">фон</span><span>{background}</span></div>
            </>
          )}
        </div>
        <p className="mt-4 border-t border-border-soft pt-3 text-[12px] leading-relaxed text-text-mute">
          {cfg.description}
        </p>
      </aside>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-0.5 text-[12px] leading-snug text-text-mute">{hint}</span>}
    </label>
  );
}
