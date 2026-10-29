// Rendering of a carousel remix (skill ilia-carousel-style) inside our
// satori/resvg pipeline — no inpainting, no headless browser:
//
//   keep  → the original slide as-is (pass-through when it is already a 4:5
//           JPEG, otherwise cover-fit to 1080×1350, JPEG q93);
//   cover → the original cover as a full-bleed background; the text zone is
//           calmed with a blurred + darkened copy of itself (sharp) that fades
//           into the untouched image, then the new hook is set in the skill's
//           typography: Jost 600 caps + Tinos Italic accent #DE984A;
//   cta   → the original last slide treated the same way + «Пиши «СЛОВО» в
//           комментариях →», the code word big in Tinos Italic #F0973E and
//           «Сохраняй, чтобы не потерять».
//
// The veil hides the old cover text (we cannot erase it pixel-exactly) while
// keeping the photo / screenshots of the original visible around it.

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { loadFonts } from './fonts';
import type { RemixSlide, TextPos, Veil } from './remix';
import { normalizeCodeWord } from './remix';

export const REMIX_W = 1080;
export const REMIX_H = 1350;

const INK = '#FCFBFA';
const ACCENT = '#DE984A';
const ACCENT_CTA = '#F0973E';
const DARK = '#0B0B0B';

type Node = { type: string; props: Record<string, unknown> & { style?: Record<string, unknown>; children?: unknown } };
const el = (type: string, style: Record<string, unknown>, children?: Node | Node[] | string, extra?: Record<string, unknown>): Node => ({
  type,
  props: { style, children, ...(extra ?? {}) },
});

// ── images ────────────────────────────────────────────────────────────

/**
 * An unchanged slide. Keeps the original bytes when they already are a 4:5
 * JPEG (pixel-for-pixel), else cover-fits to 1080×1350.
 */
export async function normalizeKeepSlide(buf: Buffer): Promise<{ body: Buffer; contentType: string }> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const is45 = w > 0 && h > 0 && Math.abs(w / h - 0.8) < 0.005;
  if (is45 && meta.format === 'jpeg' && w >= 1080) return { body: buf, contentType: 'image/jpeg' };
  const body = await sharp(buf).rotate().resize(REMIX_W, REMIX_H, { fit: 'cover', position: 'centre' }).jpeg({ quality: 93 }).toBuffer();
  return { body, contentType: 'image/jpeg' };
}

/** Text zone (fraction of height) per position: [fully veiled from, to, fade length]. */
function zone(pos: TextPos): { from: number; to: number } {
  if (pos === 'bottom') return { from: 0.42, to: 1 };
  if (pos === 'center') return { from: 0.2, to: 0.8 };
  return { from: 0, to: 0.6 };
}

