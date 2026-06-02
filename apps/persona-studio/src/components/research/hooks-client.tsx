'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

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
      <section className="border border-border bg-surface p-4 grid gap-3">
        <div className="flex flex-wrap gap-1.5">
          {filterChips.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => {
                setSelected(c.slug);
                load(c.slug, search);
              }}
              className={`px-3 py-1.5 border mono text-[11px] tracking-wider ${
                selected === c.slug
                  ? 'border-gold text-gold bg-gold/10'
                  : 'border-border text-text-dim hover:border-text'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] items-end">
          <div className="grid gap-1">
            <span className="mono text-[9px] tracking-widest uppercase text-text-mute">Поиск</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load(selected, search)}
              placeholder="искать в тексте хука…"
              className="bg-bg border border-border focus:border-gold outline-none px-2 py-1.5 font-serif text-[14px] text-text"
            />
          </div>
          <div className="grid gap-1">
            <span className="mono text-[9px] tracking-widest uppercase text-text-mute">Ниша</span>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="опционально"
              className="bg-bg border border-border focus:border-gold outline-none px-2 py-1.5 font-serif text-[14px] text-text"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowGenModal(true)}
            className="btn-ghost text-[10px] tracking-widest uppercase whitespace-nowrap"
          >
            Сгенерировать
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn-primary text-[10px] tracking-widest uppercase whitespace-nowrap"
          >
            + Добавить хук
          </button>
        </div>
      </section>

      {/* Hooks list */}
      {pending && (
        <div className="mono text-[10px] tracking-widest uppercase text-text-mute">Загружаю…</div>
      )}
      {!pending && hooks.length === 0 && (
        <div className="border border-border-soft bg-surface/50 p-8 text-center">
          <div className="font-serif italic text-[16px] text-text-dim">
            Хуков пока нет. Закажи анализ нескольких рилсов — они появятся здесь автоматически.
          </div>
        </div>
      )}
      {hooks.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
    });
  }
  return (
    <article className="border border-border bg-surface p-4 grid gap-3">
      <div className="flex items-center justify-between">
        <span className="mono text-[9px] tracking-widest uppercase text-cyan">
          {def?.label || hook.formula}
        </span>
        <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
          {hook.origin === 'auto' ? 'из ролика' : hook.origin === 'generated' ? 'AI' : 'своё'}
        </span>
      </div>
      <p className="font-serif text-[15px] leading-snug text-text">«{hook.text}»</p>
      {hook.sourceReel && hook.sourceViews > 0 && (
        <Link
          href={`/research/${hook.sourceReel.id}`}
          className="mono text-[10px] tracking-wider text-gold hover:text-lime flex items-center gap-1"
        >
          🔥 {fmt(hook.sourceViews)} просм. · @{hook.sourceReel.author?.username || '—'} ↗
        </Link>
      )}
      <div className="flex justify-between items-center pt-1 border-t border-border-soft">
        <button
          type="button"
          onClick={copy}
          className="mono text-[9px] tracking-widest uppercase text-text-mute hover:text-lime"
        >
          {copied ? '✓ скопировано' : 'копировать'}
        </button>
        {hook.niche && (
          <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
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
        setError(json.message || json.error || `HTTP ${res.status}`);
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
        <div className="grid gap-1">
          <span className="mono text-[9px] tracking-widest uppercase text-text-mute">Формула</span>
          <select
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            className="bg-bg border border-border px-2 py-1.5 mono text-[11px] text-text"
          >
            <option value="свои">Свои</option>
            {formulas.map((f) => (
              <option key={f.slug} value={f.slug}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
            Текст хука (можно с [переменными в квадратных скобках])
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Например: «А ты знал, что [неожиданный факт]?»"
            className="bg-bg border border-border focus:border-gold outline-none px-2 py-2 font-serif text-[14px] text-text"
          />
        </div>
        <div className="grid gap-1">
          <span className="mono text-[9px] tracking-widest uppercase text-text-mute">Ниша (опц.)</span>
          <input
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="bg-bg border border-border px-2 py-1.5 font-serif text-[14px] text-text"
          />
        </div>
        {error && (
          <div className="border border-pink/40 bg-pink/5 px-2 py-1 mono text-[10px] text-pink">{error}</div>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-ghost text-[10px]">
            Отмена
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || text.length < 5}
            className="btn-primary text-[10px]"
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
        setError(json.message || json.error || `HTTP ${res.status}`);
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
        <p className="font-serif text-[13px] italic text-text-dim">
          Claude напишет по 5 хуков на каждую выбранную формулу. 1 кредит за формулу.
        </p>
        <div className="grid gap-1">
          <span className="mono text-[9px] tracking-widest uppercase text-text-mute">Ниша (опц.)</span>
          <input
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="например: продажи B2B, психология отношений…"
            className="bg-bg border border-border px-2 py-1.5 font-serif text-[14px] text-text"
          />
        </div>
        <div className="grid gap-1">
          <span className="mono text-[9px] tracking-widest uppercase text-text-mute">Формулы</span>
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
            {formulas.map((f) => (
              <button
                key={f.slug}
                type="button"
                onClick={() => toggle(f.slug)}
                className={`px-3 py-1.5 border mono text-[11px] tracking-wider ${
                  selected.has(f.slug)
                    ? 'border-lime text-lime bg-lime/10'
                    : 'border-border text-text-dim hover:border-text'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div className="border border-pink/40 bg-pink/5 px-2 py-1 mono text-[10px] text-pink">{error}</div>
        )}
        <div className="flex items-center justify-between gap-2 pt-2">
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
            Стоимость: <span className="text-gold">{cost} кр.</span>
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost text-[10px]">
              Отмена
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={busy || cost === 0}
              className="btn-primary text-[10px]"
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="border border-border bg-bg max-w-md w-full p-5 grid gap-4"
      >
        <div className="flex justify-between items-center">
          <h3 className="font-serif text-[18px] text-text">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="mono text-[14px] text-text-mute hover:text-text"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
