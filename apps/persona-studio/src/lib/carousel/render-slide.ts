// Рендер одного слайда карусели в PNG через satori (JSX→SVG) + resvg (SVG→PNG).
// Размер 1080×1350 (4:5 — стандарт Instagram-карусели). AI Carousel Engine v2.
//
// Маршрутизация по style:
//   - persona-minimal    — Bold Dark: dark bg, oversized serif, lime
//   - clickbait-bold     — Clean Light: white bg, cobalt, editorial grid
//   - knox-cream         — Grid Pastel: cream + duotone brown/gold premium
//   - neon-tech          — Neon Tech: deep purple, cyan glow, glass cards
//   - handwritten-viral  — Handwritten Viral: paper, marker, sticky notes
//
// Каждый стиль реализует три варианта по позиции: cover / reveal / cta.

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { loadFonts } from './fonts';
import { STYLE_TOKENS, type CarouselStyleId, type StyleTokens } from './styles';
import type { CoverType } from './prompts';

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
  // Аватар-обложки для cover-слайдов
  avatarDataUri?: string;
  // Пользовательское фото/скрин/mockup для reveal/cta слайдов — рисуется
  // как карточка в нижней части слайда, с фирменной рамкой стиля.
  // Для cover-слайдов используется как object/ui-картинка (см. coverType).
  mediaDataUri?: string;
  // Тип обложки (только для kind='cover'). По умолчанию 'avatar' —
  // существующие per-style AVATAR covers. Остальные типы используют
  // shared cover-type рендеры с токенами стиля.
  coverType?: CoverType;
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
  if (style === 'neon-tech') return '#0A001F';
  if (style === 'handwritten-viral') return '#F4ECD8';
  return '#080808';
}

