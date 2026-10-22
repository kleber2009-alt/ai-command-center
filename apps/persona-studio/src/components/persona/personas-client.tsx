'use client';

// Модуль A (Мастер-ТЗ §3) — Персоны. First-class сущность: аватар + голос +
// бренд-кит + tone-of-voice. Список персон, создание/редактирование одной
// формой, назначение дефолтной (подставляется в воркспейс генерации S2).
// Данные: /api/personas (GET/POST), /api/personas/:id (PATCH/DELETE).

import { useEffect, useMemo, useState } from 'react';
import { Plus, Star, Trash2, Pencil, Check, X, Mic, Palette } from 'lucide-react';
import { PageHero } from '@/components/shell/page-hero';
import { Icon3D } from '@/components/ui/icon3d';
import { ELEVENLABS_VOICE_PRESETS } from '@/lib/elevenlabs-voices';
import { VoiceClone } from '@/components/voice/voice-clone';
import type {
  PersonaAvatarOption,
  PersonaTone,
  PersonaToneLength,
  PersonaView,
} from '@/lib/studio/types';
import { errorText } from '@/lib/error-text';

// Нейтральный каталог голосов (без бренда провайдера) для пикера персоны.
const VOICE_OPTIONS = ELEVENLABS_VOICE_PRESETS.map((v) => ({ id: v.voice_id, label: v.label }));

type Props = {
  initialPersonas: PersonaView[];
  avatarOptions: PersonaAvatarOption[];
};

type FormState = {
  name: string;
  avatarId: string | null;
  voiceId: string;
  lang: string;
  primary: string;
  accent: string;
  logoUrl: string;
  examples: string; // одна строка = один пример
  taboo: string; // через запятую
  length: PersonaToneLength | '';
  isDefault: boolean;
};

const EMPTY_FORM: FormState = {
  name: '',
  avatarId: null,
  voiceId: '',
  lang: 'ru',
  primary: '',
  accent: '',
  logoUrl: '',
  examples: '',
  taboo: '',
  length: '',
  isDefault: false,
};

const LANGS = [
  { v: 'ru', label: 'Русский' },
  { v: 'en', label: 'English' },
];
const LENGTHS: Array<{ v: PersonaToneLength; label: string }> = [
  { v: 'short', label: 'Короткие' },
  { v: 'medium', label: 'Средние' },
  { v: 'long', label: 'Длинные' },
];

function personaToForm(p: PersonaView): FormState {
  return {
    name: p.name,
    avatarId: p.avatarId,
    voiceId: p.voiceId ?? '',
    lang: p.lang,
    primary: p.brand.primary ?? '',
    accent: p.brand.accent ?? '',
    logoUrl: p.brand.logoUrl ?? '',
    examples: (p.tone.examples ?? []).join('\n'),
    taboo: (p.tone.taboo ?? []).join(', '),
    length: p.tone.length ?? '',
    isDefault: p.isDefault,
  };
}

function formToPayload(f: FormState) {
  const tone: PersonaTone = {};
  const examples = f.examples
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const taboo = f.taboo
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (examples.length) tone.examples = examples;
  if (taboo.length) tone.taboo = taboo;
  if (f.length) tone.length = f.length;

  const brand: Record<string, string> = {};
  if (f.primary.trim()) brand.primary = f.primary.trim();
  if (f.accent.trim()) brand.accent = f.accent.trim();
  if (f.logoUrl.trim()) brand.logoUrl = f.logoUrl.trim();

  return {
    name: f.name.trim(),
    avatarId: f.avatarId,
    voiceId: f.voiceId.trim() || null,
    lang: f.lang,
    brand,
    tone,
    isDefault: f.isDefault,
  };
}

