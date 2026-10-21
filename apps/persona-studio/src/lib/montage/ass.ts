// Генерация ASS-субтитров (libass, фильтр ffmpeg `ass`) в стиле скилла:
//   - Cap     — субтитры 1–3 слова (pop: появляются разом, вход по preset.entry),
//               караоке-фраза (будущие слова приглушены) или reveal — слова
//               проявляются по мере речи (будущие невидимы, но держат место,
//               поэтому строка не перестраивается);
//   - Hook    — титр хука сверху в первые ~3 c, проявление из размытия;
//   - Cta*    — финальный призыв «пиши «СЛОВО»» со словом на плашке.
// Шрифты — семейства из public/fonts (имена совпадают с name-таблицей TTF).

import { applyCase, contrast, parseAccents } from '@/lib/skills/styles';
import type { Caption } from './edl';
import { frameSize, presetStyle, type MontagePreset } from './presets';

/** #RRGGBB (+альфа 0..255, 0 = непрозрачно) → &HAABBGGRR */
export function assColor(hex: string, alpha = 0): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m ? m[1] : 'FFFFFF';
  const [r, g, b] = [rgb.slice(0, 2), rgb.slice(2, 4), rgb.slice(4, 6)];
  return `&H${alpha.toString(16).padStart(2, '0')}${b}${g}${r}`.toUpperCase();
}

/** Цвет для inline override-тега: `\c&HBBGGRR&` (без альфы, с закрывающим &). */
function tagColor(hex: string): string {
  return `${assColor(hex).replace(/^&H../, '&H')}&`;
}

