// Рендер слайда в скилл-стиле (karusel) через satori-дерево.
//
// Раскладка повторяет carousel-project/src/carousel/Carousel.tsx скилла karusel:
//   - шапка: аватар-кружок + @ник слева, счётчик «3/9» справа (top 170 → у нас 64);
//   - низ: прогресс-бар + «листай →» (на последнем слайде стрелки нет);
//   - cover: плашка-кикер `[гайд]`, огромный заголовок с *акцентом* (авто-ужатие
//     по длине и самому длинному слову), подзаголовок-польза, фото снизу;
//   - reveal: крупный номер 01/02 цветом акцента, заголовок 80px, body или пара
//     «✕ антипример → ✓ пример», скрин в карточке;
//   - cta: «пиши «СЛОВО»» со словом на плашке + «сохрани, чтобы не потерять».
//
// Акцент `*слово*` рисуется по правилам accentCss из скилла: цвет / свечение /
// плашка / курсив / маркер; при слабом контрасте с фоном — автозамена на плашку.

import {
  applyCase,
  contrast,
  parseAccents,
  stripAccents,
  type SkillStyle,
} from '@/lib/skills/styles';

type Node = {
  type: string;
  props: Record<string, unknown> & { style?: Record<string, unknown>; children?: unknown };
};

const el = (
  type: string,
  style: Record<string, unknown>,
  children?: Node | Node[] | string,
  extra?: Record<string, unknown>,
): Node => ({ type, props: { style, children, ...(extra ?? {}) } });

export type SkillSlideInput = {
  index: number; // 1-based
  total: number;
  kind: 'cover' | 'reveal' | 'cta';
  title: string;
  body: string;
  avatarDataUri?: string;
  mediaDataUri?: string;
  handle?: string;
  width: number;
  height: number;
};

const SIDE = 84;

// Ширина глифа относительно кегля — для оценки переносов при авто-ужатии.
function glyphFactor(font: string, upper: boolean): number {
  const base = font.startsWith('Unbounded')
    ? 0.9
    : font.startsWith('Oswald')
      ? 0.48
      : font.startsWith('JetBrains')
        ? 0.64
        : font.startsWith('Playfair') || font.startsWith('Cormorant')
          ? 0.56
          : font.startsWith('Montserrat 900')
            ? 0.76
            : font.startsWith('Montserrat') || font.startsWith('Nunito')
              ? 0.7
              : 0.62;
  return upper ? base * 1.15 : base;
}

/** Кегль, при котором текст влезает в maxLines строк ширины boxW. */
function fitSize(text: string, opts: { max: number; min: number; boxW: number; maxLines: number; k: number }): number {
  const plain = stripAccents(text).trim();
  const longest = Math.max(1, ...plain.split(/\s+/).map((w) => w.length));
  const byWord = opts.boxW / (longest * opts.k);
  // строк ≈ len·k·size / boxW (+15% на переносы по словам) ≤ maxLines
  const byLines = (opts.boxW * opts.maxLines) / (Math.max(1, plain.length) * opts.k * 1.15);
  return Math.round(Math.max(opts.min, Math.min(opts.max, byWord, byLines)));
}

type Surface = { bg: string; ink: string; dark: boolean };

function surfaceFor(s: SkillStyle, kind: SkillSlideInput['kind']): Surface {
  const dark = kind === 'cover' ? s.coverDark : kind === 'cta' ? s.ctaDark : s.revealDark;
  return dark ? { bg: s.darkBg, ink: s.inkOnDark, dark } : { bg: s.lightBg, ink: s.ink, dark };
}

/** Стиль акцентного куска по правилам скилла. */
function accentCss(s: SkillStyle, surf: Surface, size: number): Record<string, unknown> {
  const c = contrast(s.accent, surf.bg);
  const box = {
    backgroundColor: s.accent,
    color: s.accentInk,
    padding: `0 ${Math.round(size * 0.12)}px`,
    borderRadius: Math.round(size * 0.12),
  };
  switch (s.accentMode) {
    case 'italic':
      return {
        fontFamily: s.accentFont ?? s.titleFont,
        color: c >= 2.4 ? s.accent : surf.ink,
      };
    case 'highlight':
      if (surf.dark) return { color: s.accent };
      return { backgroundImage: `linear-gradient(transparent 58%, ${s.accent} 58%)`, padding: '0 6px' };
    case 'box':
      return s.id === 'sticker' ? { ...box, transform: 'rotate(-1.5deg)' } : box;
    case 'glow':
      if (c < 2.4) return box;
      return { color: s.accent, textShadow: `0 0 34px ${s.accent}88` };
    case 'color':
    default:
      return c < 2.4 ? box : { color: s.accent };
  }
}

