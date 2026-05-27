// Рендер одного слайда карусели в PNG через satori (JSX→SVG) + resvg (SVG→PNG).
// Размер 1080×1350 (4:5 — стандарт Instagram-карусели).
//
// Маршрутизация по style:
//   - persona-minimal — тёмный фон, Tinos serif, lime-акценты
//   - clickbait-bold  — белый фон, кобальт, UPPERCASE BOLD заголовки + checklist
//   - knox-cream      — cream фон, duotone заголовки (brown + gold), премиум-look
//
// Каждый стиль реализует три варианта по позиции: cover / reveal / cta.

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { loadFonts } from './fonts';
import type { CarouselStyleId } from './styles';

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

export type SlideKind = 'cover' | 'reveal' | 'cta';

export type RenderSlideInput = {
  index: number;
  total: number;
  kind: SlideKind;
  title: string;
  body: string;
  style: CarouselStyleId;
  avatarDataUri?: string;
};

// ── helpers ───────────────────────────────────────────────────────────
type JSXNode = {
  type: string;
  props: Record<string, unknown> & { style?: Record<string, unknown>; children?: unknown };
};

const el = (
  type: string,
  style: Record<string, unknown>,
  children?: JSXNode | JSXNode[] | string,
  extra?: Record<string, unknown>,
): JSXNode => ({
  type,
  props: { style, children, ...(extra ?? {}) },
});

