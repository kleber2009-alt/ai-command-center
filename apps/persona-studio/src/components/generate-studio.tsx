'use client';

import { useMemo, useState } from 'react';
import { UploadZone } from '@/components/upload-zone';
import { AVATAR_STYLES } from '@/lib/styles';
import { NICHES } from '@/lib/niches';
import { Icon3D, type Icon3DName } from '@/components/ui/icon3d';

type Mode = 'default' | 'niche' | 'custom';

type InitialUpload = {
  id: string;
  url: string;
  type: string;
  bytes: number;
  createdAt?: string;
};

const SLOTS = 10;

export function GenerateStudio({ initialUploads, cost }: { initialUploads: InitialUpload[]; cost: number }) {
  const [mode, setMode] = useState<Mode>('default');
  const [nicheSlug, setNicheSlug] = useState<string>(NICHES[0]?.slug ?? '');
  const [customText, setCustomText] = useState<string>('');

  const selectedNiche = useMemo(
    () => NICHES.find((n) => n.slug === nicheSlug) ?? NICHES[0],
    [nicheSlug],
  );

  const customPrompts = useMemo(
    () =>
      customText
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 4)
        .slice(0, SLOTS),
    [customText],
  );

  const extraBody = useMemo<Record<string, unknown>>(() => {
    if (mode === 'niche') return { mode: 'niche', nicheSlug: selectedNiche.slug };
    if (mode === 'custom') return { mode: 'custom', customPrompts };
    return { mode: 'default' };
  }, [mode, selectedNiche.slug, customPrompts]);

  const generateLabel =
    mode === 'custom'
      ? `Создать ${SLOTS} аватаров · свои промпты →`
      : mode === 'niche'
      ? `Создать ${SLOTS} аватаров · ${selectedNiche.label} →`
      : `Создать ${SLOTS} аватаров →`;

  const costHint =
    mode === 'custom' && customPrompts.length === 0
      ? 'Введи хотя бы один промпт (мин. 4 символа)'
      : `Спишется ${cost} токенов · ~3–5 минут`;

  return (
    <div className="grid gap-10">
      <UploadZone
        initialUploads={initialUploads}
        extraBody={extraBody}
        generateLabel={generateLabel}
        costHint={costHint}
      />

      {/* MODE SWITCHER */}
      <section>
        <SecHead num="/01" title="Что сгенерировать" meta={`режим: ${mode === 'default' ? 'базовый' : mode === 'niche' ? 'ниша' : 'свой'}`} />
        <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ModeBtn active={mode === 'default'} onClick={() => setMode('default')}
            icon="sparkles" label="Базовые 10" sub="фирменные режиссёрские стили" />
          <ModeBtn active={mode === 'niche'} onClick={() => setMode('niche')}
            icon="bloggers" label="По нише" sub="20 ниш × 10 паков" />
          <ModeBtn active={mode === 'custom'} onClick={() => setMode('custom')}
            icon="magic" label="Свой промпт" sub="до 10 строк, твой текст" />
        </div>
      </section>

      {/* DEFAULT — 10 fixed styles */}
      {mode === 'default' && (
        <section>
          <SecHead num="/02" title="Базовые · 10 стилей" meta="10 стилей" />
          <div className="stagger grid grid-cols-1 gap-3 md:grid-cols-2">
            {AVATAR_STYLES.map((s, i) => (
              <div key={s.slug} className="panel grid grid-cols-[44px_1fr] items-center gap-4 px-5 py-4">
                <Num i={i} />
                <div>
                  <div className="text-[17px] font-semibold leading-tight tracking-[-0.02em]">{s.label}</div>
                  <div className="mt-1 text-[12px] text-text-mute">{s.description}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* NICHE — 20 niches × 10 packs */}
      {mode === 'niche' && (
        <section className="grid gap-8">
          <div>
            <SecHead num="/02" title="Выбери нишу" meta={`${NICHES.length} ниш`} />
            <div className="flex flex-wrap gap-2">
              {NICHES.map((n) => {
                const active = n.slug === selectedNiche.slug;
                return (
                  <button
                    key={n.slug}
                    type="button"
                    onClick={() => setNicheSlug(n.slug)}
                    className={`rounded-2xl border px-3.5 py-2 text-left transition-colors ${
                      active
                        ? 'border-transparent bg-blue text-white shadow-glow'
                        : 'border-border-soft bg-white/[0.04] text-text hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="text-[13px] font-semibold leading-tight">{n.label}</div>
                    <div className={`mt-0.5 text-[11px] ${active ? 'text-white/75' : 'text-text-mute'}`}>
                      {n.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <SecHead num="/03" title={`${selectedNiche.label} · 10 паков`} meta="10 промптов" />
            <div key={selectedNiche.slug} className="stagger grid grid-cols-1 gap-3 md:grid-cols-2">
              {selectedNiche.prompts.map((p, i) => (
                <div key={p.slug} className="panel grid grid-cols-[44px_1fr] items-start gap-4 px-5 py-4">
                  <Num i={i} />
                  <div>
                    <div className="text-[17px] font-semibold leading-tight tracking-[-0.02em]">{p.label}</div>
                    <div className="mt-1 text-[12px] text-text-mute">{p.description}</div>
                    <div className="mt-2 text-[12px] leading-snug text-text-dim">{p.promptStyle}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CUSTOM — user prompts */}
      {mode === 'custom' && (
        <section className="fade-in">
          <SecHead num="/02" title="Свой промпт" meta={`${customPrompts.length} / ${SLOTS}`} />
          <p className="mb-4 max-w-[70ch] text-[15px] leading-relaxed text-text-dim">
            Опиши на английском <span className="accent-pill text-[13px] font-medium">одежду + место + свет</span> (одна строка = один аватар).
            До {SLOTS} строк. Если меньше — циклически дублируем, чтобы заполнить пачку.
            Блок сохранения лица добавим автоматически — твоё лицо сохранится.
          </p>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            rows={10}
            placeholder={`wearing a navy linen suit, on a sunlit mediterranean terrace, warm golden afternoon light, refined editorial mood.
wearing a black turtleneck, against a deep charcoal backdrop with single rim light, chiaroscuro portrait mood.
...`}
            className="input !font-mono !text-[13px] !leading-relaxed"
          />
          {customPrompts.length > 0 && (
            <div className="mt-3 text-[12px] text-text-mute tabular-nums">
              подходящих строк: {customPrompts.length} · 1..{SLOTS}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SecHead({ num, title, meta }: { num: string; title: string; meta?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="sec-num">{num}</span>
      <span className="sec-title">{title}</span>
      <span className="h-px flex-1 bg-border-soft" />
      {meta && <span className="text-[12px] text-text-mute tabular-nums">{meta}</span>}
    </div>
  );
}

function Num({ i }: { i: number }) {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-[14px] font-extrabold tabular-nums tracking-[-0.02em] text-text-mute">
      {(i + 1).toString().padStart(2, '0')}
    </span>
  );
}

function ModeBtn({
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: Icon3DName;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`card-editorial flex items-center gap-4 px-5 py-4 text-left ${
        active ? '!border-blue !bg-blue/[0.16] shadow-glow' : ''
      }`}
    >
      <Icon3D name={icon} size={26} tile={active ? 'blue' : true} />
      <div className="min-w-0">
        <div className="text-[17px] font-semibold leading-tight tracking-[-0.02em]">{label}</div>
        <div className={`mt-1 text-[12px] ${active ? 'text-text-dim' : 'text-text-mute'}`}>{sub}</div>
      </div>
    </button>
  );
}
