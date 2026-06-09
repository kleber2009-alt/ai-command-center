// ═══════════════════════════════════════════════════════════════════
// lib/pdf.js — pure-JS PDF rendering via pdf-lib
// ───────────────────────────────────────────────────────────────────
// Используется weekly_recap.js для генерации скачиваемого артефакта
// (Telegram sendDocument). Без headless Chromium — всё в Node.
// ═══════════════════════════════════════════════════════════════════

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 56;
const LINE_HEIGHT = 16;

/**
 * Render a weekly recap PDF.
 * Cyrillic-safe: pdf-lib's StandardFonts don't include Cyrillic, so we
 * embed DejaVu Sans (or any local TTF). If no font available — falls back
 * to Helvetica и кириллица будет проксена `?` (визуально некрасиво, но
 * не падает).
 */
export async function renderWeeklyRecapPdf({ userName, recap, deliveredCount, usedCount, weekRange }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const font = await loadFont(doc);
  const bold = font.bold || font.regular;

  let page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN;

  const drawText = (text, opts = {}) => {
    const size = opts.size || 11;
    const useFont = opts.bold ? bold : font.regular;
    const color = opts.color || rgb(0.05, 0.05, 0.1);
    const maxWidth = A4_WIDTH - 2 * MARGIN;
    const lines = wrapText(String(text), useFont, size, maxWidth);
    for (const line of lines) {
      if (y < MARGIN + LINE_HEIGHT) {
        page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
        y = A4_HEIGHT - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y, size, font: useFont, color });
      y -= size * 1.45;
    }
    y -= opts.gap ?? 6;
  };

  // ── Header ──
  drawText('AI Growth Office', { size: 9, color: rgb(0.4, 0.5, 0.6) });
  drawText(`Еженедельный отчёт · ${weekRange}`, { size: 22, bold: true, gap: 14 });
  drawText(`Для: ${userName}`, { size: 11, color: rgb(0.3, 0.35, 0.45), gap: 10 });

  // ── Stats line ──
  drawText(`📦 Артефактов доставлено: ${deliveredCount} · ✅ Использовано: ${usedCount}`,
    { size: 12, bold: true, gap: 18 });

  // ── Recap body ──
  drawText('Recap', { size: 14, bold: true, gap: 8 });
  drawText(recap, { size: 11, gap: 14 });

  // ── Footer ──
  drawText('— Алиса 🎯, начальник офиса', { size: 10, color: rgb(0.5, 0.5, 0.6) });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

// ─── Helpers ───────────────────────────────────────────────────────
async function loadFont(doc) {
  // Try DejaVu Sans (typical Linux container has it under /usr/share/fonts).
  // Falls back to Helvetica (cyrillic будет ? — но шрифт не упадёт).
  const paths = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  ];
  const boldPaths = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  ];
  const fs = await import('node:fs/promises');
  for (let i = 0; i < paths.length; i++) {
    try {
      const reg = await fs.readFile(paths[i]);
      const regFont = await doc.embedFont(reg, { subset: true });
      let boldFont;
      try {
        const b = await fs.readFile(boldPaths[i]);
        boldFont = await doc.embedFont(b, { subset: true });
      } catch { boldFont = regFont; }
      return { regular: regFont, bold: boldFont };
    } catch { /* try next */ }
  }
  // Fallback — Helvetica (нет кириллицы)
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvB = await doc.embedFont(StandardFonts.HelveticaBold);
  return { regular: helv, bold: helvB };
}

function wrapText(text, font, size, maxWidth) {
  const out = [];
  for (const para of String(text).split(/\n/)) {
    if (!para.trim()) { out.push(''); continue; }
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      const trial = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = trial;
      }
    }
    if (line) out.push(line);
  }
  return out;
}