function gradientMaskSvg(pos: TextPos): string {
  const { from, to } = zone(pos);
  const fade = 0.14;
  const stops: Array<[number, number]> = [];
  if (from > 0) stops.push([0, 0], [Math.max(0, from - fade), 0]);
  stops.push([from, 1], [to, 1]);
  if (to < 1) stops.push([Math.min(1, to + fade), 0], [1, 0]);
  const s = stops.map(([o, a]) => `<stop offset="${o.toFixed(3)}" stop-color="${a ? '#fff' : '#000'}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${REMIX_W}" height="${REMIX_H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">${s}</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
}

/**
 * Background for a text slide: the original image with its text zone blurred
 * and darkened (veil=blur), only darkened (dark), or a plain dark plate (solid).
 */
export async function veiledBackground(src: Buffer | null, pos: TextPos, veil: Veil): Promise<Buffer> {
  if (!src || veil === 'solid') {
    return sharp({ create: { width: REMIX_W, height: REMIX_H, channels: 3, background: DARK } }).jpeg({ quality: 92 }).toBuffer();
  }
  const base = await sharp(src).rotate().resize(REMIX_W, REMIX_H, { fit: 'cover', position: 'centre' }).removeAlpha().toBuffer();
  const treated = sharp(base);
  if (veil === 'blur') treated.blur(34);
  const calm = await treated.modulate({ brightness: veil === 'blur' ? 0.34 : 0.22 }).removeAlpha().raw().toBuffer();
  const mask = await sharp(Buffer.from(gradientMaskSvg(pos))).resize(REMIX_W, REMIX_H).greyscale().extractChannel(0).raw().toBuffer();
  const overlay = await sharp(calm, { raw: { width: REMIX_W, height: REMIX_H, channels: 3 } })
    .joinChannel(mask, { raw: { width: REMIX_W, height: REMIX_H, channels: 1 } })
    .png()
    .toBuffer();
  return sharp(base).composite([{ input: overlay }]).jpeg({ quality: 92 }).toBuffer();
}

// ── text ──────────────────────────────────────────────────────────────

type Tok = { text: string; accent: boolean } | { br: true };

/** «text *accent* more\nnext» → tokens (word-level, so satori can wrap). */
export function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const lines = text.split('\n');
  lines.forEach((line, li) => {
    if (li > 0) out.push({ br: true });
    const parts = line.split(/(\*[^*]+\*)/g).filter(Boolean);
    for (const part of parts) {
      const accent = /^\*[^*]+\*$/.test(part);
      const raw = accent ? part.slice(1, -1) : part;
      for (const w of raw.split(/\s+/).filter(Boolean)) out.push({ text: w, accent });
    }
  });
  // Skill §5: the «→» arrow never wraps alone; a dash sticks to the next word.
  const glued: Tok[] = [];
  for (let i = 0; i < out.length; i++) {
    const t = out[i];
    const prev = glued[glued.length - 1];
    if (!('br' in t) && /^[→.,!?:;»)]+$/.test(t.text) && prev && !('br' in prev)) {
      prev.text = `${prev.text} ${t.text}`.replace(/ ([.,!?:;»)])/g, '$1');
      continue;
    }
    const next = out[i + 1];
    if (!('br' in t) && /^[—–-]$/.test(t.text) && next && !('br' in next)) {
      glued.push({ text: `${t.text} ${next.text}`, accent: next.accent });
      i++;
      continue;
    }
    glued.push(t);
  }
  return glued;
}

const plain = (text: string) => text.replace(/\*/g, '');

/** Font size so the text fits `maxLines` lines of `boxW` (rough glyph-width model). */
export function fitFont(text: string, opts: { max: number; min: number; boxW: number; maxLines: number; k: number }): number {
  const t = plain(text).trim();
  const longest = Math.max(1, ...t.split(/\s+/).map((w) => w.length));
  const byWord = opts.boxW / (longest * opts.k);
  const byLines = (opts.boxW * opts.maxLines) / (Math.max(1, t.length) * opts.k * 1.12);
  return Math.round(Math.max(opts.min, Math.min(opts.max, byWord, byLines)));
}

function richText(
  text: string,
  o: { size: number; lineHeight: number; font: string; color: string; accent: string; upper: boolean; align: 'center' | 'left'; accentScale?: number },
): Node {
  const toks = tokenize(text);
  const children: Node[] = toks.map((t) => {
    if ('br' in t) return el('div', { flexBasis: '100%', height: 0 });
    const word = o.upper ? t.text.toUpperCase() : t.text;
    return el(
      'span',
      t.accent
        ? {
            fontFamily: 'Tinos',
            fontStyle: 'italic',
            fontSize: Math.round(o.size * (o.accentScale ?? 1.02)),
            color: o.accent,
            marginRight: Math.round(o.size * 0.26),
            letterSpacing: -0.5,
          }
        : { fontFamily: o.font, color: o.color, marginRight: Math.round(o.size * 0.26) },
      word,
    );
  });
  return el(
    'div',
    {
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: o.align === 'center' ? 'center' : 'flex-start',
      alignItems: 'baseline',
      fontSize: o.size,
      lineHeight: o.lineHeight,
      width: '100%',
    },
    children,
  );
}

function placement(pos: TextPos): Record<string, unknown> {
  if (pos === 'bottom') return { justifyContent: 'flex-end', paddingBottom: 150 };
  if (pos === 'center') return { justifyContent: 'center' };
  return { justifyContent: 'flex-start', paddingTop: 150 };
}

function frame(bgDataUri: string, pos: TextPos, content: Node[]): Node {
  return el(
    'div',
    { position: 'relative', width: REMIX_W, height: REMIX_H, display: 'flex', backgroundColor: DARK },
    [
      el('img', { position: 'absolute', top: 0, left: 0, width: REMIX_W, height: REMIX_H, objectFit: 'cover' }, undefined, {
        src: bgDataUri,
        width: REMIX_W,
        height: REMIX_H,
      }),
      el(
        'div',
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: REMIX_W,
          height: REMIX_H,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingLeft: 70,
          paddingRight: 70,
          ...placement(pos),
        },
        content,
      ),
    ],
  );
}

function coverNode(bg: string, s: RemixSlide): Node {
  const pos = s.textPos ?? 'top';
  const boxW = REMIX_W - 140;
  const size = fitFont(s.title, { max: 104, min: 58, boxW, maxLines: 4, k: 0.68 });
  const subSize = fitFont(s.body || ' ', { max: 50, min: 34, boxW, maxLines: 3, k: 0.62 });
  const parts: Node[] = [
    richText(s.title, { size, lineHeight: 0.92, font: 'Jost 600', color: INK, accent: ACCENT, upper: true, align: 'center' }),
  ];
  if (s.body.trim()) {
    parts.push(
      el('div', { display: 'flex', marginTop: Math.round(size * 0.42), width: '100%' }, [
        richText(s.body, { size: subSize, lineHeight: 1.04, font: 'Jost 400', color: INK, accent: ACCENT, upper: true, align: 'center' }),
      ]),
    );
  }
  return frame(bg, pos, parts);
}

function ctaNode(bg: string, s: RemixSlide, codeWord: string): Node {
  const pos = s.textPos ?? 'center';
  const word = normalizeCodeWord(codeWord) || 'ГАЙД';
  const boxW = REMIX_W - 140;
  const wordSize = Math.round(Math.max(84, Math.min(170, boxW / (Math.max(2, word.length + 2) * 0.5))));
  const pishiSize = fitFont(s.title, { max: 52, min: 36, boxW, maxLines: 2, k: 0.64 });
  const parts: Node[] = [
    richText(s.title, { size: pishiSize, lineHeight: 1.08, font: 'Jost 500', color: INK, accent: ACCENT_CTA, upper: true, align: 'center', accentScale: 1.05 }),
    el(
      'div',
      { display: 'flex', marginTop: 34, marginBottom: 30, fontFamily: 'Tinos', fontStyle: 'italic', fontSize: wordSize, lineHeight: 1, color: ACCENT_CTA, letterSpacing: -1 },
      `«${word}»`,
    ),
  ];
  if (s.body.trim()) {
    parts.push(
      el('div', { display: 'flex', width: '100%' }, [
        richText(s.body, { size: 40, lineHeight: 1.15, font: 'Jost 400', color: INK, accent: ACCENT_CTA, upper: false, align: 'center' }),
      ]),
    );
  }
  parts.push(
    el('div', { display: 'flex', marginTop: 44, fontFamily: 'Jost 300', fontSize: 34, color: INK, opacity: 0.85 }, 'Сохраняй, чтобы не потерять'),
  );
  return frame(bg, pos, parts);
}

async function rasterize(node: Node): Promise<Buffer> {
  const fonts = await loadFonts();
  const svg = await satori(node as unknown as Parameters<typeof satori>[0], { width: REMIX_W, height: REMIX_H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: REMIX_W }, background: DARK }).render().asPng();
  return sharp(Buffer.from(png)).jpeg({ quality: 93 }).toBuffer();
}

const toDataUri = (buf: Buffer) => `data:image/jpeg;base64,${buf.toString('base64')}`;

/**
 * Render one remix slide (original look) → JPEG. `src` = the original image
 * bytes for this slide (null → dark plate).
 */
export async function renderRemixSlide(s: RemixSlide, src: Buffer | null, codeWord: string): Promise<{ body: Buffer; contentType: string }> {
  if (s.role === 'keep') {
    if (!src) throw new Error('keep slide without source image');
    return normalizeKeepSlide(src);
  }
  const pos = s.textPos ?? (s.role === 'cover' ? 'top' : 'center');
  const bg = await veiledBackground(src, pos, s.veil ?? 'blur');
  const node = s.role === 'cover' ? coverNode(toDataUri(bg), s) : ctaNode(toDataUri(bg), s, codeWord);
  return { body: await rasterize(node), contentType: 'image/jpeg' };
}
