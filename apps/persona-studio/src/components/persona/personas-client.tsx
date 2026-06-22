'use client';

// Модуль A (Мастер-ТЗ §3) — Персоны. First-class сущность: аватар + голос +
// бренд-кит + tone-of-voice. Список персон, создание/редактирование одной
// формой, назначение дефолтной (подставляется в воркспейс генерации S2).
// Данные: /api/personas (GET/POST), /api/personas/:id (PATCH/DELETE).

import { useMemo, useState } from 'react';
import { Plus, Star, Trash2, Pencil, Check, X, Mic, Palette } from 'lucide-react';
import { ELEVENLABS_VOICE_PRESETS } from '@/lib/elevenlabs-voices';
import type {
  PersonaAvatarOption,
  PersonaTone,
  PersonaToneLength,
  PersonaView,
} from '@/lib/studio/types';

// Нейтральный каталог голосов (без бренда провайдера) для пикера персоны.
const VOICE_OPTIONS = ELEVENLABS_VOICE_PRESETS.map((v) => ({ id: v.voice_id, label: v.label }));
const VOICE_PRESET_IDS = new Set(VOICE_OPTIONS.map((v) => v.id));

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
      if (!res.ok) throw new Error(data.error || 'save_failed');
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
    <div className="grid gap-5">
      <header className="flex items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-serif text-2xl text-text">Персоны</h1>
          <p className="mono text-[11px] tracking-widest uppercase text-text-mute">
            аватар · голос · бренд · tone-of-voice
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-2 border border-gold/60 mono text-[10px] tracking-widest uppercase text-gold hover:bg-gold/10"
        >
          <Plus size={13} /> Новая персона
        </button>
      </header>

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
        <div className="border border-border-soft bg-surface p-10 text-center grid gap-2">
          <p className="mono text-[11px] tracking-widest uppercase text-text-mute">
            Пока нет персон
          </p>
          <p className="font-serif text-[13px] text-text-dim">
            Создайте первую персону — она задаст голос, аватар и стиль для всей генерации.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {personas.map((p) => {
            const av = p.avatar ?? (p.avatarId ? avatarById.get(p.avatarId) : null) ?? null;
            const bg = av?.imageThumbUrl || av?.imageUrl;
            return (
              <div
                key={p.id}
                className="relative border border-border bg-surface p-4 grid gap-3"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-14 h-14 shrink-0 border border-border-soft bg-bg"
                    style={
                      bg
                        ? { backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : undefined
                    }
                  />
                  <div className="min-w-0 grid gap-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-serif text-[15px] text-text truncate">{p.name}</h2>
                      {p.isDefault && (
                        <span className="mono text-[8px] tracking-widest uppercase text-gold border border-gold/50 px-1 py-0.5">
                          default
                        </span>
                      )}
                    </div>
                    <p className="mono text-[10px] tracking-widest uppercase text-text-mute">
                      {p.lang.toUpperCase()}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Tag icon={<Mic size={10} />} on={!!p.voiceId} label={p.voiceId ? 'голос' : 'нет голоса'} />
                  <Tag icon={<Palette size={10} />} on={!!p.brand.primary} label="бренд" />
                  {p.tone.length && <Tag label={`tone: ${p.tone.length}`} on />}
                </div>

                {(p.brand.primary || p.brand.accent) && (
                  <div className="flex gap-1">
                    {p.brand.primary && (
                      <span className="w-5 h-5 border border-border-soft" style={{ background: p.brand.primary }} />
                    )}
                    {p.brand.accent && (
                      <span className="w-5 h-5 border border-border-soft" style={{ background: p.brand.accent }} />
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1 border-t border-border-soft mt-1">
                  <button
                    onClick={() => openEdit(p)}
                    className="flex items-center gap-1 mono text-[9px] tracking-widest uppercase text-text-mute hover:text-text"
                  >
                    <Pencil size={11} /> править
                  </button>
                  {!p.isDefault && (
                    <button
                      onClick={() => makeDefault(p)}
                      className="flex items-center gap-1 mono text-[9px] tracking-widest uppercase text-text-mute hover:text-gold"
                    >
                      <Star size={11} /> по умолчанию
                    </button>
                  )}
                  <button
                    onClick={() => remove(p)}
                    className="flex items-center gap-1 mono text-[9px] tracking-widest uppercase text-text-mute hover:text-pink ml-auto"
                  >
                    <Trash2 size={11} /> удалить
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
      className={`flex items-center gap-1 px-1.5 py-0.5 border mono text-[9px] tracking-widest uppercase ${
        on ? 'border-border text-text-dim' : 'border-border-soft text-text-mute'
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

  return (
    <div className="border border-gold/40 bg-surface p-4 grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-[15px] text-text">
          {isNew ? 'Новая персона' : 'Редактирование персоны'}
        </h2>
        <button onClick={onCancel} className="text-text-mute hover:text-text">
          <X size={16} />
        </button>
      </div>

      <Field label="Имя">
        <input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Например: Эксперт по продажам"
          className="w-full bg-bg border border-border px-3 py-2 font-serif text-[14px] text-text placeholder:text-text-mute focus:border-gold outline-none"
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Язык генерации">
          <div className="flex gap-1.5">
            {LANGS.map((l) => (
              <Chip key={l.v} active={form.lang === l.v} onClick={() => set('lang', l.v)}>
                {l.label}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Голос">
          <select
            value={VOICE_PRESET_IDS.has(form.voiceId) ? form.voiceId : ''}
            onChange={(e) => set('voiceId', e.target.value)}
            className="w-full bg-bg border border-border px-3 py-2 font-serif text-[13px] text-text focus:border-gold outline-none"
          >
            <option value="">— выберите голос —</option>
            {VOICE_OPTIONS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <details className="mt-1">
            <summary className="mono text-[9px] tracking-widest uppercase text-text-mute cursor-pointer hover:text-text">
              свой голос (ID)
            </summary>
            <input
              value={VOICE_PRESET_IDS.has(form.voiceId) ? '' : form.voiceId}
              onChange={(e) => set('voiceId', e.target.value)}
              placeholder="ID голоса"
              className="mt-1 w-full bg-bg border border-border px-3 py-2 mono text-[12px] text-text placeholder:text-text-mute focus:border-gold outline-none"
            />
          </details>
        </Field>
      </div>

      <Field label="Аватар (talking-head источник)">
        {avatarOptions.length === 0 ? (
          <p className="mono text-[10px] tracking-widest uppercase text-text-mute">
            Нет готовых аватаров — создайте их в разделе «Аватар»
          </p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => set('avatarId', null)}
              className={`w-14 h-14 border grid place-items-center mono text-[9px] uppercase ${
                form.avatarId === null ? 'border-gold text-gold' : 'border-border-soft text-text-mute'
              }`}
            >
              нет
            </button>
            {avatarOptions.map((a) => {
              const bg = a.imageThumbUrl || a.imageUrl;
              const active = form.avatarId === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => set('avatarId', a.id)}
                  title={a.styleLabel}
                  className={`relative w-14 h-14 border ${active ? 'border-gold' : 'border-border-soft hover:border-border'}`}
                  style={{ backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                >
                  {active && (
                    <span className="absolute inset-0 grid place-items-center bg-black/40">
                      <Check size={16} className="text-gold" />
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
            className="w-full bg-bg border border-border px-3 py-2 mono text-[11px] text-text placeholder:text-text-mute focus:border-gold outline-none"
          />
        </Field>
      </div>

      <Field label="Tone-of-voice — примеры постов (по одному на строку)">
        <textarea
          value={form.examples}
          onChange={(e) => set('examples', e.target.value)}
          rows={3}
          placeholder="Вставьте 1–3 примера ваших текстов — генерация подстроится под стиль"
          className="w-full bg-bg border border-border px-3 py-2 font-serif text-[13px] text-text placeholder:text-text-mute focus:border-gold outline-none resize-y"
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Табу-слова (через запятую)">
          <input
            value={form.taboo}
            onChange={(e) => set('taboo', e.target.value)}
            placeholder="например: дёшево, гарантия, успех"
            className="w-full bg-bg border border-border px-3 py-2 font-serif text-[13px] text-text placeholder:text-text-mute focus:border-gold outline-none"
          />
        </Field>
        <Field label="Длина текста">
          <div className="flex gap-1.5">
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

      <label className="flex items-center gap-2 mono text-[10px] tracking-widest uppercase text-text-dim cursor-pointer">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => set('isDefault', e.target.checked)}
          className="accent-gold"
        />
        Сделать персоной по умолчанию
      </label>

      {error && <p className="mono text-[11px] text-pink">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={busy}
          className="px-5 py-2 border border-gold bg-gold/10 mono text-[10px] tracking-widest uppercase text-gold hover:bg-gold/20 disabled:opacity-50"
        >
          {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
        <button
          onClick={onCancel}
          className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text underline"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="mono text-[9px] tracking-widest uppercase text-text-mute">{label}</span>
      {children}
    </label>
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
      onClick={onClick}
      className={`px-2.5 py-1 border mono text-[10px] tracking-widest uppercase transition-colors ${
        active ? 'border-gold text-gold' : 'border-border text-text-mute hover:border-border'
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
        className="w-9 h-9 bg-bg border border-border p-0.5 cursor-pointer"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        className="flex-1 bg-bg border border-border px-2 py-2 mono text-[11px] text-text placeholder:text-text-mute focus:border-gold outline-none"
      />
    </div>
  );
}
