'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Check, Copy, Flame, Plus, Sparkles, X } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { errorText } from '@/lib/error-text';

type Hook = {
  id: string;
  text: string;
  formula: string;
  niche: string | null;
  language: string | null;
  sourceViews: number;
  origin: string;
  isCustom: boolean;
  createdAt: string;
  sourceReel: {
    id: string;
    url: string;
    thumbnailUrl: string | null;
    author: { username: string } | null;
  } | null;
};

type FormulaDef = { slug: string; label: string; description: string; template: string };

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
};

export function HooksClient() {
  const [formulas, setFormulas] = useState<FormulaDef[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [selected, setSelected] = useState<string>('all');
  const [niche, setNiche] = useState('');
  const [search, setSearch] = useState('');
  const [pending, startTransition] = useTransition();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);

  // Initial load
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load(formula = selected, q = search) {
    startTransition(async () => {
      const params = new URLSearchParams();
      if (formula !== 'all') params.set('formula', formula);
      if (q) params.set('q', q);
      if (niche) params.set('niche', niche);
      params.set('limit', '80');
      const res = await fetch(`/api/research/hooks?${params}`);
      const json = await res.json();
      if (res.ok) {
        setHooks(json.hooks);
        if (json.formulas) setFormulas(json.formulas);
      }
    });
  }

  const filterChips = [
    { slug: 'all', label: 'Все' },
    ...formulas.map((f) => ({ slug: f.slug, label: f.label })),
    { slug: 'свои', label: 'Свои хуки' },
  ];

  return (
    <div className="grid gap-5">
      {/* Filter chips */}
      <section className="panel p-5 grid gap-4 reveal">
        <div className="flex flex-wrap gap-1.5">
          {filterChips.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => {
                setSelected(c.slug);
                load(c.slug, search);
              }}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
                selected === c.slug
                  ? 'border-transparent bg-blue text-white'
                  : 'border-border-soft bg-white/[0.04] text-text-dim hover:bg-white/[0.07]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_auto_auto] items-end">
          <div className="grid gap-1.5">
            <span className="text-[12px] text-text-mute">Поиск</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load(selected, search)}
              placeholder="искать в тексте хука…"
              className="input"
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-[12px] text-text-mute">Ниша</span>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="опционально"
              className="input"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowGenModal(true)}
            className="btn-ghost"
          >
            <Sparkles className="h-4 w-4" />
            Сгенерировать
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            Добавить хук
          </button>
        </div>
      </section>

      {/* Hooks list */}
      {pending && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-40 !rounded-[24px]" />)}
        </div>
      )}
      {!pending && hooks.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-8 flex flex-col items-center gap-3 text-center fade-in">
          <Icon3D name="hooks" size={40} tile />
          <div className="text-[15px] text-text-dim max-w-prose">
            Хуков пока нет. Закажи анализ нескольких рилсов — они появятся здесь автоматически.
          </div>
        </div>
      )}
      {hooks.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
          {hooks.map((h) => (
            <HookCard key={h.id} hook={h} formulas={formulas} />
          ))}
        </section>
      )}

      {showAddModal && (
        <AddHookModal
          formulas={formulas}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            load();
          }}
        />
      )}
      {showGenModal && (
        <GenerateHooksModal
          formulas={formulas}
          defaultNiche={niche}
          onClose={() => setShowGenModal(false)}
          onDone={() => {
            setShowGenModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function HookCard({ hook, formulas }: { hook: Hook; formulas: FormulaDef[] }) {
  const def = formulas.find((f) => f.slug === hook.formula);
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(hook.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      // Clipboard can be denied (insecure context, in-app browsers) — nothing to show.
    });
  }
  return (
    <article className="card-editorial p-5 grid gap-3 content-start">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-cyan/[0.1] px-2.5 py-0.5 text-[12px] font-medium text-cyan">
          {def?.label || hook.formula}
        </span>
        <span className="text-[12px] text-text-mute">
          {hook.origin === 'auto' ? 'из ролика' : hook.origin === 'generated' ? 'AI' : 'своё'}
        </span>
      </div>
      <p className="text-[15.5px] font-medium leading-snug tracking-[-0.01em] text-text">«{hook.text}»</p>
      {hook.sourceReel && hook.sourceViews > 0 && (
        <Link
          href={`/research/${hook.sourceReel.id}`}
          className="inline-flex items-center gap-1 text-[12.5px] tabular-nums text-gold transition-colors hover:text-lime"
        >
          <Flame className="h-3.5 w-3.5" />
          {fmt(hook.sourceViews)} просм. · @{hook.sourceReel.author?.username || '—'}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}
      <div className="flex justify-between items-center pt-2.5 border-t border-border-soft">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 -ml-2 text-[12px] text-text-mute transition-colors hover:bg-white/[0.05] hover:text-lime"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'скопировано' : 'копировать'}
        </button>
        {hook.niche && (
          <span className="text-[12px] text-text-mute">
            ниша: {hook.niche}
          </span>
        )}
      </div>
    </article>
  );
}

function AddHookModal({
  formulas,
  onClose,
  onSaved,
}: {
  formulas: FormulaDef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState('');
  const [formula, setFormula] = useState('свои');
  const [niche, setNiche] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/research/hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, formula, niche: niche || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(errorText(json, res.status));
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Добавить свой хук" onClose={onClose}>
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <span className="text-[12px] text-text-mute">Формула</span>
          <select
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            className="input"
          >
            <option value="свои">Свои</option>
            {formulas.map((f) => (
              <option key={f.slug} value={f.slug}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <span className="text-[12px] text-text-mute">
            Текст хука (можно с [переменными в квадратных скобках])
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Например: «А ты знал, что [неожиданный факт]?»"
            className="input"
          />
        </div>
        <div className="grid gap-1.5">
          <span className="text-[12px] text-text-mute">Ниша (опц.)</span>
          <input
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="input"
          />
        </div>
        {error && (
          <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-3.5 py-2 text-[13px] text-pink">{error}</div>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-ghost !px-4 !py-2 !text-[13px]">
            Отмена
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || text.length < 5}
            className="btn-primary !px-4 !py-2 !text-[13px]"
          >
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function GenerateHooksModal({
  formulas,
  defaultNiche,
  onClose,
  onDone,
}: {
  formulas: FormulaDef[];
  defaultNiche: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [niche, setNiche] = useState(defaultNiche);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cost = selected.size; // 1 cr / formula

  function toggle(slug: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function generate() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/research/hooks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formulas: Array.from(selected),
          niche: niche || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(errorText(json, res.status));
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Сгенерировать хуки" onClose={onClose}>
      <div className="grid gap-3">
        <p className="text-[13.5px] text-text-dim">
          Claude напишет по 5 хуков на каждую выбранную формулу. 1 кредит за формулу.
        </p>
        <div className="grid gap-1.5">
          <span className="text-[12px] text-text-mute">Ниша (опц.)</span>
          <input
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="например: продажи B2B, психология отношений…"
            className="input"
          />
        </div>
        <div className="grid gap-1.5">
          <span className="text-[12px] text-text-mute">Формулы</span>
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
            {formulas.map((f) => (
              <button
                key={f.slug}
                type="button"
                onClick={() => toggle(f.slug)}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
                  selected.has(f.slug)
                    ? 'border-lime/50 bg-lime/[0.12] text-lime'
                    : 'border-border-soft bg-white/[0.04] text-text-dim hover:bg-white/[0.07]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-3.5 py-2 text-[13px] text-pink">{error}</div>
        )}
        <div className="flex items-center justify-between gap-2 pt-2">
          <span className="text-[13px] text-text-mute">
            Стоимость: <span className="font-semibold tabular-nums text-gold">{cost} кр.</span>
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost !px-4 !py-2 !text-[13px]">
              Отмена
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={busy || cost === 0}
              className="btn-primary !px-4 !py-2 !text-[13px]"
            >
              {busy ? 'Генерирую…' : `Сгенерировать (${cost} кр.)`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel !bg-surface/95 shadow-glass max-w-md w-full p-6 grid gap-4 pop-in"
      >
        <div className="flex justify-between items-center">
          <h3 className="flex items-center gap-3 text-[18px] font-semibold tracking-[-0.02em] text-text"><Icon3D name="hooks" size={22} tile />{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="btn-icon !h-8 !w-8 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
    </Portal>
  );
}

// Overlays render into <body>: an animated ancestor (filter/transform) would
// otherwise become the containing block for `position: fixed`.
function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}
