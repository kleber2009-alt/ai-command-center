// Генерация ASS-субтитров (libass, фильтр ffmpeg `ass`) в стиле скилла:
//   - Cap     — субтитры 1–3 слова (pop: масштаб 1.25 → 1 за 120 мс) или
//               караоке-фраза (будущие слова приглушены);
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
  const style = (name: string, o: { font: string; size: number; color: string; outlineColor: string; back: string; border: 1 | 3; outline: number; shadow: number }) =>
    `Style: ${name},${o.font},${o.size},${o.color},&H000000FF,${o.outlineColor},${o.back},0,0,0,0,100,100,0,0,${o.border},${o.outline},${o.shadow},5,80,80,0,1`;

  const capBase = plate
    ? { border: 3 as const, outline: Math.round(p.capSize * 0.18), shadow: 0, outlineColor: assColor(plate), back: assColor('#000000', 0xff) }
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
    const verbY = wide ? 330 : 640;
    const wordY = wide ? 500 : 820;
    ev(3, ctaStart, input.duration, 'CtaVerb', `{\\an5\\pos(${cx},${verbY})\\fad(150,0)}${esc(applyCase(p.ctaVerb, st.titleCase))}`);
    ev(3, ctaStart + 0.15, input.duration, 'CtaWord', `{\\an5\\pos(${cx},${wordY})\\fscx120\\fscy120\\t(0,140,\\fscx100\\fscy100)}«${esc(word.toUpperCase())}»`);
    if (p.ctaVerb === 'напишите') {
      ev(3, ctaStart + 0.3, input.duration, 'CtaVerb', `{\\an5\\pos(${cx},${wordY + 180})\\fs56}${esc('в комментариях')}`);
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
    if (p.mode === 'karaoke') {
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
      ev(1, c.s, c.e, 'Cap', `{${capPos}\\fscx125\\fscy125\\t(0,120,\\fscx100\\fscy100)}${text}`);
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