const counter = (i: number, total: number) =>
  `${String(i).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;

// Простой эвристический сплит body на 3–6 буллетов: по строкам '·' / '•' /
// '— ' / новым строкам / точкам. Если не удалось — отдаём весь body как
// один параграф. Используется в clickbait-bold для чек-листов.
function splitBullets(body: string): string[] {
  const cleaned = body.trim();
  if (!cleaned) return [];
  const lines = cleaned
    .split(/\n+|·|•|—\s|^[-—–]\s/gm)
    .map((s) => s.trim().replace(/^[-—–•·]\s*/, ''))
    .filter(Boolean);
  if (lines.length >= 2 && lines.length <= 7) return lines;
  // fallback — короткие предложения по '.'
  const sents = cleaned.split(/\.\s+/).map((s) => s.trim()).filter(Boolean);
  if (sents.length >= 2 && sents.length <= 7) return sents.map((s) => s.replace(/\.$/, ''));
  return [cleaned];
}

// ── PUBLIC: render ────────────────────────────────────────────────────
export async function renderSlide(input: RenderSlideInput): Promise<Buffer> {
  const fonts = await loadFonts();
  const node = buildNode(input);
  const svg = await satori(node as unknown as Parameters<typeof satori>[0], {
    width: SLIDE_W,
    height: SLIDE_H,
    fonts,
  });
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: SLIDE_W },
    background: bgFor(input.style),
  })
    .render()
    .asPng();
  return Buffer.from(png);
}

function bgFor(style: CarouselStyleId): string {
  if (style === 'clickbait-bold') return '#FFFFFF';
  if (style === 'knox-cream') return '#F5EFE0';
  return '#080808';
}

function buildNode(input: RenderSlideInput): JSXNode {
  if (input.style === 'clickbait-bold') return clickbaitNode(input);
  if (input.style === 'knox-cream') return knoxNode(input);
  return personaNode(input);
}

// ═══════════════════════════════════════════════════════════════════════
// STYLE 1: PERSONA-MINIMAL (dark serif, lime)
// ═══════════════════════════════════════════════════════════════════════
const PERSONA = {
  bg: '#080808',
  surface: '#0f0f0f',
  text: '#f5f0e8',
  textDim: '#b8b3a8',
  textMute: '#5a5550',
  lime: '#c8f060',
  warm: '#f0c860',
};

function personaNode(input: RenderSlideInput): JSXNode {
  if (input.kind === 'cover') return personaCover(input);
  if (input.kind === 'cta') return personaCTA(input);
  return personaReveal(input);
}

function personaCover(input: RenderSlideInput): JSXNode {
  const avatarLayer: JSXNode = input.avatarDataUri
    ? el(
        'img',
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: SLIDE_W,
          height: SLIDE_H,
          objectFit: 'cover',
        },
        undefined,
        { src: input.avatarDataUri },
      )
    : el('div', {
        position: 'absolute',
        top: 0,
        left: 0,
        width: SLIDE_W,
        height: SLIDE_H,
        background: `linear-gradient(135deg, ${PERSONA.surface} 0%, ${PERSONA.bg} 100%)`,
      });
  return el(
    'div',
    { position: 'relative', width: SLIDE_W, height: SLIDE_H, display: 'flex', backgroundColor: PERSONA.bg },
    [
      avatarLayer,
      el('div', {
        position: 'absolute', top: 0, left: 0, width: SLIDE_W, height: SLIDE_H,
        background: 'linear-gradient(to bottom, rgba(8,8,8,0.35) 0%, rgba(8,8,8,0.55) 45%, rgba(8,8,8,0.95) 100%)',
      }),
      el(
        'div',
        { position: 'absolute', top: 56, left: 64, right: 64, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: PERSONA.lime, fontFamily: 'JetBrainsMono', fontSize: 24, letterSpacing: 4, textTransform: 'uppercase' },
        [
          el('div', { display: 'flex' }, '/ PERSONA · CAROUSEL'),
          el('div', { display: 'flex', color: PERSONA.textDim }, counter(input.index, input.total)),
        ],
      ),
      el(
        'div',
        { position: 'absolute', bottom: 120, left: 64, right: 64, display: 'flex', flexDirection: 'column', gap: 28 },
        [
          el('div', { fontFamily: 'JetBrainsMono', color: PERSONA.lime, fontSize: 22, letterSpacing: 4, textTransform: 'uppercase', display: 'flex' }, '/ обложка'),
          el('div', { fontFamily: 'Tinos', fontWeight: 700, color: PERSONA.text, fontSize: 88, lineHeight: 1.05, display: 'flex' }, input.title),
          el('div', { fontFamily: 'Tinos', fontStyle: 'italic', color: PERSONA.textDim, fontSize: 36, lineHeight: 1.35, display: 'flex' }, input.body),
          el('div', { fontFamily: 'JetBrainsMono', color: PERSONA.lime, fontSize: 22, letterSpacing: 4, textTransform: 'uppercase', marginTop: 12, display: 'flex' }, 'листай →'),
        ],
      ),
    ],
  );
}

function personaReveal(input: RenderSlideInput): JSXNode {
  return el(
    'div',
    { width: SLIDE_W, height: SLIDE_H, backgroundColor: PERSONA.bg, display: 'flex', flexDirection: 'column', padding: 80, position: 'relative' },
    [
      el(
        'div',
        { display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrainsMono', fontSize: 22, letterSpacing: 4, textTransform: 'uppercase', color: PERSONA.textDim },
        [el('div', { display: 'flex', color: PERSONA.lime }, '/ раскрытие'), el('div', { display: 'flex' }, counter(input.index, input.total))],
      ),
      el('div', { marginTop: 28, width: 96, height: 4, backgroundColor: PERSONA.lime }),
      el('div', { marginTop: 56, fontFamily: 'Tinos', fontWeight: 700, color: PERSONA.text, fontSize: 80, lineHeight: 1.1, display: 'flex' }, input.title),
      el('div', { marginTop: 48, fontFamily: 'Tinos', color: PERSONA.textDim, fontSize: 38, lineHeight: 1.4, display: 'flex' }, input.body),
    ],
  );
}

function personaCTA(input: RenderSlideInput): JSXNode {
  return el(
    'div',
    { width: SLIDE_W, height: SLIDE_H, backgroundColor: PERSONA.bg, display: 'flex', flexDirection: 'column', padding: 80, position: 'relative' },
    [
      el(
        'div',
        { display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrainsMono', fontSize: 22, letterSpacing: 4, textTransform: 'uppercase', color: PERSONA.textDim },
        [el('div', { display: 'flex', color: PERSONA.warm }, '/ cta'), el('div', { display: 'flex' }, counter(input.index, input.total))],
      ),
      el(
        'div',
        { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 48 },
        [
          el('div', { fontFamily: 'Tinos', fontWeight: 700, color: PERSONA.warm, fontSize: 96, lineHeight: 1.05, display: 'flex' }, input.title),
          el('div', { fontFamily: 'Tinos', fontStyle: 'italic', color: PERSONA.text, fontSize: 40, lineHeight: 1.4, display: 'flex' }, input.body),
        ],
      ),
      el('div', { fontFamily: 'JetBrainsMono', color: PERSONA.textMute, fontSize: 20, letterSpacing: 4, textTransform: 'uppercase', display: 'flex' }, '/ persona · ai-driven'),
    ],
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STYLE 2: CLICKBAIT-BOLD (paliy-style — white + cobalt + UPPERCASE)
// ═══════════════════════════════════════════════════════════════════════
const CLICK = {
  bg: '#FFFFFF',
  text: '#0A0A0A',
  textGray: '#555555',
  cobalt: '#2D5BFF',
  cobaltDeep: '#1E3FCC',
};

function clickbaitNode(input: RenderSlideInput): JSXNode {
  if (input.kind === 'cover') return clickbaitCover(input);
  if (input.kind === 'cta') return clickbaitCTA(input);
  return clickbaitReveal(input);
}

function clickbaitCover(input: RenderSlideInput): JSXNode {
  // Top bar — minimal, lower-case style
  const header: JSXNode = el(
    'div',
    { position: 'absolute', top: 40, left: 60, right: 60, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'JetBrainsMono', fontSize: 22, color: CLICK.textGray },
    [
      el('div', { display: 'flex' }, 'Нейросети · ИИ · Маркетинг'),
      el('div', { display: 'flex', padding: '4px 10px', backgroundColor: '#F0F0F0', borderRadius: 12 }, counter(input.index, input.total)),
    ],
  );

  return el(
    'div',
    { width: SLIDE_W, height: SLIDE_H, backgroundColor: CLICK.bg, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, position: 'relative' },
    [
      header,
      el(
        'div',
        {
          fontFamily: 'Tinos',
          fontWeight: 700,
          color: CLICK.text,
          fontSize: 96,
          lineHeight: 1.05,
          letterSpacing: -1,
          textTransform: 'uppercase',
          display: 'flex',
        },
        input.title,
      ),
      el(
        'div',
        {
          marginTop: 40,
          fontFamily: 'Tinos',
          color: CLICK.textGray,
          fontSize: 38,
          lineHeight: 1.35,
          display: 'flex',
        },
        input.body,
      ),
      el(
        'div',
        {
          position: 'absolute',
          bottom: 60,
          left: 80,
          fontFamily: 'JetBrainsMono',
          fontWeight: 700,
          fontSize: 28,
          color: CLICK.text,
          letterSpacing: 4,
          display: 'flex',
        },
        'SWIPE LEFT  →',
      ),
    ],
  );
}

function clickbaitReveal(input: RenderSlideInput): JSXNode {
  const bullets = splitBullets(input.body);
  const useChecklist = bullets.length >= 2;
  const stepLabel = `${String(input.index).padStart(2, '0')}. ШАГ`;

  return el(
    'div',
    { width: SLIDE_W, height: SLIDE_H, backgroundColor: CLICK.bg, display: 'flex', flexDirection: 'column', padding: 80, position: 'relative' },
    [
      // header
      el(
        'div',
        { display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrainsMono', fontSize: 22, color: CLICK.textGray },
        [
          el('div', { display: 'flex' }, 'Нейросети · ИИ · Маркетинг'),
          el('div', { display: 'flex', padding: '4px 10px', backgroundColor: '#F0F0F0', borderRadius: 12 }, counter(input.index, input.total)),
        ],
      ),
      el(
        'div',
        {
          marginTop: 60,
          fontFamily: 'JetBrainsMono',
          fontWeight: 700,
          color: CLICK.cobalt,
          fontSize: 32,
          letterSpacing: 4,
          textTransform: 'uppercase',
          display: 'flex',
        },
        stepLabel,
      ),
      el(
        'div',
        {
          marginTop: 16,
          fontFamily: 'Tinos',
          fontWeight: 700,
          color: CLICK.text,
          fontSize: 72,
          lineHeight: 1.1,
          letterSpacing: -1,
          textTransform: 'uppercase',
          display: 'flex',
        },
        input.title,
      ),
      useChecklist
        ? el(
            'div',
            { marginTop: 48, display: 'flex', flexDirection: 'column', gap: 28 },
            bullets.slice(0, 6).map((b) =>
              el(
                'div',
                { display: 'flex', alignItems: 'center', gap: 22 },
                [
                  el(
                    'div',
                    {
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: CLICK.cobalt,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'JetBrainsMono',
                      fontWeight: 700,
                      fontSize: 28,
                      flexShrink: 0,
                    },
                    '✓',
                  ),
                  el(
                    'div',
                    { fontFamily: 'Tinos', color: CLICK.text, fontSize: 36, lineHeight: 1.35, display: 'flex', flex: 1 },
                    b,
                  ),
                ],
              ),
            ),
          )
        : el(
            'div',
            { marginTop: 48, fontFamily: 'Tinos', color: CLICK.textGray, fontSize: 38, lineHeight: 1.4, display: 'flex' },
            input.body,
          ),
    ],
  );
}

function clickbaitCTA(input: RenderSlideInput): JSXNode {
  return el(
    'div',
    { width: SLIDE_W, height: SLIDE_H, backgroundColor: CLICK.bg, display: 'flex', flexDirection: 'column', padding: 80, position: 'relative', justifyContent: 'center' },
    [
      el(
        'div',
        {
          fontFamily: 'Tinos',
          fontWeight: 700,
          color: CLICK.text,
          fontSize: 80,
          lineHeight: 1.1,
          letterSpacing: -1,
          textTransform: 'uppercase',
          display: 'flex',
        },
        input.title,
      ),
      el(
        'div',
        {
          marginTop: 48,
          fontFamily: 'Tinos',
          color: CLICK.textGray,
          fontSize: 36,
          lineHeight: 1.4,
          display: 'flex',
        },
        input.body,
      ),
      el(
        'div',
        {
          marginTop: 64,
          padding: '24px 36px',
          backgroundColor: CLICK.cobalt,
          color: '#FFFFFF',
          fontFamily: 'JetBrainsMono',
          fontWeight: 700,
          fontSize: 32,
          letterSpacing: 3,
          textTransform: 'uppercase',
          alignSelf: 'flex-start',
          display: 'flex',
        },
        '✍ напиши «старт» в комменты',
      ),
    ],
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STYLE 3: KNOX-CREAM (cream beige + duotone brown/gold + premium)
// ═══════════════════════════════════════════════════════════════════════
const KNOX = {
  bg: '#F5EFE0',
  cream: '#FAF5E8',
  brown: '#3A2B0F',
  gold: '#B58620',
  textBody: '#4A3E28',
  textMute: '#7A6F5B',
  cardBorder: '#3A2B0F',
};

function knoxNode(input: RenderSlideInput): JSXNode {
  if (input.kind === 'cover') return knoxCover(input);
  if (input.kind === 'cta') return knoxCTA(input);
  return knoxReveal(input);
}

function knoxCover(input: RenderSlideInput): JSXNode {
  return el(
    'div',
    { width: SLIDE_W, height: SLIDE_H, backgroundColor: KNOX.bg, display: 'flex', flexDirection: 'column', padding: 80, position: 'relative', justifyContent: 'center' },
    [
      el(
        'div',
        { position: 'absolute', top: 56, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrainsMono', color: KNOX.textMute, fontSize: 22, letterSpacing: 2 },
        [el('div', { display: 'flex' }, '✦  KNOX EDITION'), el('div', { display: 'flex' }, counter(input.index, input.total))],
      ),
      el(
        'div',
        {
          fontFamily: 'Tinos',
          fontWeight: 700,
          fontSize: 110,
          lineHeight: 1.0,
          color: KNOX.brown,
          letterSpacing: -2,
          display: 'flex',
        },
        input.title,
      ),
      el(
        'div',
        {
          marginTop: 28,
          fontFamily: 'Tinos',
          fontStyle: 'italic',
          fontSize: 40,
          color: KNOX.gold,
          lineHeight: 1.35,
          display: 'flex',
        },
        input.body,
      ),
      el(
        'div',
        { position: 'absolute', bottom: 80, left: 80, display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'JetBrainsMono', color: KNOX.textMute, fontSize: 20 },
        [el('div', { display: 'flex' }, 'persona · ai-content engine'), el('div', { display: 'flex' }, 'crafted slide 01')],
      ),
    ],
  );
}

function knoxReveal(input: RenderSlideInput): JSXNode {
  return el(
    'div',
    { width: SLIDE_W, height: SLIDE_H, backgroundColor: KNOX.bg, display: 'flex', flexDirection: 'column', padding: 80, position: 'relative' },
    [
      el(
        'div',
        { display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrainsMono', color: KNOX.textMute, fontSize: 22, letterSpacing: 2 },
        [
          el('div', { display: 'flex', color: KNOX.gold }, '✦  ' + String(input.index).padStart(2, '0')),
          el('div', { display: 'flex' }, counter(input.index, input.total)),
        ],
      ),
      // Headline duotone (brown bg + gold underline)
      el(
        'div',
        {
          marginTop: 56,
          fontFamily: 'Tinos',
          fontWeight: 700,
          fontSize: 80,
          lineHeight: 1.05,
          color: KNOX.brown,
          letterSpacing: -1,
          display: 'flex',
        },
        input.title,
      ),
      el('div', { marginTop: 18, width: 200, height: 6, backgroundColor: KNOX.gold }),
      // Card body
      el(
        'div',
        {
          marginTop: 56,
          padding: 48,
          backgroundColor: KNOX.cream,
          border: `2px solid ${KNOX.brown}`,
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
        },
        [
          el(
            'div',
            { fontFamily: 'Tinos', color: KNOX.textBody, fontSize: 36, lineHeight: 1.4, display: 'flex' },
            input.body,
          ),
        ],
      ),
    ],
  );
}

function knoxCTA(input: RenderSlideInput): JSXNode {
  return el(
    'div',
    { width: SLIDE_W, height: SLIDE_H, backgroundColor: KNOX.bg, display: 'flex', flexDirection: 'column', padding: 80, position: 'relative', justifyContent: 'center' },
    [
      el(
        'div',
        { position: 'absolute', top: 56, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrainsMono', color: KNOX.textMute, fontSize: 22, letterSpacing: 2 },
        [el('div', { display: 'flex', color: KNOX.gold }, '✦  FINAL'), el('div', { display: 'flex' }, counter(input.index, input.total))],
      ),
      el(
        'div',
        {
          fontFamily: 'Tinos',
          fontWeight: 700,
          fontSize: 96,
          lineHeight: 1.05,
          color: KNOX.brown,
          letterSpacing: -1,
          display: 'flex',
        },
        input.title,
      ),
      el(
        'div',
        {
          marginTop: 40,
          fontFamily: 'Tinos',
          fontStyle: 'italic',
          fontSize: 40,
          color: KNOX.gold,
          lineHeight: 1.4,
          display: 'flex',
        },
        input.body,
      ),
      el(
        'div',
        {
          marginTop: 64,
          padding: '24px 40px',
          backgroundColor: KNOX.brown,
          color: KNOX.bg,
          fontFamily: 'JetBrainsMono',
          fontWeight: 700,
          fontSize: 30,
          letterSpacing: 4,
          textTransform: 'uppercase',
          alignSelf: 'flex-start',
          display: 'flex',
        },
        '✦  start here',
      ),
    ],
  );
}
