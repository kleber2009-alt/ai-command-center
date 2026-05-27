// Рендер одного слайда карусели в PNG через satori (JSX→SVG) + resvg (SVG→PNG).
// Размер 1080×1350 (4:5 — стандарт Instagram-карусели).
//
// Три варианта layout по позиции слайда:
//   - cover (index 0)   — фоном идёт аватар, поверх затемнение + lime hook
//   - cta   (last)      — accent-фрейм, акцент на действии
//   - reveal (between)  — нейтральный, индекс + title + body
//
// Все цвета/типографика — из дизайн-системы persona-studio (tailwind config).

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { loadFonts } from './fonts';

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

const COLORS = {
  bg: '#080808',
  surface: '#0f0f0f',
  text: '#f5f0e8',
  textDim: '#b8b3a8',
  textMute: '#5a5550',
  lime: '#c8f060',
  warm: '#f0c860',
  border: '#1a1a1a',
};

export type SlideKind = 'cover' | 'reveal' | 'cta';

export type RenderSlideInput = {
  index: number;          // 1-based для отображения
  total: number;
  kind: SlideKind;
  title: string;
  body: string;
  // base64 data URI или прямой URL (satori умеет fetch только http URL,
  // мы заранее преобразуем avatar в data URI для надёжности).
  avatarDataUri?: string;
};

export async function renderSlide(input: RenderSlideInput): Promise<Buffer> {
  const fonts = await loadFonts();
  const node = buildNode(input);
  // satori expects ReactNode, но мы передаём свой JSXNode-объект — рантайм
  // ровно тот же, типы хитрят. Cast через unknown — стандартный паттерн
  // для satori "no JSX runtime" use-case (см. их собственные примеры).
  const svg = await satori(node as unknown as Parameters<typeof satori>[0], {
    width: SLIDE_W,
    height: SLIDE_H,
    fonts,
  });
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: SLIDE_W },
    background: COLORS.bg,
  })
    .render()
    .asPng();
  return Buffer.from(png);
}

// ── JSX-like node builder ─────────────────────────────────────────────
// satori принимает plain объект { type, props } без React. Мы строим
// дерево вручную — это чуть многословнее, но даёт нам контроль и не
// требует JSX runtime в API-route.

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

function buildNode(input: RenderSlideInput): JSXNode {
  if (input.kind === 'cover') return coverNode(input);
  if (input.kind === 'cta') return ctaNode(input);
  return revealNode(input);
}