/** Текст с разметкой *акцента* → дерево слов с переносом. */
function rich(
  s: SkillStyle,
  surf: Surface,
  text: string,
  o: { font: string; size: number; lineHeight: number; color?: string; caseMode?: SkillStyle['titleCase']; plate?: string },
): Node {
  const lines = parseAccents(applyCase(text, o.caseMode ?? 'none'));
  const acc = accentCss(s, surf, o.size);
  return el(
    'div',
    { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: o.plate ? 10 : 0 },
    lines.map((parts) => {
      // Группы «слово + прилипшая пунктуация»: `*промптов*,` не должно
      // отрываться запятой на новую позицию. Кусок, начинающийся без пробела,
      // приклеивается к предыдущей группе.
      const groups: { text: string; accent: boolean }[][] = [];
      let prevEndsSpace = true;
      for (const p of parts) {
        const tokens = p.text.split(/(\s+)/);
        let glue = !prevEndsSpace && !/^\s/.test(p.text) && groups.length > 0;
        prevEndsSpace = /\s$/.test(p.text);
        for (const tk of tokens) {
          if (!tk) continue;
          if (/^\s+$/.test(tk)) {
            glue = false;
            continue;
          }
          if (glue) groups[groups.length - 1].push({ text: tk, accent: p.accent });
          else groups.push([{ text: tk, accent: p.accent }]);
          glue = false;
        }
      }
      const words: Node[] = groups.map((g) =>
        el(
          'span',
          { display: 'flex', marginRight: Math.round(o.size * 0.26) },
          g.map((piece) => el('span', { display: 'flex', ...(piece.accent ? acc : {}) }, piece.text)),
        ),
      );
      return el(
        'div',
        {
          display: 'flex',
          flexWrap: 'wrap',
          fontFamily: o.font,
          fontSize: o.size,
          lineHeight: o.lineHeight,
          color: o.plate ? '#FFFFFF' : (o.color ?? surf.ink),
          ...(o.plate
            ? { backgroundColor: o.plate, padding: `${Math.round(o.size * 0.08)}px ${Math.round(o.size * 0.22)}px`, borderRadius: 8 }
            : {}),
        },
        words,
      );
    }),
  );
}

function backdrop(s: SkillStyle, surf: Surface, w: number, h: number): Node[] {
  const line = surf.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.065)';
  const layers: Node[] = [];
  if (s.pattern === 'grid') {
    layers.push(
      el('div', {
        position: 'absolute', top: 0, left: 0, width: w, height: h, display: 'flex',
        backgroundImage: `linear-gradient(${line} 2px, transparent 2px), linear-gradient(90deg, ${line} 2px, transparent 2px)`,
        backgroundSize: '44px 44px',
      }),
    );
  }
  if (s.pattern === 'stars' || (s.pattern === 'grid' && surf.dark)) {
    // детерминированные «звёзды» — без рандома, чтобы ре-рендер не дёргал картинку
    for (let i = 0; i < 28; i++) {
      const x = (i * 389) % w;
      const y = (i * 677 + 131) % h;
      const r = 2 + (i % 3);
      layers.push(
        el('div', {
          position: 'absolute', left: x, top: y, width: r, height: r, borderRadius: r,
          backgroundColor: i % 5 === 0 ? s.accent : 'rgba(255,255,255,0.55)', display: 'flex',
        }),
      );
    }
  }
  if (s.pattern === 'grain' || s.pattern === 'wallpaper' || surf.dark) {
    const glow =
      s.pattern === 'wallpaper' && surf.dark
        ? 'radial-gradient(circle at 20% 15%, rgba(120,70,220,0.55), transparent 55%), radial-gradient(circle at 85% 90%, rgba(58,168,240,0.45), transparent 55%)'
        : `radial-gradient(circle at 80% 0%, ${s.accent}22, transparent 60%)`;
    layers.push(el('div', { position: 'absolute', top: 0, left: 0, width: w, height: h, display: 'flex', backgroundImage: glow }));
  }
  return layers;
}