function ts(t: number): string {
  const v = Math.max(0, t);
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const s = v % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

/** Текст пользователя → безопасный для ASS (фигурные скобки = override-теги). */
function esc(s: string): string {
  return s.replace(/[{}]/g, '').replace(/\\/g, '/').replace(/\n/g, ' ');
}

/**
 * Кегли в пресетах — CSS-пиксели, как в Remotion-проектах скиллов. libass же
 * трактует Fontsize как высоту строки по Win-метрикам шрифта
 * ((usWinAscent + usWinDescent) / unitsPerEm), поэтому без пересчёта текст
 * выходит на 25–35 % мельче задуманного. Коэффициенты измерены рендером «Н» на
 * кегле 200 и совпадают с OS/2-метриками TTF из public/fonts.
 */
const LIBASS_EM: Record<string, number> = {
  Montserrat: 1.562,
  MontserratAlternates: 1.379,
  Onest: 1.546,
  InterTight: 1.424,
  Inter: 1.43,
  Unbounded: 1.548,
  Manrope: 1.366,
  Nunito: 1.377,
  Playfair: 1.41,
  JetBrainsMono: 1.32,
  'JetBrains Mono': 1.565,
  Cormorant: 1.38,
  PTSerif: 1.325,
  Oswald: 1.702,
  PressStart2P: 1.374,
  MarckScript: 1.249,
  Tinos: 1.107,
};

/** CSS-пиксели скилла → Fontsize для libass (по семейству «Montserrat 800» → Montserrat). */
export function assFontSize(font: string, cssPx: number): number {
  const fam = LIBASS_EM[font] ? font : font.replace(/ (\d{3}|Italic|\d{3} Italic)$/, '');
  return Math.round(cssPx * (LIBASS_EM[fam] ?? 1.45));
}

type Entry = NonNullable<MontagePreset['entry']>;

/**
 * Вход нового слова внутри строки (reveal). Только прозрачность, размытие и
 * вертикальный масштаб: горизонтальный \fscx или сдвиг поменяли бы ширину
 * слова и сдвинули соседей.
 */
function inlineEntry(entry: Entry): { from: string; to: string; ms: number } {
  switch (entry) {
    case 'rise':
      return { from: '\\alpha&HFF&\\blur14\\fscy92', to: '\\alpha&H00&\\blur0\\fscy100', ms: 280 };
    case 'scale-blur':
      return { from: '\\alpha&HFF&\\blur12\\fscy135', to: '\\alpha&H00&\\blur0\\fscy100', ms: 167 };
    case 'blur-slide':
      return { from: '\\alpha&HFF&\\blur6', to: '\\alpha&H00&\\blur0', ms: 133 };
    default:
      return { from: '\\fscy125', to: '\\fscy100', ms: 120 };
  }
}

/** Вход субтитра целиком (pop): позиция + анимация по скиллу. */
function blockEntry(entry: Entry, x: number, y: number): string {
  switch (entry) {
    case 'blur-slide': // neon-schema Word.tsx: 4 кадра, сдвиг 18 px, размытие 6 → 0
      return `\\an5\\move(${x + 18},${y},${x},${y},0,133)\\fad(133,0)\\blur6\\t(0,133,\\blur0)`;
    case 'rise': // ui-motion Headline: размытие 14 → 0, подъём 28 px
      return `\\an5\\move(${x},${y + 28},${x},${y},0,300)\\fad(200,0)\\blur14\\t(0,300,\\blur0)`;
    case 'scale-blur': // YouTube Captions.tsx: масштаб 1.35 → 1, размытие 12 → 0, 5 кадров
      return `\\an5\\pos(${x},${y})\\fad(100,0)\\fscx135\\fscy135\\blur12\\t(0,167,\\fscx100\\fscy100\\blur0)`;
    default: // montazh-rils: масштаб 1.25 → 1 за 120 мс
      return `\\an5\\pos(${x},${y})\\fscx125\\fscy125\\t(0,120,\\fscx100\\fscy100)`;
  }
}

export type AssInput = {
  preset: MontagePreset;
  captions: Caption[];
  duration: number;
  hookTitle?: string | null;
  ctaWord?: string | null;
};

export function buildAss(input: AssInput): string {
  const { preset: p } = input;
  const st = presetStyle(p);
  const { w, h } = frameSize(p.format);
  const cx = Math.round(w / 2);
  const wide = p.format === '16:9';

  // Акцент цветом на белых субтитрах. Лайм палия по яркости почти как белый,
  // но отличим по цвету — оставляем; только белый акцент (журнал) не виден,
  // там отличие даёт курсив.
  const accentColor = contrast(st.accent, '#FFFFFF') < 1.05 ? '#FFFFFF' : st.accent;
  const plate = p.plate;

  // Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour,
  // Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline,
  // Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
  // size — в CSS-пикселях скилла; в ASS пишем пересчитанный под libass кегль
  const style = (name: string, o: { font: string; size: number; color: string; outlineColor: string; back: string; border: 1 | 3; outline: number; shadow: number }) =>
    `Style: ${name},${o.font},${assFontSize(o.font, o.size)},${o.color},&H000000FF,${o.outlineColor},${o.back},0,0,0,0,100,100,0,0,${o.border},${o.outline},${o.shadow},5,80,80,0,1`;

  const capBase = plate
    ? { border: 3 as const, outline: Math.round(p.capSize * 0.18), shadow: 0, outlineColor: assColor(plate), back: assColor('#000000', 0xff) }
    : p.shadowOnly
      ? // без обводки, только тень ~ rgba(0,0,0,.55) (promo-face / neon-schema / YouTube)
        { border: 1 as const, outline: 0, shadow: Math.max(3, Math.round(p.capSize * 0.05)), outlineColor: assColor('#000000', 0x60), back: assColor('#000000', 0x73) }
      : { border: 1 as const, outline: 3, shadow: 2, outlineColor: assColor('#000000', 0x60), back: assColor('#000000', 0x80) };

  const boxStyle = {
    font: p.capFont, size: p.capSize, color: assColor(st.accentInk), outlineColor: assColor(st.accent),
    back: assColor('#000000', 0xff), border: 3 as const, outline: Math.round(p.capSize * 0.14), shadow: 0,
  };

  const styles = [
    style('Cap', { font: p.capFont, size: p.capSize, color: assColor(p.capColor), ...capBase }),
    style('CapBox', boxStyle),
    style('Hook', {
      font: st.titleFont, size: wide ? 110 : 92, color: assColor('#FFFFFF'), outlineColor: assColor('#000000', 0x70),
      back: assColor('#000000', 0x90), border: 1, outline: 3, shadow: 3,
    }),
    style('CtaVerb', {
      font: st.titleFont, size: wide ? 100 : 90, color: assColor('#FFFFFF'), outlineColor: assColor('#000000', 0x70),
      back: assColor('#000000', 0x90), border: 1, outline: 3, shadow: 3,
    }),
    style('CtaWord', {
      font: st.titleFont, size: wide ? 150 : 130, color: assColor(st.accentInk), outlineColor: assColor(st.accent),
      back: assColor('#000000', 0xff), border: 3, outline: 22, shadow: 0,
    }),
  ];

  const casing = (s: string) => applyCase(s, p.capCase);
  // Акцентное слово: цвет / плашка (inline \r на стиль CapBox) / курсив.
  const accentWord = (word: string) => {
    if (p.accent === 'box') return `{\\rCapBox}${esc(word)}{\\rCap}`;
    if (p.accent === 'italic') return `{\\fn${st.accentFont ?? p.capFont}\\c${tagColor(accentColor)}}${esc(word)}{\\r}`;
    return `{\\c${tagColor(accentColor)}}${esc(word)}{\\c${tagColor(p.capColor)}}`;
  };
  const capPos = `\\an5\\pos(${cx},${p.capY})`;

  const events: string[] = [];
  const ev = (layer: number, s: number, e: number, styleName: string, text: string) =>
    events.push(`Dialogue: ${layer},${ts(s)},${ts(e)},${styleName},,0,0,0,,${text}`);

  // ── хук: первые ≤3 c, но не больше 40% ролика
  const hookEnd = Math.min(3, input.duration * 0.4);
  const hookY = wide ? 160 : 330;
  if (input.hookTitle?.trim() && hookEnd > 0.8) {
    const lines = parseAccents(applyCase(input.hookTitle.trim(), st.titleCase));
    const text = lines
      .map((parts) => parts.map((x) => (x.accent ? `{\\c${tagColor(accentColor)}}${esc(x.text)}{\\c${tagColor('#FFFFFF')}}` : esc(x.text))).join(''))
      .join('\\N');
    ev(2, 0, hookEnd, 'Hook', `{\\an8\\pos(${cx},${hookY})\\fad(120,200)\\blur10\\t(0,240,\\blur0)}${text}`);
  }

  // ── призыв: последние 3 c (ролики ≥ 8 c)
  const word = input.ctaWord?.trim().replace(/[«»"]/g, '');
  const ctaStart = input.duration - 3;
  if (word && input.duration >= 8) {
    // Глагол привязан низом над центром (при переносе растёт вверх), слово на
    // плашке — верхом под центром: не пересекаются при любом кегле и переносе.
    const mid = wide ? 430 : 760;
    const wordCss = wide ? 150 : 130;
    ev(3, ctaStart, input.duration, 'CtaVerb', `{\\an2\\pos(${cx},${mid - 24})\\fad(150,0)}${esc(applyCase(p.ctaVerb, st.titleCase))}`);
    ev(3, ctaStart + 0.15, input.duration, 'CtaWord', `{\\an8\\pos(${cx},${mid + 40})\\fscx120\\fscy120\\t(0,140,\\fscx100\\fscy100)}«${esc(word.toUpperCase())}»`);
    if (p.ctaVerb === 'напишите') {
      const belowY = mid + 40 + Math.round(wordCss * 1.3) + 60;
      ev(3, ctaStart + 0.3, input.duration, 'CtaVerb', `{\\an8\\pos(${cx},${belowY})\\fs${assFontSize(st.titleFont, 56)}}${esc('в комментариях')}`);
    }
  }

  // Субтитры сверху (кобальт) делят место с хуком — пока висит хук, их не показываем.
  const hookShown = Boolean(input.hookTitle?.trim() && hookEnd > 0.8);
  const capsUnderHook = p.capY < hookY + 360;

  // ── субтитры
  for (const c of input.captions) {
    if (c.e <= c.s) continue;
    if (hookShown && capsUnderHook && c.s < hookEnd) continue;
    const words = c.words.map((x) => casing(x.w));
    if (p.mode === 'reveal') {
      // одно событие на шаг речи: прошлые слова стоят, новое входит по preset.entry,
      // будущие невидимы (но занимают место — строка не прыгает).
      const en = inlineEntry(p.entry ?? 'rise');
      const lead = p.lead ?? 0;
      let prevS = c.s;
      for (let i = 0; i < c.words.length; i++) {
        const s = i === 0 ? c.s : Math.max(prevS, c.words[i].s - lead);
        const e = i === c.words.length - 1 ? c.e : Math.max(s, c.words[i + 1].s - lead);
        prevS = s;
        if (e <= s) continue;
        const text = words
          .map((wd, j) => {
            if (j > i) return `{\\alpha&HFF&}${esc(wd)}{\\alpha&H00&}`;
            const isAccent = j === c.accent;
            if (j < i) return isAccent ? accentWord(wd) : esc(wd);
            // только что произнесённое слово
            if (isAccent && p.accent === 'box') {
              return `{\\rCapBox${en.from}\\t(0,${en.ms},${en.to})}${esc(wd)}{\\rCap}`;
            }
            const rest = isAccent && p.accent === 'color' ? accentColor : p.capColor;
            const active = p.activeColor && !isAccent
              ? `\\1c${tagColor(p.activeColor)}\\t(200,470,\\1c${tagColor(rest)})`
              : '';
            const body = isAccent ? accentWord(wd) : esc(wd);
            return `{${en.from}${active}\\t(0,${en.ms},${en.to})}${body}{\\alpha&H00&\\blur0\\fscy100\\1c${tagColor(p.capColor)}}`;
          })
          .join(' ');
        ev(1, s, e, 'Cap', `{${capPos}\\q0}${text}`);
      }
    } else if (p.mode === 'karaoke') {
      // одно событие на каждое произнесённое слово: прошлые — ярко, будущие — приглушены
      for (let i = 0; i < c.words.length; i++) {
        const s = i === 0 ? c.s : c.words[i].s;
        const e = i === c.words.length - 1 ? c.e : c.words[i + 1].s;
        if (e <= s) continue;
        const text = words
          .map((wd, j) => {
            if (j > i) return `{\\alpha&HA0&}${esc(wd)}{\\alpha&H00&}`;
            return j === c.accent ? accentWord(wd) : esc(wd);
          })
          .join(' ');
        ev(1, s, e, 'Cap', `{${capPos}\\q0}${text}`);
      }
    } else {
      const text = words.map((wd, j) => (j === c.accent ? accentWord(wd) : esc(wd))).join(' ');
      ev(1, c.s, c.e, 'Cap', `{${blockEntry(p.entry ?? 'pop', cx, p.capY)}}${text}`);
    }
  }

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}