function buildNode(input: RenderSlideInput): JSXNode {
  // CoverType routing — только для cover-слайдов. Если тип задан и это не
  // 'avatar' — идём в shared cover-type рендер с токенами стиля. Любой
  // другой kind или coverType='avatar' (или undefined) — старый per-style
  // флоу.
  if (input.kind === 'cover' && input.coverType && input.coverType !== 'avatar') {
    const tokens = STYLE_TOKENS[input.style];
    if (input.coverType === 'object') return coverTypeObject(input, tokens);
    if (input.coverType === 'split') return coverTypeSplit(input, tokens);
    if (input.coverType === 'ui') return coverTypeUI(input, tokens);
  }
  if (input.style === 'clickbait-bold') return clickbaitNode(input);
  if (input.style === 'knox-cream') return knoxNode(input);
  if (input.style === 'neon-tech') return neonNode(input);
  if (input.style === 'handwritten-viral') return paperNode(input);
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
  const hasMedia = Boolean(input.mediaDataUri);
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
      el('div', { marginTop: hasMedia ? 36 : 56, fontFamily: 'Tinos', fontWeight: 700, color: PERSONA.text, fontSize: hasMedia ? 60 : 80, lineHeight: 1.1, display: 'flex' }, input.title),
      el('div', { marginTop: hasMedia ? 24 : 48, fontFamily: 'Tinos', color: PERSONA.textDim, fontSize: hasMedia ? 30 : 38, lineHeight: 1.35, display: 'flex' }, input.body),
      ...(hasMedia
        ? [
            el(
              'div',
              { marginTop: 36, padding: 8, backgroundColor: PERSONA.surface, border: `2px solid ${PERSONA.lime}`, display: 'flex', alignSelf: 'stretch', flex: 1, maxHeight: 480 },
              el(
                'img',
                { width: '100%', height: '100%', objectFit: 'contain' },
                undefined,
                { src: input.mediaDataUri! },
              ),
            ),
          ]
        : []),
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
  // Полноэкранное фото (аватар) + сильное затемнение снизу + белый
  // UPPERCASE-заголовок в нижней трети + SWIPE LEFT. Если аватара нет —
  // fallback на белый фон с чёрным заголовком, как раньше.
  if (!input.avatarDataUri) {
    return el(
      'div',
      { width: SLIDE_W, height: SLIDE_H, backgroundColor: CLICK.bg, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, position: 'relative' },
      [
        el(
          'div',
          { position: 'absolute', top: 40, left: 60, right: 60, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'JetBrainsMono', fontSize: 22, color: CLICK.textGray },
          [
            el('div', { display: 'flex' }, 'Нейросети · ИИ · Маркетинг'),
            el('div', { display: 'flex', padding: '4px 10px', backgroundColor: '#F0F0F0', borderRadius: 12 }, counter(input.index, input.total)),
          ],
        ),
        el('div', { fontFamily: 'Tinos', fontWeight: 700, color: CLICK.text, fontSize: 96, lineHeight: 1.05, letterSpacing: -1, textTransform: 'uppercase', display: 'flex' }, input.title),
        el('div', { marginTop: 40, fontFamily: 'Tinos', color: CLICK.textGray, fontSize: 38, lineHeight: 1.35, display: 'flex' }, input.body),
        el('div', { position: 'absolute', bottom: 60, left: 80, fontFamily: 'JetBrainsMono', fontWeight: 700, fontSize: 28, color: CLICK.text, letterSpacing: 4, display: 'flex' }, 'SWIPE LEFT  →'),
      ],
    );
  }

  return el(
    'div',
    { position: 'relative', width: SLIDE_W, height: SLIDE_H, display: 'flex', backgroundColor: '#000' },
    [
      el(
        'img',
        { position: 'absolute', top: 0, left: 0, width: SLIDE_W, height: SLIDE_H, objectFit: 'cover' },
        undefined,
        { src: input.avatarDataUri },
      ),
      // Двойной gradient: верхний лёгкий + нижний сильный для читаемости текста
      el('div', {
        position: 'absolute', top: 0, left: 0, width: SLIDE_W, height: SLIDE_H,
        background:
          'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.1) 35%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.92) 100%)',
      }),
      // Top header: tagline + counter
      el(
        'div',
        { position: 'absolute', top: 56, left: 64, right: 64, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'JetBrainsMono', fontSize: 22, color: '#FFFFFF', letterSpacing: 2 },
        [
          el('div', { display: 'flex', textTransform: 'uppercase' }, 'Нейросети · ИИ · Маркетинг'),
          el('div', { display: 'flex', padding: '4px 12px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12 }, counter(input.index, input.total)),
        ],
      ),
      // Bottom block: headline + subtitle + SWIPE LEFT
      el(
        'div',
        { position: 'absolute', bottom: 80, left: 64, right: 64, display: 'flex', flexDirection: 'column' },
        [
          el(
            'div',
            { fontFamily: 'Tinos', fontWeight: 700, color: '#FFFFFF', fontSize: 88, lineHeight: 1.0, letterSpacing: -1, textTransform: 'uppercase', display: 'flex' },
            input.title,
          ),
          el(
            'div',
            { marginTop: 28, fontFamily: 'Tinos', color: 'rgba(255,255,255,0.85)', fontSize: 32, lineHeight: 1.35, textTransform: 'uppercase', display: 'flex' },
            input.body,
          ),
          el(
            'div',
            {
              marginTop: 40,
              padding: '12px 20px',
              backgroundColor: CLICK.cobalt,
              color: '#FFFFFF',
              fontFamily: 'JetBrainsMono',
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: 4,
              textTransform: 'uppercase',
              alignSelf: 'flex-start',
              display: 'flex',
            },
            'SWIPE LEFT  →',
          ),
        ],
      ),
    ],
  );
}

function clickbaitReveal(input: RenderSlideInput): JSXNode {
  const hasMedia = Boolean(input.mediaDataUri);
  const bullets = splitBullets(input.body);
  // С медиа отключаем чек-листы — слишком плотно. С медиа body всегда параграф.
  const useChecklist = !hasMedia && bullets.length >= 2;
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
            { marginTop: hasMedia ? 24 : 48, fontFamily: 'Tinos', color: CLICK.textGray, fontSize: hasMedia ? 28 : 38, lineHeight: 1.4, display: 'flex' },
            input.body,
          ),
      ...(hasMedia
        ? [
            // dark gradient frame с glow — как PDF-мокапы у paliy
            el(
              'div',
              {
                marginTop: 32,
                padding: 12,
                background: 'linear-gradient(180deg, #1a0033 0%, #000 100%)',
                border: '1px solid rgba(45,91,255,0.4)',
                display: 'flex',
                alignSelf: 'stretch',
                flex: 1,
                maxHeight: 500,
              },
              el(
                'img',
                { width: '100%', height: '100%', objectFit: 'contain' },
                undefined,
                { src: input.mediaDataUri! },
              ),
            ),
          ]
        : []),
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
  // Фото-фоном верхняя ~55%, снизу — cream-плашка с duotone-заголовком,
  // на стыке — тонкая золотая полоса. Без аватара — старый cream-only вид.
  if (!input.avatarDataUri) {
    return el(
      'div',
      { width: SLIDE_W, height: SLIDE_H, backgroundColor: KNOX.bg, display: 'flex', flexDirection: 'column', padding: 80, position: 'relative', justifyContent: 'center' },
      [
        el(
          'div',
          { position: 'absolute', top: 56, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrainsMono', color: KNOX.textMute, fontSize: 22, letterSpacing: 2 },
          [el('div', { display: 'flex' }, '✦  KNOX EDITION'), el('div', { display: 'flex' }, counter(input.index, input.total))],
        ),
        el('div', { fontFamily: 'Tinos', fontWeight: 700, fontSize: 110, lineHeight: 1.0, color: KNOX.brown, letterSpacing: -2, display: 'flex' }, input.title),
        el('div', { marginTop: 28, fontFamily: 'Tinos', fontStyle: 'italic', fontSize: 40, color: KNOX.gold, lineHeight: 1.35, display: 'flex' }, input.body),
        el('div', { position: 'absolute', bottom: 80, left: 80, display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'JetBrainsMono', color: KNOX.textMute, fontSize: 20 }, [
          el('div', { display: 'flex' }, 'persona · ai-content engine'),
          el('div', { display: 'flex' }, 'crafted slide 01'),
        ]),
      ],
    );
  }

  const PHOTO_H = 740; // ≈ 55% от 1350
  return el(
    'div',
    { position: 'relative', width: SLIDE_W, height: SLIDE_H, display: 'flex', backgroundColor: KNOX.bg },
    [
      // Фото-верх
      el(
        'div',
        { position: 'absolute', top: 0, left: 0, width: SLIDE_W, height: PHOTO_H, overflow: 'hidden', display: 'flex' },
        el(
          'img',
          { width: SLIDE_W, height: PHOTO_H, objectFit: 'cover' },
          undefined,
          { src: input.avatarDataUri },
        ),
      ),
      // Лёгкий warm-tint поверх фото (объединяет с cream-плашкой)
      el('div', {
        position: 'absolute', top: 0, left: 0, width: SLIDE_W, height: PHOTO_H,
        background: 'linear-gradient(to bottom, rgba(58,43,15,0.08) 0%, rgba(245,239,224,0.0) 50%, rgba(245,239,224,0.6) 100%)',
      }),
      // Header tags поверх фото
      el(
        'div',
        { position: 'absolute', top: 56, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrainsMono', color: '#FFFFFF', fontSize: 22, letterSpacing: 2 },
        [
          el('div', { display: 'flex', padding: '4px 10px', backgroundColor: 'rgba(58,43,15,0.7)' }, '✦  KNOX EDITION'),
          el('div', { display: 'flex', padding: '4px 10px', backgroundColor: 'rgba(58,43,15,0.7)' }, counter(input.index, input.total)),
        ],
      ),
      // Золотая полоса-разделитель
      el('div', { position: 'absolute', top: PHOTO_H - 4, left: 0, width: SLIDE_W, height: 4, backgroundColor: KNOX.gold }),
      // Cream-плашка снизу
      el(
        'div',
        { position: 'absolute', top: PHOTO_H, left: 0, width: SLIDE_W, height: SLIDE_H - PHOTO_H, backgroundColor: KNOX.bg, padding: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
        [
          el(
            'div',
            { fontFamily: 'Tinos', fontWeight: 700, fontSize: 76, lineHeight: 1.0, color: KNOX.brown, letterSpacing: -2, display: 'flex' },
            input.title,
          ),
          el(
            'div',
            { marginTop: 18, fontFamily: 'Tinos', fontStyle: 'italic', fontSize: 32, color: KNOX.gold, lineHeight: 1.35, display: 'flex' },
            input.body,
          ),
        ],
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
            { fontFamily: 'Tinos', color: KNOX.textBody, fontSize: input.mediaDataUri ? 30 : 36, lineHeight: 1.4, display: 'flex' },
            input.body,
          ),
        ],
      ),
      ...(input.mediaDataUri
        ? [
            // Премиальная рамка с золотом, как у YouTube-мокапов knox
            el(
              'div',
              {
                marginTop: 32,
                padding: 6,
                backgroundColor: KNOX.brown,
                display: 'flex',
                alignSelf: 'stretch',
                flex: 1,
                maxHeight: 460,
              },
              el(
                'div',
                {
                  padding: 4,
                  backgroundColor: KNOX.gold,
                  display: 'flex',
                  flex: 1,
                },
                el(
                  'img',
                  { width: '100%', height: '100%', objectFit: 'contain' },
                  undefined,
                  { src: input.mediaDataUri! },
                ),
              ),
            ),
          ]
        : []),
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

// ═══════════════════════════════════════════════════════════════════════
// STYLE 4: NEON-TECH (deep purple + cyan glow + glass cards)
// ═══════════════════════════════════════════════════════════════════════
const NEON = {
  bg: '#0A001F',
  bgDeep: '#020010',
  glass: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(0,240,255,0.35)',
  text: '#F0F4FF',
  textDim: '#A4B8E6',
  textMute: '#6478B0',
  cyan: '#00F0FF',
  electric: '#2D5BFF',
  purple: '#A020F0',
  pink: '#FF2DAA',
};

const NEON_BG_GRADIENT =
  'radial-gradient(circle at 20% 10%, rgba(160,32,240,0.45) 0%, transparent 55%),' +
  'radial-gradient(circle at 85% 75%, rgba(0,240,255,0.32) 0%, transparent 55%),' +
  'linear-gradient(180deg, #0A001F 0%, #020010 100%)';

function neonNode(input: RenderSlideInput): JSXNode {
  if (input.kind === 'cover') return neonCover(input);
  if (input.kind === 'cta') return neonCTA(input);
  return neonReveal(input);
}

function neonCover(input: RenderSlideInput): JSXNode {
  const avatarLayer: JSXNode = input.avatarDataUri
    ? el(
        'div',
        {
          position: 'absolute',
          bottom: 100,
          right: 64,
          width: 380,
          height: 380,
          borderRadius: 190,
          overflow: 'hidden',
          border: `3px solid ${NEON.cyan}`,
          boxShadow: `0 0 60px ${NEON.cyan}`,
          display: 'flex',
        },
        el(
          'img',
          { width: 380, height: 380, objectFit: 'cover' },
          undefined,
          { src: input.avatarDataUri },
        ),
      )
    : el('div', { display: 'flex' });
  return el(
    'div',
    {
      position: 'relative',
      width: SLIDE_W,
      height: SLIDE_H,
      display: 'flex',
      backgroundImage: NEON_BG_GRADIENT,
    },
    [
      // grid wireframe
      el('div', {
        position: 'absolute',
        top: 0,
        left: 0,
        width: SLIDE_W,
        height: SLIDE_H,
        backgroundImage:
          'linear-gradient(rgba(0,240,255,0.06) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(0,240,255,0.06) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }),
      // top label
      el(
        'div',
        {
          position: 'absolute',
          top: 56,
          left: 64,
          right: 64,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'JetBrainsMono',
          fontSize: 22,
          letterSpacing: 4,
          textTransform: 'uppercase',
          color: NEON.cyan,
        },
        [
          el(
            'div',
            {
              display: 'flex',
              padding: '6px 14px',
              border: `1px solid ${NEON.glassBorder}`,
              backgroundColor: NEON.glass,
            },
            '/ NEON · AI · OS',
          ),
          el('div', { display: 'flex', color: NEON.textDim }, counter(input.index, input.total)),
        ],
      ),
      // headline
      el(
        'div',
        {
          position: 'absolute',
          top: 240,
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
              fontFamily: 'Tinos',
              fontWeight: 700,
              fontSize: 108,
              lineHeight: 0.98,
              letterSpacing: -2,
              color: NEON.text,
              display: 'flex',
              textShadow: `0 0 28px ${NEON.cyan}`,
            },
            input.title,
          ),
          el(
            'div',
            {
              fontFamily: 'Tinos',
              fontStyle: 'italic',
              fontSize: 36,
              lineHeight: 1.35,
              color: NEON.textDim,
              display: 'flex',
              maxWidth: 760,
            },
            input.body,
          ),
        ],
      ),
      avatarLayer,
      // CTA strip
      el(
        'div',
        {
          position: 'absolute',
          bottom: 72,
          left: 64,
          display: 'flex',
          padding: '14px 24px',
          border: `1px solid ${NEON.cyan}`,
          backgroundColor: NEON.glass,
          color: NEON.cyan,
          fontFamily: 'JetBrainsMono',
          fontWeight: 700,
          fontSize: 24,
          letterSpacing: 4,
          textTransform: 'uppercase',
        },
        '◇  SWIPE →',
      ),
    ],
  );
}

function neonReveal(input: RenderSlideInput): JSXNode {
  const hasMedia = Boolean(input.mediaDataUri);
  const stepLabel = `// ${String(input.index).padStart(2, '0')}`;
  return el(
    'div',
    {
      width: SLIDE_W,
      height: SLIDE_H,
      display: 'flex',
      flexDirection: 'column',
      padding: 72,
      position: 'relative',
      backgroundImage: NEON_BG_GRADIENT,
    },
    [
      // grid wireframe
      el('div', {
        position: 'absolute',
        top: 0,
        left: 0,
        width: SLIDE_W,
        height: SLIDE_H,
        backgroundImage:
          'linear-gradient(rgba(0,240,255,0.05) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(0,240,255,0.05) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }),
      el(
        'div',
        {
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'JetBrainsMono',
          fontSize: 22,
          letterSpacing: 4,
          textTransform: 'uppercase',
          color: NEON.cyan,
        },
        [
          el('div', { display: 'flex' }, stepLabel),
          el('div', { display: 'flex', color: NEON.textDim }, counter(input.index, input.total)),
        ],
      ),
      // glow underline
      el('div', {
        marginTop: 18,
        width: 140,
        height: 3,
        backgroundColor: NEON.cyan,
        boxShadow: `0 0 16px ${NEON.cyan}`,
      }),
      el(
        'div',
        {
          marginTop: hasMedia ? 36 : 56,
          fontFamily: 'Tinos',
          fontWeight: 700,
          fontSize: hasMedia ? 64 : 84,
          lineHeight: 1.05,
          letterSpacing: -1,
          color: NEON.text,
          display: 'flex',
        },
        input.title,
      ),
      // glass card body
      el(
        'div',
        {
          marginTop: 36,
          padding: 36,
          backgroundColor: NEON.glass,
          border: `1px solid ${NEON.glassBorder}`,
          display: 'flex',
        },
        el(
          'div',
          {
            fontFamily: 'Tinos',
            fontSize: hasMedia ? 28 : 34,
            lineHeight: 1.4,
            color: NEON.textDim,
            display: 'flex',
          },
          input.body,
        ),
      ),
      ...(hasMedia
        ? [
            el(
              'div',
              {
                marginTop: 28,
                padding: 8,
                background: 'linear-gradient(135deg, #2D5BFF 0%, #A020F0 50%, #FF2DAA 100%)',
                display: 'flex',
                alignSelf: 'stretch',
                flex: 1,
                maxHeight: 440,
              },
              el(
                'div',
                {
                  padding: 4,
                  backgroundColor: NEON.bgDeep,
                  display: 'flex',
                  flex: 1,
                },
                el(
                  'img',
                  { width: '100%', height: '100%', objectFit: 'contain' },
                  undefined,
                  { src: input.mediaDataUri! },
                ),
              ),
            ),
          ]
        : []),
    ],
  );
}

function neonCTA(input: RenderSlideInput): JSXNode {
  return el(
    'div',
    {
      width: SLIDE_W,
      height: SLIDE_H,
      display: 'flex',
      flexDirection: 'column',
      padding: 80,
      position: 'relative',
      justifyContent: 'center',
      backgroundImage: NEON_BG_GRADIENT,
    },
    [
      el('div', {
        position: 'absolute',
        top: 0,
        left: 0,
        width: SLIDE_W,
        height: SLIDE_H,
        backgroundImage:
          'linear-gradient(rgba(0,240,255,0.05) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(0,240,255,0.05) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }),
      el(
        'div',
        {
          position: 'absolute',
          top: 56,
          left: 64,
          right: 64,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'JetBrainsMono',
          fontSize: 22,
          letterSpacing: 4,
          textTransform: 'uppercase',
          color: NEON.pink,
        },
        [el('div', { display: 'flex' }, '◇  FINAL'), el('div', { display: 'flex', color: NEON.textDim }, counter(input.index, input.total))],
      ),
      el(
        'div',
        {
          fontFamily: 'Tinos',
          fontWeight: 700,
          fontSize: 104,
          lineHeight: 1.0,
          letterSpacing: -2,
          color: NEON.text,
          display: 'flex',
          textShadow: `0 0 32px ${NEON.pink}`,
        },
        input.title,
      ),
      el(
        'div',
        {
          marginTop: 40,
          fontFamily: 'Tinos',
          fontStyle: 'italic',
          fontSize: 38,
          lineHeight: 1.4,
          color: NEON.textDim,
          display: 'flex',
        },
        input.body,
      ),
      el(
        'div',
        {
          marginTop: 60,
          padding: '24px 40px',
          background: `linear-gradient(90deg, ${NEON.electric}, ${NEON.pink})`,
          color: NEON.text,
          fontFamily: 'JetBrainsMono',
          fontWeight: 700,
          fontSize: 30,
          letterSpacing: 4,
          textTransform: 'uppercase',
          alignSelf: 'flex-start',
          display: 'flex',
        },
        '◇  COMMENT "AI"',
      ),
    ],
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STYLE 5: HANDWRITTEN-VIRAL (paper + marker + sticky notes)
// ═══════════════════════════════════════════════════════════════════════
const PAPER = {
  bg: '#F4ECD8',
  bgDeep: '#E8DEC2',
  ink: '#1A1612',
  inkSoft: '#403828',
  red: '#E63946',
  yellow: '#FFD400',
  yellowSoft: '#FFE665',
  blue: '#2D5BFF',
};

const PAPER_GRID = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  width: SLIDE_W,
  height: SLIDE_H,
  backgroundImage:
    'linear-gradient(rgba(26,22,18,0.06) 1px, transparent 1px),' +
    'linear-gradient(90deg, rgba(26,22,18,0.06) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
};

function paperNode(input: RenderSlideInput): JSXNode {
  if (input.kind === 'cover') return paperCover(input);
  if (input.kind === 'cta') return paperCTA(input);
  return paperReveal(input);
}

function paperCover(input: RenderSlideInput): JSXNode {
  const avatarTile: JSXNode = input.avatarDataUri
    ? el(
        'div',
        {
          position: 'absolute',
          bottom: 100,
          right: 80,
          width: 340,
          height: 420,
          padding: 12,
          backgroundColor: '#FFFFFF',
          border: `3px solid ${PAPER.ink}`,
          boxShadow: '8px 8px 0 rgba(26,22,18,0.85)',
          transform: 'rotate(3deg)',
          display: 'flex',
        },
        el(
          'img',
          { width: '100%', height: '100%', objectFit: 'cover' },
          undefined,
          { src: input.avatarDataUri },
        ),
      )
    : el('div', { display: 'flex' });
  return el(
    'div',
    { position: 'relative', width: SLIDE_W, height: SLIDE_H, display: 'flex', backgroundColor: PAPER.bg },
    [
      el('div', PAPER_GRID),
      // sticky note
      el(
        'div',
        {
          position: 'absolute',
          top: 60,
          left: 60,
          padding: '10px 18px',
          backgroundColor: PAPER.yellowSoft,
          border: `2px solid ${PAPER.ink}`,
          transform: 'rotate(-4deg)',
          fontFamily: 'JetBrainsMono',
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: 2,
          color: PAPER.ink,
          textTransform: 'uppercase',
          display: 'flex',
        },
        '// VIRAL NOTE',
      ),
      el(
        'div',
        {
          position: 'absolute',
          top: 76,
          right: 80,
          fontFamily: 'JetBrainsMono',
          fontSize: 22,
          letterSpacing: 4,
          color: PAPER.inkSoft,
          display: 'flex',
        },
        counter(input.index, input.total),
      ),
      // headline + scribble underline
      el(
        'div',
        {
          position: 'absolute',
          top: 220,
          left: 80,
          right: 80,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        },
        [
          el(
            'div',
            {
              fontFamily: 'Tinos',
              fontStyle: 'italic',
              fontWeight: 700,
              fontSize: 104,
              lineHeight: 1.0,
              color: PAPER.ink,
              display: 'flex',
            },
            input.title,
          ),
          // highlighter strip
          el('div', {
            width: 320,
            height: 22,
            backgroundColor: PAPER.yellow,
            marginTop: -6,
          }),
          el(
            'div',
            {
              marginTop: 12,
              fontFamily: 'Tinos',
              fontSize: 36,
              lineHeight: 1.4,
              color: PAPER.inkSoft,
              maxWidth: 640,
              display: 'flex',
            },
            input.body,
          ),
        ],
      ),
      avatarTile,
      // red marker arrow
      el(
        'div',
        {
          position: 'absolute',
          bottom: 80,
          left: 80,
          padding: '10px 16px',
          backgroundColor: PAPER.red,
          color: '#FFFFFF',
          fontFamily: 'JetBrainsMono',
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: 4,
          textTransform: 'uppercase',
          transform: 'rotate(-2deg)',
          display: 'flex',
        },
        '→ листай дальше',
      ),
    ],
  );
}

function paperReveal(input: RenderSlideInput): JSXNode {
  const hasMedia = Boolean(input.mediaDataUri);
  const bullets = splitBullets(input.body);
  const useChecklist = !hasMedia && bullets.length >= 2;
  return el(
    'div',
    {
      width: SLIDE_W,
      height: SLIDE_H,
      backgroundColor: PAPER.bg,
      display: 'flex',
      flexDirection: 'column',
      padding: 72,
      position: 'relative',
    },
    [
      el('div', PAPER_GRID),
      // top sticky
      el(
        'div',
        {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'JetBrainsMono',
          fontSize: 22,
          color: PAPER.inkSoft,
        },
        [
          el(
            'div',
            {
              display: 'flex',
              padding: '6px 14px',
              backgroundColor: PAPER.yellowSoft,
              border: `2px solid ${PAPER.ink}`,
              transform: 'rotate(-3deg)',
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: PAPER.ink,
            },
            `STEP ${String(input.index).padStart(2, '0')}`,
          ),
          el(
            'div',
            { display: 'flex', letterSpacing: 4 },
            counter(input.index, input.total),
          ),
        ],
      ),
      // scribbled underline (offset rectangle to mimic marker stroke)
      el(
        'div',
        {
          marginTop: 48,
          fontFamily: 'Tinos',
          fontStyle: 'italic',
          fontWeight: 700,
          fontSize: hasMedia ? 60 : 80,
          lineHeight: 1.05,
          color: PAPER.ink,
          display: 'flex',
        },
        input.title,
      ),
      el('div', {
        marginTop: -4,
        width: 240,
        height: 14,
        backgroundColor: PAPER.yellow,
        transform: 'skewY(-1deg)',
      }),
      useChecklist
        ? el(
            'div',
            { marginTop: 48, display: 'flex', flexDirection: 'column', gap: 22 },
            bullets.slice(0, 6).map((b, idx) =>
              el(
                'div',
                {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  padding: '10px 14px',
                  backgroundColor: idx % 2 === 0 ? '#FFFFFF' : 'transparent',
                  border: idx % 2 === 0 ? `2px solid ${PAPER.ink}` : 'none',
                  transform: `rotate(${idx % 2 === 0 ? -0.4 : 0.4}deg)`,
                },
                [
                  el(
                    'div',
                    {
                      width: 36,
                      height: 36,
                      backgroundColor: PAPER.red,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'JetBrainsMono',
                      fontWeight: 700,
                      fontSize: 22,
                      flexShrink: 0,
                    },
                    '✓',
                  ),
                  el(
                    'div',
                    {
                      fontFamily: 'Tinos',
                      color: PAPER.ink,
                      fontSize: 32,
                      lineHeight: 1.35,
                      display: 'flex',
                      flex: 1,
                    },
                    b,
                  ),
                ],
              ),
            ),
          )
        : el(
            'div',
            {
              marginTop: 36,
              padding: 28,
              backgroundColor: '#FFFFFF',
              border: `2px solid ${PAPER.ink}`,
              transform: 'rotate(-0.4deg)',
              boxShadow: '6px 6px 0 rgba(26,22,18,0.85)',
              fontFamily: 'Tinos',
              color: PAPER.ink,
              fontSize: hasMedia ? 28 : 34,
              lineHeight: 1.4,
              display: 'flex',
            },
            input.body,
          ),
      ...(hasMedia
        ? [
            el(
              'div',
              {
                marginTop: 32,
                padding: 12,
                backgroundColor: '#FFFFFF',
                border: `3px solid ${PAPER.ink}`,
                transform: 'rotate(0.6deg)',
                boxShadow: '8px 8px 0 rgba(26,22,18,0.85)',
                display: 'flex',
                alignSelf: 'stretch',
                flex: 1,
                maxHeight: 420,
              },
              el(
                'img',
                { width: '100%', height: '100%', objectFit: 'contain' },
                undefined,
                { src: input.mediaDataUri! },
              ),
            ),
          ]
        : []),
    ],
  );
}

function paperCTA(input: RenderSlideInput): JSXNode {
  return el(
    'div',
    {
      width: SLIDE_W,
      height: SLIDE_H,
      backgroundColor: PAPER.bg,
      display: 'flex',
      flexDirection: 'column',
      padding: 80,
      position: 'relative',
      justifyContent: 'center',
    },
    [
      el('div', PAPER_GRID),
      el(
        'div',
        {
          position: 'absolute',
          top: 64,
          left: 80,
          padding: '8px 16px',
          backgroundColor: PAPER.red,
          color: '#FFFFFF',
          fontFamily: 'JetBrainsMono',
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: 4,
          textTransform: 'uppercase',
          transform: 'rotate(-3deg)',
          display: 'flex',
        },
        '★ FINAL',
      ),
      el(
        'div',
        {
          position: 'absolute',
          top: 70,
          right: 80,
          fontFamily: 'JetBrainsMono',
          fontSize: 22,
          letterSpacing: 4,
          color: PAPER.inkSoft,
          display: 'flex',
        },
        counter(input.index, input.total),
      ),
      el(
        'div',
        {
          fontFamily: 'Tinos',
          fontStyle: 'italic',
          fontWeight: 700,
          fontSize: 96,
          lineHeight: 1.05,
          color: PAPER.ink,
          display: 'flex',
        },
        input.title,
      ),
      el('div', {
        marginTop: -2,
        width: 360,
        height: 18,
        backgroundColor: PAPER.yellow,
        transform: 'skewY(-1deg)',
      }),
      el(
        'div',
        {
          marginTop: 36,
          fontFamily: 'Tinos',
          fontSize: 38,
          lineHeight: 1.4,
          color: PAPER.inkSoft,
          display: 'flex',
        },
        input.body,
      ),
      el(
        'div',
        {
          marginTop: 56,
          padding: '20px 32px',
          backgroundColor: PAPER.ink,
          color: PAPER.yellowSoft,
          fontFamily: 'JetBrainsMono',
          fontWeight: 700,
          fontSize: 30,
          letterSpacing: 4,
          textTransform: 'uppercase',
          alignSelf: 'flex-start',
          transform: 'rotate(-1deg)',
          display: 'flex',
        },
        '✎  SAVE & SHARE',
      ),
    ],
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SHARED COVER-TYPE RENDERERS (Object / Split / UI)
// Используют токены стиля (STYLE_TOKENS) и адаптируют общий layout под
// палитру конкретного стиля. Активируются когда coverType !== 'avatar'.
// ═══════════════════════════════════════════════════════════════════════

function coverTypeHeader(input: RenderSlideInput, tokens: StyleTokens, label: string): JSXNode {
  return el(
    'div',
    {
      position: 'absolute',
      top: 56,
      left: 64,
      right: 64,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontFamily: tokens.mono,
      fontSize: 22,
      letterSpacing: 4,
      textTransform: 'uppercase',
      color: tokens.accent,
    },
    [
      el('div', { display: 'flex' }, `${tokens.mark}  ${label}`),
      el('div', { display: 'flex', color: tokens.textDim }, counter(input.index, input.total)),
    ],
  );
}

// ─── OBJECT COVER ──────────────────────────────────────────────────────
// Большой объект по центру + huge typography. Если есть mediaDataUri —
// используем как «объект». Иначе — placeholder: огромный mono-символ
// (мини-маркер стиля), стилизованный как 3D-логотип.
function coverTypeObject(input: RenderSlideInput, tokens: StyleTokens): JSXNode {
  const object: JSXNode = input.mediaDataUri
    ? el(
        'div',
        {
          width: 560,
          height: 560,
          display: 'flex',
          padding: 16,
          backgroundColor: tokens.surface,
          border: `2px solid ${tokens.accent}`,
        },
        el(
          'img',
          { width: '100%', height: '100%', objectFit: 'contain' },
          undefined,
          { src: input.mediaDataUri },
        ),
      )
    : el(
        'div',
        {
          width: 480,
          height: 480,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: tokens.serif,
          fontWeight: 700,
          fontSize: 320,
          lineHeight: 1,
          color: tokens.accent,
          backgroundColor: tokens.surface,
          border: `2px solid ${tokens.accent}`,
        },
        tokens.mark,
      );

  return el(
    'div',
    {
      position: 'relative',
      width: SLIDE_W,
      height: SLIDE_H,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: tokens.bg,
      padding: 64,
      justifyContent: 'space-between',
    },
    [
      coverTypeHeader(input, tokens, 'OBJECT'),
      // Object centered in middle
      el(
        'div',
        {
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 72,
        },
        object,
      ),
      // Headline at bottom
      el(
        'div',
        { display: 'flex', flexDirection: 'column', gap: 18 },
        [
          el(
            'div',
            {
              fontFamily: tokens.serif,
              fontWeight: 700,
              fontSize: 84,
              lineHeight: 1.0,
              letterSpacing: -1,
              color: tokens.text,
              display: 'flex',
            },
            input.title,
          ),
          el(
            'div',
            {
              fontFamily: tokens.serif,
              fontStyle: 'italic',
              fontSize: 30,
              lineHeight: 1.35,
              color: tokens.textDim,
              display: 'flex',
              maxWidth: 880,
            },
            input.body,
          ),
        ],
      ),
    ],
  );
}

// ─── SPLIT COVER ──────────────────────────────────────────────────────
// Левая половина = тезис A, правая = тезис B. Берём title и распиливаем
// по " vs " / " / " / "—". Если разделителя нет — слева title, справа
// первое предложение body как «второй полюс».
function splitTitle(title: string, body: string): { left: string; right: string } {
  const seps = [/\s+vs\.?\s+/i, /\s+\/\s+/, /\s+—\s+/, /\s+vs\s+/i];
  for (const re of seps) {
    if (re.test(title)) {
      const [a, b] = title.split(re);
      return { left: (a || '').trim(), right: (b || '').trim() };
    }
  }
  // fallback: title vs первое предложение body
  const firstSent = (body.split(/[.!?]/)[0] || '').trim().slice(0, 40);
  return { left: title.trim(), right: firstSent || 'NEW' };
}

function coverTypeSplit(input: RenderSlideInput, tokens: StyleTokens): JSXNode {
  const { left, right } = splitTitle(input.title, input.body);
  return el(
    'div',
    {
      position: 'relative',
      width: SLIDE_W,
      height: SLIDE_H,
      display: 'flex',
      backgroundColor: tokens.bg,
    },
    [
      // Left half
      el(
        'div',
        {
          width: SLIDE_W / 2,
          height: SLIDE_H,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 56,
          backgroundColor: tokens.bg,
        },
        [
          el(
            'div',
            {
              fontFamily: tokens.mono,
              fontSize: 22,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: tokens.textDim,
              marginBottom: 16,
              display: 'flex',
            },
            'A',
          ),
          el(
            'div',
            {
              fontFamily: tokens.serif,
              fontWeight: 700,
              fontSize: 96,
              lineHeight: 1.0,
              textAlign: 'center',
              color: tokens.text,
              display: 'flex',
            },
            left,
          ),
        ],
      ),
      // Right half — accent-coloured
      el(
        'div',
        {
          width: SLIDE_W / 2,
          height: SLIDE_H,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 56,
          backgroundColor: tokens.accent,
        },
        [
          el(
            'div',
            {
              fontFamily: tokens.mono,
              fontSize: 22,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: tokens.bg,
              marginBottom: 16,
              display: 'flex',
            },
            'B',
          ),
          el(
            'div',
            {
              fontFamily: tokens.serif,
              fontWeight: 700,
              fontSize: 96,
              lineHeight: 1.0,
              textAlign: 'center',
              color: tokens.bg,
              display: 'flex',
            },
            right,
          ),
        ],
      ),
      // Top + bottom shared bands
      el(
        'div',
        {
          position: 'absolute',
          top: 48,
          left: 56,
          right: 56,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: tokens.mono,
          fontSize: 22,
          letterSpacing: 4,
          textTransform: 'uppercase',
        },
        [
          el('div', { display: 'flex', color: tokens.text }, `${tokens.mark} SPLIT`),
          el('div', { display: 'flex', color: tokens.bg }, counter(input.index, input.total)),
        ],
      ),
      // body subtitle centered at bottom across both halves
      el(
        'div',
        {
          position: 'absolute',
          bottom: 56,
          left: 56,
          right: 56,
          fontFamily: tokens.mono,
          fontSize: 24,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: tokens.text,
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
        },
        input.body.toUpperCase().slice(0, 80),
      ),
    ],
  );
}

// ─── UI COVER ──────────────────────────────────────────────────────────
// Дашборд / скриншот / browser window как hero. Использует mediaDataUri
// (если есть) внутри chrome-frame с дотами macOS-стиля. Заголовок снизу.
function coverTypeUI(input: RenderSlideInput, tokens: StyleTokens): JSXNode {
  const chromeBar = el(
    'div',
    {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '12px 18px',
      backgroundColor: tokens.surface,
      borderBottom: `1px solid ${tokens.textMute}`,
    },
    [
      el('div', { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF5F57', display: 'flex' }),
      el('div', { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FEBC2E', display: 'flex' }),
      el('div', { width: 14, height: 14, borderRadius: 7, backgroundColor: '#28C840', display: 'flex' }),
      el(
        'div',
        {
          marginLeft: 16,
          fontFamily: tokens.mono,
          fontSize: 18,
          color: tokens.textDim,
          display: 'flex',
        },
        'persona-studio.app',
      ),
    ],
  );

  const screen: JSXNode = input.mediaDataUri
    ? el(
        'img',
        { width: '100%', height: '100%', objectFit: 'cover' },
        undefined,
        { src: input.mediaDataUri },
      )
    : el(
        'div',
        {
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: tokens.mono,
          fontSize: 80,
          letterSpacing: 6,
          color: tokens.accent,
          backgroundColor: tokens.bg,
        },
        '◼ ◼ ◼',
      );

  return el(
    'div',
    {
      position: 'relative',
      width: SLIDE_W,
      height: SLIDE_H,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: tokens.bg,
      padding: 56,
      paddingTop: 130,
    },
    [
      coverTypeHeader(input, tokens, 'UI / SCREEN'),
      // Browser-window mock
      el(
        'div',
        {
          width: SLIDE_W - 112,
          flex: 1,
          maxHeight: 760,
          display: 'flex',
          flexDirection: 'column',
          border: `2px solid ${tokens.text}`,
          backgroundColor: tokens.surface,
          overflow: 'hidden',
        },
        [chromeBar, el('div', { flex: 1, display: 'flex' }, screen)],
      ),
      // Headline
      el(
        'div',
        { marginTop: 32, display: 'flex', flexDirection: 'column', gap: 14 },
        [
          el(
            'div',
            {
              fontFamily: tokens.serif,
              fontWeight: 700,
              fontSize: 72,
              lineHeight: 1.05,
              letterSpacing: -1,
              color: tokens.text,
              display: 'flex',
            },
            input.title,
          ),
          el(
            'div',
            {
              fontFamily: tokens.serif,
              fontStyle: 'italic',
              fontSize: 28,
              lineHeight: 1.35,
              color: tokens.textDim,
              display: 'flex',
              maxWidth: 880,
            },
            input.body,
          ),
        ],
      ),
    ],
  );
}