function header(s: SkillStyle, surf: Surface, input: SkillSlideInput): Node {
  const handle = input.handle ? `@${input.handle.replace(/^@/, '')}` : '';
  return el(
    'div',
    {
      position: 'absolute', top: 64, left: SIDE, right: SIDE, display: 'flex',
      justifyContent: 'space-between', alignItems: 'center',
      fontFamily: s.bodyFont, fontSize: 28, color: surf.dark ? 'rgba(255,255,255,0.75)' : s.mute,
    },
    [
      el('div', { display: 'flex', alignItems: 'center', gap: 16 }, [
        ...(input.avatarDataUri && input.kind !== 'cover'
          ? [el('img', { width: 56, height: 56, borderRadius: 56, objectFit: 'cover' }, undefined, { src: input.avatarDataUri })]
          : []),
        el('div', { display: 'flex' }, handle),
      ]),
      el('div', { display: 'flex', fontFamily: s.monoFont, fontSize: 26 }, `${input.index}/${input.total}`),
    ],
  );
}

function footer(s: SkillStyle, surf: Surface, input: SkillSlideInput): Node {
  const w = input.width - SIDE * 2;
  const last = input.index >= input.total;
  const track = surf.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
  const fill = contrast(s.accent, surf.bg) < 1.6 ? surf.ink : s.accent;
  return el(
    'div',
    { position: 'absolute', bottom: 64, left: SIDE, right: SIDE, display: 'flex', alignItems: 'center', gap: 28 },
    [
      el('div', { display: 'flex', flex: 1, height: 6, borderRadius: 6, backgroundColor: track }, [
        el('div', { display: 'flex', width: Math.round(((w - 200) * input.index) / input.total), height: 6, borderRadius: 6, backgroundColor: fill }),
      ]),
      el(
        'div',
        { display: 'flex', fontFamily: s.bodyFont, fontSize: 28, color: surf.dark ? 'rgba(255,255,255,0.75)' : s.mute, width: 160, justifyContent: 'flex-end' },
        last ? '' : 'листай →',
      ),
    ],
  );
}

function frame(s: SkillStyle, surf: Surface, input: SkillSlideInput, content: Node[]): Node {
  return el(
    'div',
    { position: 'relative', width: input.width, height: input.height, display: 'flex', backgroundColor: surf.bg },
    [...backdrop(s, surf, input.width, input.height), ...content, header(s, surf, input), footer(s, surf, input)],
  );
}

// ── cover ──────────────────────────────────────────────────────────────
function cover(s: SkillStyle, input: SkillSlideInput): Node {
  const surf = surfaceFor(s, 'cover');
  const kick = /^\s*\[([^\]]{1,40})\]\s*/.exec(input.title);
  const title = kick ? input.title.slice(kick[0].length) : input.title;
  const boxW = input.width - SIDE * 2;
  const hasPhoto = Boolean(input.avatarDataUri);
  const size = fitSize(title, {
    max: 150, min: 64, boxW, maxLines: hasPhoto ? 4 : 6,
    k: glyphFactor(s.titleFont, s.titleCase === 'upper'),
  });

  const photo: Node[] = hasPhoto
    ? [
        el('img', { position: 'absolute', left: 0, bottom: 0, width: input.width, height: Math.round(input.height * 0.62), objectFit: 'cover' }, undefined, { src: input.avatarDataUri! }),
        el('div', {
          position: 'absolute', left: 0, bottom: 0, width: input.width, height: Math.round(input.height * 0.62), display: 'flex',
          backgroundImage: `linear-gradient(to bottom, ${surf.bg} 0%, ${surf.bg}00 38%, ${surf.bg}00 70%, ${surf.bg}CC 100%)`,
        }),
      ]
    : [];

  const text = el(
    'div',
    { position: 'absolute', top: 170, left: SIDE, right: SIDE, display: 'flex', flexDirection: 'column', gap: 32 },
    [
      ...(kick
        ? [
            el(
              'div',
              {
                display: 'flex', alignSelf: 'flex-start', border: `3px solid ${surf.ink}`, borderRadius: 999,
                padding: '8px 26px', fontFamily: s.bodyFont, fontSize: 30, color: surf.ink, textTransform: 'uppercase', letterSpacing: 2,
              },
              kick[1],
            ),
          ]
        : []),
      rich(s, surf, title, { font: s.titleFont, size, lineHeight: 1.02, caseMode: s.titleCase, plate: s.titlePlate }),
      ...(input.body
        ? [rich(s, surf, input.body, { font: s.bodyFont, size: 40, lineHeight: 1.3, color: surf.dark ? 'rgba(255,255,255,0.78)' : s.mute })]
        : []),
    ],
  );
  return frame(s, surf, input, [...photo, text]);
}

