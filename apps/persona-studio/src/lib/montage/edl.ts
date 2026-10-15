// EDL монтажа по скиллу montazh-rils (edl_phrases.py): по пословным таймкодам
// оставляем речь, вырезаем паузы длиннее gapMax, вокруг слов — запас keep.
// Затем переносим слова на выходной таймлайн и режем их на субтитры 1–3 слова
// (или фразы для караоке). Чистые функции — покрыты tests/montage.test.ts.

export type Word = { w: string; s: number; e: number };
export type Segment = { s: number; e: number };
export type Caption = { s: number; e: number; words: Word[]; accent: number | null };

/** Сегменты исходника, которые остаются в ролике. */
export function keepSegments(words: Word[], duration: number, opts: { gapMax: number; keep: number }): Segment[] {
  const ws = words.filter((w) => w.e > w.s).sort((a, b) => a.s - b.s);
  if (ws.length === 0) return [{ s: 0, e: duration }];
  const segs: Segment[] = [];
  for (const w of ws) {
    const s = Math.max(0, w.s - opts.keep);
    const e = Math.min(duration, w.e + opts.keep);
    const last = segs[segs.length - 1];
    // пауза между словами ≤ gapMax (+ запасы) — склеиваем в один сегмент
    if (last && s - last.e <= opts.gapMax) last.e = Math.max(last.e, e);
    else segs.push({ s, e });
  }
  return segs.filter((x) => x.e - x.s > 0.05);
}

/** Время исходника → время ролика после вырезки. null — момент вырезан. */
export function mapTime(t: number, segs: Segment[]): number | null {
  let acc = 0;
  for (const g of segs) {
    if (t < g.s) return null;
    if (t <= g.e) return acc + (t - g.s);
    acc += g.e - g.s;
  }
  return null;
}

export function totalDuration(segs: Segment[]): number {
  return segs.reduce((a, g) => a + (g.e - g.s), 0);
}

/** Слова на выходном таймлайне (слово целиком внутри сегмента — после keepSegments так всегда). */
export function remapWords(words: Word[], segs: Segment[]): Word[] {
  const out: Word[] = [];
  for (const w of words) {
    const s = mapTime(w.s, segs);
    const e = mapTime(w.e, segs);
    if (s == null || e == null || e <= s) continue;
    out.push({ w: w.w, s, e });
  }
  return out;
}

const PUNCT_END = /[.!?…,;:—]$/;

/** «Сильное» слово для акцента: число или длинное слово (≥ 6 букв). */
function accentScore(w: string): number {
  const clean = w.replace(/[^\p{L}\p{N}%]/gu, '');
  if (/\d/.test(clean)) return 100;
  return clean.length >= 6 ? clean.length : 0;
}

/**
 * Режем слова на субтитры по [min, max] слов. Граница — пунктуация или пауза
 * > 0.35 c; длинная строка (> maxChars) тоже закрывает субтитр. Акцент — одно
 * сильное слово, не чаще чем в каждом втором субтитре (лаймовый акцент скилла).
 */
export function buildCaptions(words: Word[], opts: { min: number; max: number; maxChars: number }): Caption[] {
  const caps: Caption[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    caps.push({ s: cur[0].s, e: cur[cur.length - 1].e, words: cur, accent: null });
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    cur.push(w);
    const chars = cur.map((x) => x.w).join(' ').length;
    const pause = next ? next.s - w.e : Infinity;
    const boundary = PUNCT_END.test(w.w) || pause > 0.35;
    if (cur.length >= opts.max || chars >= opts.maxChars || (boundary && cur.length >= opts.min) || pause > 0.8) flush();
  }
  flush();

  // субтитр висит до начала следующего (без мигания), но не дольше +0.6 c
  for (let i = 0; i < caps.length; i++) {
    const nextS = caps[i + 1]?.s ?? Infinity;
    caps[i].e = Math.min(nextS, caps[i].e + 0.6);
  }

  let prevAccent = false;
  for (const c of caps) {
    if (prevAccent) {
      prevAccent = false;
      continue;
    }
    let best = -1;
    let bestScore = 0;
    c.words.forEach((w, i) => {
      const sc = accentScore(w.w);
      if (sc > bestScore) {
        bestScore = sc;
        best = i;
      }
    });
    if (best >= 0) {
      c.accent = best;
      prevAccent = true;
    }
  }
  return caps;
}
