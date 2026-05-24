// HTML/CSS templates for the six slide types. Each slide renders as a
// self-contained 1080×1350 (Instagram 4:5) HTML document that Puppeteer
// screenshots to PNG. Visual code (accent, handle, category tag) comes from the
// rubric config; fonts are system fonts with Cyrillic + emoji coverage so the
// renderer needs no network at render time.

import type { Slide } from '../schemas/carousel.js';
import type { RubricConfig } from '../lib/rubrics.js';

export interface RenderContext {
  rubric: RubricConfig;
  index: number; // 0-based
  total: number;
}

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;

const SANS = `'Liberation Sans', 'DejaVu Sans', 'Noto Color Emoji', sans-serif`;
const MONO = `'DejaVu Sans Mono', 'Liberation Mono', monospace`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function topBar(ctx: RenderContext, dark: boolean): string {
  const color = dark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.45)';
  const tag = ctx.rubric.categoryTag ? escapeHtml(ctx.rubric.categoryTag) : '';
  return `
    <div class="topbar" style="color:${color}">
      <span class="handle">${escapeHtml(ctx.rubric.handle)}</span>
      <span class="meta">${tag}<span class="counter">${ctx.index + 1}/${ctx.total}</span></span>
    </div>`;
}

function css(accent: string): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${SLIDE_WIDTH}px; height: ${SLIDE_HEIGHT}px; }
    body { font-family: ${SANS}; overflow: hidden; }
    .slide { position: relative; width: ${SLIDE_WIDTH}px; height: ${SLIDE_HEIGHT}px; display: flex; flex-direction: column; }
    .topbar { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between;
      align-items: center; padding: 40px 56px; font-size: 26px; font-weight: bold; z-index: 5; }
    .topbar .meta { display: flex; gap: 28px; align-items: center; }
    .topbar .counter { opacity: 0.7; }

    /* cover */
    .cover { justify-content: flex-end; color: #fff; padding: 0 64px 96px; }
    .cover .label { text-transform: uppercase; letter-spacing: 3px; font-weight: bold; font-size: 30px;
      color: ${accent}; margin-bottom: 28px; }
    .cover h1 { text-transform: uppercase; font-weight: bold; font-size: 96px; line-height: 0.98;
      letter-spacing: -1px; -webkit-text-stroke: 1.5px #fff; }
    .cover .subtitle { text-transform: uppercase; font-size: 34px; line-height: 1.25; font-weight: bold;
      color: rgba(255,255,255,0.82); margin-top: 28px; }
    .cover .swipe { margin-top: 56px; font-size: 30px; font-weight: bold; letter-spacing: 4px; }

    /* light content slides */
    .content { background: #fff; color: #16181c; justify-content: center; align-items: center;
      text-align: center; padding: 140px 96px; }
    .content .title { font-size: 64px; font-weight: bold; line-height: 1.1; margin-bottom: 56px; }
    .content .title.accent { color: ${accent}; }

    .list { width: 100%; max-width: 760px; text-align: left; }
    .list li { list-style: none; display: flex; align-items: flex-start; gap: 28px; font-size: 42px;
      line-height: 1.3; margin: 26px 0; }
    .list li::before { content: '✓'; flex: 0 0 auto; width: 52px; height: 52px; border-radius: 50%;
      background: ${accent}; color: #fff; font-size: 30px; display: flex; align-items: center;
      justify-content: center; margin-top: 4px; }

    .quote .mark { font-size: 160px; line-height: 0.6; color: ${accent}; }
    .quote .text { font-size: 60px; font-weight: bold; line-height: 1.25; margin: 24px 0 36px; }
    .quote .author { font-size: 34px; color: rgba(0,0,0,0.5); }

    .stat .value { font-size: 220px; font-weight: bold; color: ${accent}; line-height: 1; }
    .stat .caption { font-size: 46px; margin-top: 24px; line-height: 1.3; }

    .code { background: #0d1117; color: #e6edf3; align-items: stretch; text-align: left; }
    .code .lang { color: ${accent}; font-family: ${MONO}; font-size: 28px; margin-bottom: 24px; }
    .code pre { font-family: ${MONO}; font-size: 32px; line-height: 1.5; white-space: pre-wrap;
      word-break: break-word; }
    .code .caption { margin-top: 40px; font-size: 34px; color: rgba(255,255,255,0.7); }

    .cta { background: #fff; color: #16181c; }
    .cta .emoji { font-size: 80px; margin-bottom: 32px; }
    .cta .keyword { font-size: 92px; font-weight: bold; color: ${accent}; text-decoration: underline;
      text-decoration-thickness: 6px; text-underline-offset: 12px; line-height: 1.1; }
    .cta .action { font-size: 42px; line-height: 1.35; margin-top: 44px; max-width: 760px; }
  `;
}

function coverBody(slide: Extract<Slide, { type: 'cover' }>, ctx: RenderContext): string {
  const bg = ctx.rubric.coverBg ?? '#101418';
  const label = slide.label ? `<div class="label">${escapeHtml(slide.label)}</div>` : '';
  const subtitle = slide.subtitle
    ? `<div class="subtitle">${escapeHtml(slide.subtitle)}</div>`
    : '';
  const style = `background:
    linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.0) 35%, rgba(0,0,0,0.55) 100%), ${bg};`;
  return `<div class="slide cover" style="${style}">
    ${topBar(ctx, true)}
    ${label}
    <h1>${escapeHtml(slide.title)}</h1>
    ${subtitle}
    <div class="swipe">SWIPE LEFT →</div>
  </div>`;
}

function listBody(slide: Extract<Slide, { type: 'list' }>, ctx: RenderContext): string {
  const title = slide.title ? `<div class="title">${escapeHtml(slide.title)}</div>` : '';
  const items = slide.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
  return `<div class="slide content">
    ${topBar(ctx, false)}
    ${title}
    <ul class="list">${items}</ul>
  </div>`;
}

function quoteBody(slide: Extract<Slide, { type: 'quote' }>, ctx: RenderContext): string {
  const author = slide.author ? `<div class="author">— ${escapeHtml(slide.author)}</div>` : '';
  return `<div class="slide content quote">
    ${topBar(ctx, false)}
    <div class="mark">“</div>
    <div class="text">${escapeHtml(slide.text)}</div>
    ${author}
  </div>`;
}

function statBody(slide: Extract<Slide, { type: 'stat' }>, ctx: RenderContext): string {
  return `<div class="slide content stat">
    ${topBar(ctx, false)}
    <div class="value">${escapeHtml(slide.value)}</div>
    <div class="caption">${escapeHtml(slide.caption)}</div>
  </div>`;
}

function codeBody(slide: Extract<Slide, { type: 'code' }>, ctx: RenderContext): string {
  const lang = slide.language ? `<div class="lang">${escapeHtml(slide.language)}</div>` : '';
  const caption = slide.caption ? `<div class="caption">${escapeHtml(slide.caption)}</div>` : '';
  return `<div class="slide code content" style="background:#0d1117;color:#e6edf3;text-align:left;align-items:flex-start;justify-content:center;">
    ${topBar(ctx, true)}
    ${lang}
    <pre>${escapeHtml(slide.code)}</pre>
    ${caption}
  </div>`;
}

function ctaBody(slide: Extract<Slide, { type: 'cta' }>, ctx: RenderContext): string {
  return `<div class="slide content cta">
    ${topBar(ctx, false)}
    <div class="emoji">✍️</div>
    <div class="keyword">${escapeHtml(slide.headline)}</div>
    <div class="action">${escapeHtml(slide.action)}</div>
  </div>`;
}

function slideBody(slide: Slide, ctx: RenderContext): string {
  switch (slide.type) {
    case 'cover':
      return coverBody(slide, ctx);
    case 'list':
      return listBody(slide, ctx);
    case 'quote':
      return quoteBody(slide, ctx);
    case 'stat':
      return statBody(slide, ctx);
    case 'code':
      return codeBody(slide, ctx);
    case 'cta':
      return ctaBody(slide, ctx);
  }
}

export function renderSlideHtml(slide: Slide, ctx: RenderContext): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>${css(ctx.rubric.accent)}</style>
</head>
<body>${slideBody(slide, ctx)}</body>
</html>`;
}