const counterLabel = (i: number, total: number) =>
  `${String(i).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;

// ── COVER (slide 01): avatar fullbleed + dark overlay + huge hook ────
function coverNode(input: RenderSlideInput): JSXNode {
  const hasAvatar = Boolean(input.avatarDataUri);

  const avatarLayer: JSXNode = hasAvatar
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
        background: `linear-gradient(135deg, ${COLORS.surface} 0%, ${COLORS.bg} 100%)`,
      });

  const gradient: JSXNode = el('div', {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SLIDE_W,
    height: SLIDE_H,
    // Сильное затемнение снизу для читаемости текста
    background:
      'linear-gradient(to bottom, rgba(8,8,8,0.35) 0%, rgba(8,8,8,0.55) 45%, rgba(8,8,8,0.95) 100%)',
  });

  const topBar: JSXNode = el(
    'div',
    {
      position: 'absolute',
      top: 56,
      left: 64,
      right: 64,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      color: COLORS.lime,
      fontFamily: 'JetBrainsMono',
      fontSize: 24,
      letterSpacing: 4,
      textTransform: 'uppercase',
    },
    [
      el('div', { display: 'flex' }, '/ PERSONA · CAROUSEL'),
      el('div', { display: 'flex', color: COLORS.textDim }, counterLabel(input.index, input.total)),
    ],
  );

  const titleBlock: JSXNode = el(
    'div',
    {
      position: 'absolute',
      bottom: 120,
      left: 64,
      right: 64,
      display: 'flex',
      flexDirection: 'column',
      gap: 28,
    },
    [
      el(
        'div',
        {
          fontFamily: 'JetBrainsMono',
          color: COLORS.lime,
          fontSize: 22,
          letterSpacing: 4,
          textTransform: 'uppercase',
          display: 'flex',
        },
        '/ обложка',
      ),
      el(
        'div',
        {
          fontFamily: 'Tinos',
          fontWeight: 700,
          color: COLORS.text,
          fontSize: 88,
          lineHeight: 1.05,
          display: 'flex',
        },
        input.title,
      ),
      el(
        'div',
        {
          fontFamily: 'Tinos',
          fontStyle: 'italic',
          color: COLORS.textDim,
          fontSize: 36,
          lineHeight: 1.35,
          display: 'flex',
        },
        input.body,
      ),
      el(
        'div',
        {
          fontFamily: 'JetBrainsMono',
          color: COLORS.lime,
          fontSize: 22,
          letterSpacing: 4,
          textTransform: 'uppercase',
          marginTop: 12,
          display: 'flex',
        },
        'листай →',
      ),
    ],
  );

  return el(
    'div',
    {
      position: 'relative',
      width: SLIDE_W,
      height: SLIDE_H,
      display: 'flex',
      backgroundColor: COLORS.bg,
    },
    [avatarLayer, gradient, topBar, titleBlock],
  );
}

// ── REVEAL (slides 02..N-1): нейтральный, индекс + title + body ───────
function revealNode(input: RenderSlideInput): JSXNode {
  return el(
    'div',
    {
      width: SLIDE_W,
      height: SLIDE_H,
      backgroundColor: COLORS.bg,
      display: 'flex',
      flexDirection: 'column',
      padding: 80,
      position: 'relative',
    },
    [
      // Top tag
      el(
        'div',
        {
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'JetBrainsMono',
          fontSize: 22,
          letterSpacing: 4,
          textTransform: 'uppercase',
          color: COLORS.textDim,
        },
        [
          el('div', { display: 'flex', color: COLORS.lime }, '/ раскрытие'),
          el('div', { display: 'flex' }, counterLabel(input.index, input.total)),
        ],
      ),
      // Lime bar separator
      el('div', {
        marginTop: 28,
        width: 96,
        height: 4,
        backgroundColor: COLORS.lime,
      }),
      // Title
      el(
        'div',
        {
          marginTop: 56,
          fontFamily: 'Tinos',
          fontWeight: 700,
          color: COLORS.text,
          fontSize: 80,
          lineHeight: 1.1,
          display: 'flex',
        },
        input.title,
      ),
      // Body
      el(
        'div',
        {
          marginTop: 48,
          fontFamily: 'Tinos',
          color: COLORS.textDim,
          fontSize: 38,
          lineHeight: 1.4,
          display: 'flex',
        },
        input.body,
      ),
    ],
  );
}

// ── CTA (last slide): акцентный фрейм, action-first ─────────────────
function ctaNode(input: RenderSlideInput): JSXNode {
  return el(
    'div',
    {
      width: SLIDE_W,
      height: SLIDE_H,
      backgroundColor: COLORS.bg,
      display: 'flex',
      flexDirection: 'column',
      padding: 80,
      position: 'relative',
    },
    [
      el(
        'div',
        {
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'JetBrainsMono',
          fontSize: 22,
          letterSpacing: 4,
          textTransform: 'uppercase',
          color: COLORS.textDim,
        },
        [
          el('div', { display: 'flex', color: COLORS.warm }, '/ cta'),
          el('div', { display: 'flex' }, counterLabel(input.index, input.total)),
        ],
      ),
      // Centered title + body
      el(
        'div',
        {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: 48,
        },
        [
          el(
            'div',
            {
              fontFamily: 'Tinos',
              fontWeight: 700,
              color: COLORS.warm,
              fontSize: 96,
              lineHeight: 1.05,
              display: 'flex',
            },
            input.title,
          ),
          el(
            'div',
            {
              fontFamily: 'Tinos',
              fontStyle: 'italic',
              color: COLORS.text,
              fontSize: 40,
              lineHeight: 1.4,
              display: 'flex',
            },
            input.body,
          ),
        ],
      ),
      // Bottom signature
      el(
        'div',
        {
          fontFamily: 'JetBrainsMono',
          color: COLORS.textMute,
          fontSize: 20,
          letterSpacing: 4,
          textTransform: 'uppercase',
          display: 'flex',
        },
        '/ persona · ai-driven',
      ),
    ],
  );
}