// ── reveal ─────────────────────────────────────────────────────────────
function pairOf(body: string): { anti: string; good: string; rest: string } | null {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const anti = lines.find((l) => /^[✕✗×x]\s/i.test(l));
  const good = lines.find((l) => /^[✓✔]\s/.test(l));
  if (!anti || !good) return null;
  const rest = lines.filter((l) => l !== anti && l !== good).join('\n');
  return { anti: anti.replace(/^\S+\s+/, ''), good: good.replace(/^\S+\s+/, ''), rest };
}

function pairCard(s: SkillStyle, surf: Surface, text: string, good: boolean): Node {
  const cardBg = surf.dark ? 'rgba(255,255,255,0.07)' : '#FFFFFF';
  const mark = good ? '✓' : '✕';
  const markBg = good ? (contrast(s.accent, cardBg) < 1.6 ? surf.ink : s.accent) : '#E5484D';
  const markInk = good ? (contrast(s.accent, cardBg) < 1.6 ? surf.bg : s.accentInk) : '#FFFFFF';
  return el(
    'div',
    {
      display: 'flex', alignItems: 'flex-start', gap: 24, padding: '28px 32px', borderRadius: 28, backgroundColor: cardBg,
      border: good ? `3px solid ${markBg}` : `3px solid ${surf.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
      opacity: good ? 1 : 0.88,
    },
    [
      el('div', { display: 'flex', width: 52, height: 52, borderRadius: 52, flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: markBg, color: markInk, fontFamily: 'Inter 700', fontSize: 30 }, mark),
      el('div', { display: 'flex', flex: 1 }, [
        rich(s, surf, text, { font: s.bodyFont, size: 38, lineHeight: 1.3, color: surf.dark ? s.inkOnDark : s.ink }),
      ]),
    ],
  );
}

function reveal(s: SkillStyle, input: SkillSlideInput): Node {
  const surf = surfaceFor(s, 'reveal');
  const boxW = input.width - SIDE * 2;
  const num = String(input.index - 1).padStart(2, '0');
  const hasMedia = Boolean(input.mediaDataUri);
  const pair = pairOf(input.body);
  const tSize = fitSize(input.title, { max: hasMedia ? 68 : 84, min: 48, boxW, maxLines: 3, k: glyphFactor(s.titleFont, s.titleCase === 'upper') });
  const bodyLen = stripAccents(input.body).length;
  const bSize = hasMedia ? 34 : bodyLen > 220 ? 38 : bodyLen > 120 ? 44 : 52;
  const numColor = contrast(s.accent, surf.bg) < 2 ? surf.ink : s.accent;

  const blocks: Node[] = [
    el('div', { display: 'flex', fontFamily: s.titleFont, fontSize: 110, lineHeight: 1, color: numColor, ...(s.accentMode === 'glow' ? { textShadow: `0 0 34px ${s.accent}88` } : {}) }, num),
    rich(s, surf, input.title, { font: s.titleFont, size: tSize, lineHeight: 1.06, caseMode: s.titleCase, plate: s.titlePlate }),
  ];
  if (pair) {
    if (pair.rest) blocks.push(rich(s, surf, pair.rest, { font: s.bodyFont, size: 36, lineHeight: 1.3, color: surf.dark ? 'rgba(255,255,255,0.75)' : s.mute }));
    blocks.push(el('div', { display: 'flex', flexDirection: 'column', gap: 20, marginTop: 8 }, [pairCard(s, surf, pair.anti, false), pairCard(s, surf, pair.good, true)]));
  } else {
    blocks.push(rich(s, surf, input.body, { font: s.bodyFont, size: bSize, lineHeight: 1.32, color: surf.dark ? 'rgba(255,255,255,0.82)' : s.mute }));
  }
  if (hasMedia) {
    blocks.push(
      el(
        'div',
        {
          display: 'flex', flex: 1, marginTop: 8, borderRadius: 32, overflow: 'hidden', backgroundColor: surf.dark ? '#1A1A1D' : '#FFFFFF',
          border: `2px solid ${surf.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`, boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        },
        el('img', { width: '100%', height: '100%', objectFit: 'contain' }, undefined, { src: input.mediaDataUri! }),
      ),
    );
  }
  return frame(s, surf, input, [
    el('div', { position: 'absolute', top: 170, bottom: 150, left: SIDE, right: SIDE, display: 'flex', flexDirection: 'column', gap: 28 }, blocks),
  ]);
}

// ── cta ────────────────────────────────────────────────────────────────
function bookmark(color: string): Node {
  return el(
    'svg',
    { width: 34, height: 40 },
    [el('path', {}, undefined, { d: 'M3 3h28v34l-14-9-14 9z', fill: 'none', stroke: color, 'stroke-width': 4, 'stroke-linejoin': 'round' })],
    { viewBox: '0 0 34 40', width: 34, height: 40 },
  );
}

function cta(s: SkillStyle, input: SkillSlideInput): Node {
  const surf = surfaceFor(s, 'cta');
  const m = /^(.*?)[«"]([^»"]{1,24})[»"](.*)$/s.exec(input.title.trim());
  const verb = m ? stripAccents(m[1]).trim() || 'пиши' : '';
  const word = m ? stripAccents(m[2]).trim() : '';
  const after = m ? stripAccents(m[3]).trim() : '';
  const boxW = input.width - SIDE * 2;
  const wordSize = fitSize(`«${word || input.title}»`, { max: 170, min: 64, boxW: boxW * 0.84, maxLines: 1, k: glyphFactor(s.titleFont, true) });
  const plateBg = contrast(s.accent, surf.bg) < 1.4 ? surf.ink : s.accent;
  const plateInk = contrast(s.accent, surf.bg) < 1.4 ? surf.bg : s.accentInk;

  const main: Node[] = m
    ? [
        el('div', { display: 'flex', fontFamily: s.titleFont, fontSize: 86, lineHeight: 1.05, color: surf.ink }, applyCase(verb, s.titleCase)),
        el(
          'div',
          { display: 'flex', alignSelf: 'flex-start', fontFamily: s.titleFont, fontSize: wordSize, lineHeight: 1.08, color: plateInk, backgroundColor: plateBg, padding: `4px ${Math.round(wordSize * 0.2)}px`, borderRadius: Math.round(wordSize * 0.14), ...(s.id === 'sticker' ? { transform: 'rotate(-1.5deg)' } : {}) },
          `«${word.toUpperCase()}»`,
        ),
        ...(after ? [el('div', { display: 'flex', fontFamily: s.titleFont, fontSize: 64, color: surf.ink }, applyCase(after, s.titleCase))] : []),
      ]
    : [rich(s, surf, input.title, { font: s.titleFont, size: fitSize(input.title, { max: 120, min: 60, boxW, maxLines: 4, k: glyphFactor(s.titleFont, s.titleCase === 'upper') }), lineHeight: 1.05, caseMode: s.titleCase, plate: s.titlePlate })];

  const muted = surf.dark ? 'rgba(255,255,255,0.78)' : s.mute;
  return frame(s, surf, input, [
    el(
      'div',
      { position: 'absolute', top: 170, bottom: 150, left: SIDE, right: SIDE, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 36 },
      [
        ...main,
        ...(input.body ? [rich(s, surf, input.body, { font: s.bodyFont, size: 42, lineHeight: 1.3, color: muted })] : []),
        el(
          'div',
          { display: 'flex', alignItems: 'center', gap: 18, alignSelf: 'flex-start', marginTop: 24, padding: '18px 30px', borderRadius: 999, border: `3px solid ${surf.dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.18)'}`, fontFamily: s.bodyFont, fontSize: 32, color: surf.ink },
          [bookmark(surf.ink), el('div', { display: 'flex' }, 'сохрани, чтобы не потерять')],
        ),
      ],
    ),
  ]);
}

export function buildSkillNode(s: SkillStyle, input: SkillSlideInput): Node {
  if (input.kind === 'cover') return cover(s, input);
  if (input.kind === 'cta') return cta(s, input);
  return reveal(s, input);
}

export function skillBg(s: SkillStyle, kind: SkillSlideInput['kind']): string {
  return surfaceFor(s, kind).bg;
}
