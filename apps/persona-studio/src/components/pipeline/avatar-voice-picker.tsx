'use client';

// «Аватар и голос»: looks and voices from the owner's HeyGen account
// (GET /api/heygen/avatars, /api/heygen/voices). Own avatars/clones first,
// Russian voices first; preview video on hover, voice sample on «play».

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Pause, Play, RefreshCw, Search, User } from 'lucide-react';
import { errorText, exceptionText } from '@/lib/error-text';
import type { HeygenAvatarItem, HeygenVoiceItem } from '@/lib/heygen-account';

export type PickedAvatar = { id: string; name: string; image: string | null; defaultVoiceId: string | null };
export type PickedVoice = { id: string; name: string };

type TypeFilter = 'all' | 'digital_twin' | 'photo_avatar' | 'studio_avatar';
type LangFilter = 'ru' | 'en' | 'all';

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'digital_twin', label: 'Цифровые двойники' },
  { key: 'photo_avatar', label: 'Фото-аватары' },
  { key: 'studio_avatar', label: 'Студийные' },
];

const LANG_TABS: { key: LangFilter; label: string }[] = [
  { key: 'ru', label: 'Русские' },
  { key: 'en', label: 'Английские' },
  { key: 'all', label: 'Все' },
];

function Tabs<K extends string>({ items, value, onChange }: { items: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist">
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
            value === t.key ? 'border-transparent bg-blue text-white' : 'border-border-soft bg-white/[0.04] text-text-dim hover:text-text'
          }`}
        >
          {t.label}
          {t.count != null && <span className="ml-1 tabular-nums opacity-70">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

function AvatarCard({ a, active, onPick }: { a: HeygenAvatarItem; active: boolean; onPick: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [imgOk, setImgOk] = useState(true);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      onMouseEnter={() => ref.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const v = ref.current;
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      }}
      className={`group relative overflow-hidden rounded-xl border bg-[#141416] text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 ${
        active ? 'border-gold shadow-[0_0_0_1px_var(--blue-bright),0_14px_32px_rgba(31,123,255,0.22)]' : 'border-white/10 hover:border-white/25'
      }`}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-[#1c1c1f]">
        {a.previewImage && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.previewImage} alt="" loading="lazy" onError={() => setImgOk(false)} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-text-mute">
            <User size={28} />
          </span>
        )}
        {a.previewVideo && (
          <video
            ref={ref}
            src={a.previewVideo}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          />
        )}
        {active && (
          <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-blue text-white shadow-lg">
            <Check size={15} strokeWidth={3} />
          </span>
        )}
        {!a.private && (
          <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] text-text-dim">из библиотеки</span>
        )}
      </div>
      <div className="grid gap-0.5 px-3 py-2.5">
        <span className="truncate text-[13px] font-medium text-text">{a.name}</span>
        <span className="truncate text-[11px] text-text-mute">
          {a.typeLabel}
          {a.engine === 'avatar_v' ? ' · Avatar V' : a.engine === 'avatar_iv' ? ' · Avatar IV' : ''}
        </span>
      </div>
    </button>
  );
}

export function AvatarVoicePicker({
  avatar,
  voice,
  onAvatar,
  onVoice,
}: {
  avatar: PickedAvatar | null;
  voice: PickedVoice | null;
  onAvatar: (a: PickedAvatar) => void;
  onVoice: (v: PickedVoice) => void;
}) {
  const [avatars, setAvatars] = useState<HeygenAvatarItem[] | null>(null);
  const [voices, setVoices] = useState<HeygenVoiceItem[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPublic, setShowPublic] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [avatarQuery, setAvatarQuery] = useState('');
  const [voiceQuery, setVoiceQuery] = useState('');
  const [lang, setLang] = useState<LangFilter>('ru');
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async (fresh: boolean, withPublic: boolean) => {
    setLoading(true);
    setLoadErr(null);
    try {
      const q = (extra: string) => `${fresh ? 'fresh=1' : ''}${extra}`;
      const [ra, rv] = await Promise.all([
        fetch(`/api/heygen/avatars?${q(withPublic ? '&public=1' : '')}`),
        fetch(`/api/heygen/voices?${q('')}`),
      ]);
      const [da, dv] = await Promise.all([ra.json().catch(() => ({})), rv.json().catch(() => ({}))]);
      if (!ra.ok) throw new Error(errorText(da, ra.status));
      if (!rv.ok) throw new Error(errorText(dv, rv.status));
      setAvatars(da.avatars ?? []);
      setVoices(dv.voices ?? []);
    } catch (e) {
      setLoadErr(exceptionText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false, false);
    return () => audioRef.current?.pause();
  }, [load]);

  const typeCounts = useMemo(() => {
    const c: Record<TypeFilter, number> = { all: 0, digital_twin: 0, photo_avatar: 0, studio_avatar: 0 };
    for (const a of avatars ?? []) {
      c.all++;
      c[a.type]++;
    }
    return c;
  }, [avatars]);

  const shownAvatars = useMemo(() => {
    const q = avatarQuery.trim().toLowerCase();
    return (avatars ?? []).filter(
      (a) => (typeFilter === 'all' || a.type === typeFilter) && (!q || a.name.toLowerCase().includes(q)),
    );
  }, [avatars, typeFilter, avatarQuery]);

  const shownVoices = useMemo(() => {
    const q = voiceQuery.trim().toLowerCase();
    return (voices ?? []).filter(
      (v) =>
        // own clones are always listed — their language is often 'unknown'
        (lang === 'all' || v.private || v.lang === lang || v.lang === 'multi') &&
        (!q || v.name.toLowerCase().includes(q) || v.language.toLowerCase().includes(q)),
    );
  }, [voices, lang, voiceQuery]);

  function pickAvatar(a: HeygenAvatarItem) {
    onAvatar({ id: a.id, name: a.name, image: a.previewImage, defaultVoiceId: a.defaultVoiceId });
    // a look's own voice is a good default when nothing is chosen yet
    if (!voice && a.defaultVoiceId) {
      const v = voices?.find((x) => x.id === a.defaultVoiceId);
      if (v) onVoice({ id: v.id, name: v.name });
    }
  }

  function togglePlay(v: HeygenVoiceItem) {
    if (!v.previewAudio) return;
    const a = audioRef.current ?? new Audio();
    audioRef.current = a;
    if (playing === v.id) {
      a.pause();
      setPlaying(null);
      return;
    }
    a.pause();
    a.src = v.previewAudio;
    a.onended = () => setPlaying(null);
    a.play().then(() => setPlaying(v.id)).catch(() => setPlaying(null));
  }

  if (loadErr) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/40 p-4 text-[13px] text-danger">
        {loadErr}
        <button type="button" onClick={() => load(true, showPublic)} className="btn-ghost ml-auto !px-3.5 !py-1.5 text-[13px]">
          <RefreshCw size={14} /> Повторить
        </button>
      </div>
    );
  }
  if (!avatars || !voices) {
    return (
      <div className="flex items-center gap-2 text-[14px] text-text-dim">
        <Loader2 size={15} className="animate-spin text-gold" /> Загружаем аватары и голоса из HeyGen…
      </div>
    );
  }

  return (
    <div className="grid gap-7">
      {/* Avatars */}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-medium text-text">Аватар</h3>
          {avatar && <span className="truncate text-[13px] text-text-mute">выбран: {avatar.name}</span>}
          <button
            type="button"
            onClick={() => load(true, showPublic)}
            disabled={loading}
            className="btn-ghost ml-auto !px-3 !py-1.5 text-[12px]"
            title="Обновить список из HeyGen"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Обновить
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            items={TYPE_TABS.filter((t) => t.key === 'all' || typeCounts[t.key] > 0).map((t) => ({ ...t, count: typeCounts[t.key] }))}
            value={typeFilter}
            onChange={setTypeFilter}
          />
          <label className="relative ml-auto w-full sm:w-56">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-mute" />
            <input
              value={avatarQuery}
              onChange={(e) => setAvatarQuery(e.target.value)}
              placeholder="Поиск по имени"
              aria-label="Поиск аватара"
              className="input !py-2 !pl-9 text-[13px]"
            />
          </label>
        </div>
        {shownAvatars.length === 0 ? (
          <p className="text-[13px] text-text-mute">
            {avatars.length === 0 ? 'В аккаунте HeyGen пока нет своих аватаров.' : 'Ничего не нашлось.'}
          </p>
        ) : (
          <div className="grid max-h-[560px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-5">
            {shownAvatars.map((a) => (
              <AvatarCard key={a.id} a={a} active={avatar?.id === a.id} onPick={() => pickAvatar(a)} />
            ))}
          </div>
        )}
        {!showPublic && (
          <button
            type="button"
            onClick={() => {
              setShowPublic(true);
              void load(false, true);
            }}
            className="justify-self-start text-[12px] text-text-mute underline-offset-2 hover:text-text hover:underline"
          >
            Показать и аватары из библиотеки HeyGen
          </button>
        )}
      </div>

      {/* Voices */}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-medium text-text">Голос</h3>
          {voice && <span className="truncate text-[13px] text-text-mute">выбран: {voice.name}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs items={LANG_TABS} value={lang} onChange={setLang} />
          <label className="relative ml-auto w-full sm:w-56">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-mute" />
            <input
              value={voiceQuery}
              onChange={(e) => setVoiceQuery(e.target.value)}
              placeholder="Поиск голоса"
              aria-label="Поиск голоса"
              className="input !py-2 !pl-9 text-[13px]"
            />
          </label>
        </div>
        <ul className="grid max-h-[360px] gap-1.5 overflow-y-auto pr-1">
          {shownVoices.map((v) => {
            const active = voice?.id === v.id;
            return (
              <li key={v.id}>
                <div
                  className={`flex items-center gap-3 rounded-2xl border px-3 py-2 transition-colors ${
                    active ? 'border-gold bg-blue/10' : 'border-border-soft bg-white/[0.02] hover:border-white/25'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => togglePlay(v)}
                    disabled={!v.previewAudio}
                    aria-label={playing === v.id ? `Остановить «${v.name}»` : `Прослушать «${v.name}»`}
                    title={v.previewAudio ? '' : 'Нет образца'}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border-soft text-text-dim hover:text-text disabled:opacity-30"
                  >
                    {playing === v.id ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <button type="button" onClick={() => onVoice({ id: v.id, name: v.name })} aria-pressed={active} className="grid min-w-0 flex-1 text-left">
                    <span className="truncate text-[13px] font-medium text-text">{v.name}</span>
                    <span className="truncate text-[11px] text-text-mute">
                      {[v.private ? 'ваш клон' : 'библиотека', v.language, v.gender === 'male' ? 'мужской' : v.gender === 'female' ? 'женский' : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                  {active && <Check size={16} className="shrink-0 text-gold" />}
                </div>
              </li>
            );
          })}
          {shownVoices.length === 0 && <li className="text-[13px] text-text-mute">Ничего не нашлось.</li>}
        </ul>
      </div>
    </div>
  );
}