export function PersonasClient({ initialPersonas, avatarOptions }: Props) {
  const [personas, setPersonas] = useState<PersonaView[]>(initialPersonas);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarById = useMemo(() => {
    const m = new Map<string, PersonaAvatarOption>();
    avatarOptions.forEach((a) => m.set(a.id, a));
    return m;
  }, [avatarOptions]);

  const openNew = () => {
    setForm({ ...EMPTY_FORM, isDefault: personas.length === 0 });
    setEditing('new');
    setError(null);
  };
  const openEdit = (p: PersonaView) => {
    setForm(personaToForm(p));
    setEditing(p.id);
    setError(null);
  };
  const close = () => {
    setEditing(null);
    setError(null);
  };

  async function save() {
    if (!form.name.trim()) {
      setError('Укажите имя персоны');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = formToPayload(form);
      const isNew = editing === 'new';
      const res = await fetch(isNew ? '/api/personas' : `/api/personas/${editing}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(errorText(data, res.status));
      const saved: PersonaView = data.persona;
      setPersonas((prev) => {
        // Если saved дефолтная — снимаем флаг с остальных локально.
        const next = prev.map((p) =>
          saved.isDefault ? { ...p, isDefault: false } : p,
        );
        const idx = next.findIndex((p) => p.id === saved.id);
        if (idx >= 0) next[idx] = saved;
        else next.unshift(saved);
        next.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
        return [...next];
      });
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(p: PersonaView) {
    if (p.isDefault) return;
    setPersonas((prev) =>
      prev
        .map((x) => ({ ...x, isDefault: x.id === p.id }))
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
    );
    await fetch(`/api/personas/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    }).catch(() => {});
  }

  async function remove(p: PersonaView) {
    if (!confirm(`Удалить персону «${p.name}»?`)) return;
    setPersonas((prev) => prev.filter((x) => x.id !== p.id));
    await fetch(`/api/personas/${p.id}`, { method: 'DELETE' }).catch(() => {});
  }

  return (
    <div className="grid gap-6">
      <PageHero
        eyebrow="аватар · голос · бренд · tone-of-voice"
        title="Персоны"
        icon="personas"
        extra={
          <button type="button" onClick={openNew} className="btn-primary">
            <Plus size={16} /> Новая персона
          </button>
        }
      />

      {editing && (
        <PersonaForm
          form={form}
          setForm={setForm}
          avatarOptions={avatarOptions}
          busy={busy}
          error={error}
          isNew={editing === 'new'}
          onSave={save}
          onCancel={close}
        />
      )}

      {personas.length === 0 && !editing ? (
        <div className="panel reveal grid justify-items-center gap-3 p-10 text-center">
          <Icon3D name="personas" size={40} tile sway />
          <p className="text-[17px] font-semibold tracking-[-0.02em] text-text">Пока нет персон</p>
          <p className="max-w-[46ch] text-[14px] leading-relaxed text-text-dim">
            Создайте первую персону — она задаст голос, аватар и стиль для всей генерации.
          </p>
          <button type="button" onClick={openNew} className="btn-primary mt-2">
            <Plus size={16} /> Новая персона
          </button>
        </div>
      ) : (
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((p) => {
            const av = p.avatar ?? (p.avatarId ? avatarById.get(p.avatarId) : null) ?? null;
            const bg = av?.imageThumbUrl || av?.imageUrl;
            return (
              <div key={p.id} className="card-editorial grid gap-4 p-5">
                <div className="flex items-start gap-3.5">
                  <div
                    className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border-soft bg-white/[0.04]"
                    style={
                      bg
                        ? { backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : undefined
                    }
                  >
                    {!bg && <Icon3D name="avatar" size={30} />}
                  </div>
                  <div className="grid min-w-0 gap-1.5">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-text">{p.name}</h2>
                      {p.isDefault && (
                        <span className="rounded-full bg-blue px-2 py-0.5 text-[11px] font-semibold text-white">
                          default
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] font-medium text-text-mute">{p.lang.toUpperCase()}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Tag icon={<Mic size={12} />} on={!!p.voiceId} label={p.voiceId ? 'голос' : 'нет голоса'} />
                  <Tag icon={<Palette size={12} />} on={!!p.brand.primary} label="бренд" />
                  {p.tone.length && <Tag label={`tone: ${p.tone.length}`} on />}
                </div>

                {(p.brand.primary || p.brand.accent) && (
                  <div className="flex gap-1.5">
                    {p.brand.primary && (
                      <span className="h-6 w-6 rounded-full border border-border-2" style={{ background: p.brand.primary }} />
                    )}
                    {p.brand.accent && (
                      <span className="h-6 w-6 rounded-full border border-border-2" style={{ background: p.brand.accent }} />
                    )}
                  </div>
                )}

                <div className="mt-1 flex items-center gap-1 border-t border-border-soft pt-3">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] text-text-dim transition-colors hover:bg-white/[0.06] hover:text-text"
                  >
                    <Pencil size={13} /> править
                  </button>
                  {!p.isDefault && (
                    <button
                      type="button"
                      onClick={() => makeDefault(p)}
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] text-text-dim transition-colors hover:bg-white/[0.06] hover:text-gold"
                    >
                      <Star size={13} /> по умолчанию
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] text-text-mute transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={13} /> удалить
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tag({ label, on, icon }: { label: string; on: boolean; icon?: React.ReactNode }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] ${
        on ? 'border-border-2 bg-white/[0.06] text-text-dim' : 'border-border-soft text-text-mute'
      }`}
    >
      {icon}
      {label}
    </span>
  );
}

function PersonaForm({
  form,
  setForm,
  avatarOptions,
  busy,
  error,
  isNew,
  onSave,
  onCancel,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  avatarOptions: PersonaAvatarOption[];
  busy: boolean;
  error: string | null;
  isNew: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm({ ...form, [k]: v });

  // Свои (склонированные) голоса — нативно из /api/voice/list, без бренда.
  const [cloned, setCloned] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    fetch('/api/voice/list')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.voices)) {
          setCloned(
            d.voices.map((v: { voiceId: string; name: string }) => ({ id: v.voiceId, label: `Мой голос: ${v.name}` })),
          );
        }
      })
      .catch(() => {});
  }, []);
  const allVoices = [...cloned, ...VOICE_OPTIONS];
  const allVoiceIds = new Set(allVoices.map((v) => v.id));

  return (
    <div className="panel reveal grid gap-5 border-gold/40 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon3D name="personas" size={22} tile />
          <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-text">
            {isNew ? 'Новая персона' : 'Редактирование персоны'}
          </h2>
        </div>
        <button type="button" onClick={onCancel} className="btn-icon" aria-label="Закрыть">
          <X size={16} />
        </button>
      </div>

      <Field label="Имя">
        <input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Например: Эксперт по продажам"
          className="input"
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Язык генерации">
          <div className="flex flex-wrap gap-1.5">
            {LANGS.map((l) => (
              <Chip key={l.v} active={form.lang === l.v} onClick={() => set('lang', l.v)}>
                {l.label}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Голос">
          <select
            value={allVoiceIds.has(form.voiceId) ? form.voiceId : ''}
            onChange={(e) => set('voiceId', e.target.value)}
            className="input"
          >
            <option value="">— выберите голос —</option>
            {allVoices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[12px] text-text-mute hover:text-text">
              свой голос (ID)
            </summary>
            <input
              value={allVoiceIds.has(form.voiceId) ? '' : form.voiceId}
              onChange={(e) => set('voiceId', e.target.value)}
              placeholder="ID голоса"
              className="input mt-1.5 font-mono text-[12px]"
            />
          </details>
          <div className="mt-2">
            <VoiceClone
              compact
              onCloned={(v) => {
                setCloned((prev) => [
                  { id: v.voiceId, label: `Мой голос: ${v.name}` },
                  ...prev.filter((x) => x.id !== v.voiceId),
                ]);
                set('voiceId', v.voiceId);
              }}
            />
          </div>
        </Field>
      </div>

      <Field label="Аватар (talking-head источник)">
        {avatarOptions.length === 0 ? (
          <p className="text-[13px] text-text-mute">
            Нет готовых аватаров — создайте их в разделе «Аватар»
          </p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => set('avatarId', null)}
              className={`grid h-14 w-14 place-items-center rounded-2xl border text-[12px] transition-colors ${
                form.avatarId === null
                  ? 'border-transparent bg-blue text-white'
                  : 'border-border-soft bg-white/[0.04] text-text-mute hover:bg-white/[0.07]'
              }`}
            >
              нет
            </button>
            {avatarOptions.map((a) => {
              const bg = a.imageThumbUrl || a.imageUrl;
              const active = form.avatarId === a.id;
              return (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => set('avatarId', a.id)}
                  title={a.styleLabel}
                  className={`relative h-14 w-14 overflow-hidden rounded-2xl border-2 transition-all ${
                    active ? 'border-gold shadow-glow' : 'border-transparent hover:border-border-2'
                  }`}
                  style={{ backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                >
                  {active && (
                    <span className="absolute inset-0 grid place-items-center bg-black/40">
                      <Check size={18} className="text-white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Бренд — основной">
          <ColorInput value={form.primary} onChange={(v) => set('primary', v)} />
        </Field>
        <Field label="Бренд — акцент">
          <ColorInput value={form.accent} onChange={(v) => set('accent', v)} />
        </Field>
        <Field label="Логотип (URL)">
          <input
            value={form.logoUrl}
            onChange={(e) => set('logoUrl', e.target.value)}
            placeholder="https://…"
            className="input"
          />
        </Field>
      </div>

      <Field label="Tone-of-voice — примеры постов (по одному на строку)">
        <textarea
          value={form.examples}
          onChange={(e) => set('examples', e.target.value)}
          rows={3}
          placeholder="Вставьте 1–3 примера ваших текстов — генерация подстроится под стиль"
          className="input"
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Табу-слова (через запятую)">
          <input
            value={form.taboo}
            onChange={(e) => set('taboo', e.target.value)}
            placeholder="например: дёшево, гарантия, успех"
            className="input"
          />
        </Field>
        <Field label="Длина текста">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={form.length === ''} onClick={() => set('length', '')}>
              авто
            </Chip>
            {LENGTHS.map((l) => (
              <Chip key={l.v} active={form.length === l.v} onClick={() => set('length', l.v)}>
                {l.label}
              </Chip>
            ))}
          </div>
        </Field>
      </div>

      <label className="flex cursor-pointer items-center gap-3 text-[14px] text-text-dim">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => set('isDefault', e.target.checked)}
          className="toggle"
        />
        Сделать персоной по умолчанию
      </label>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="button" onClick={onSave} disabled={busy} className="btn-primary">
          {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Отмена
        </button>
      </div>
    </div>
  );
}

// A <div role="group">, not a <label>: several fields hold buttons/chips, and a
// click anywhere inside a <label> is forwarded to its first control (that used
// to reset the avatar to «нет»).
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="grid gap-1.5">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
        active
          ? 'border-transparent bg-blue text-white'
          : 'border-border-soft bg-white/[0.04] text-text-dim hover:bg-white/[0.07]'
      }`}
    >
      {children}
    </button>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-11 shrink-0 cursor-pointer rounded-xl border border-border-soft bg-white/[0.05] p-1"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        className="input flex-1 font-mono text-[12px]"
      />
    </div>
  );
}
