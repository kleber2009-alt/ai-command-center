// Стили монтажа из мини-аппа «Студия Кадрика»: 31 скилл и стиль Creator Pack.
// Монтирует сам бот Кадрика — Claude Code со скиллом на машине бота
// (src/lib/montage/kadrik.ts, воркер kadrik-montage). Данные и примеры —
// scripts/sync-kadrik-styles.mjs, руками kadrik-styles.data.json не править.
// Модуль чистый (без env/DB) — нужен и клиенту (галерея), и воркеру, и API.

import data from './kadrik-styles.data.json';

export type KadrikKind = 'reels' | 'styles' | 'youtube' | 'clips' | 'content';
/** что нужно на вход: видео, ссылка, текст или папка на машине бота */
export type KadrikInput = 'video' | 'link' | 'text' | 'folder';
export type KadrikFormat = '9:16' | '16:9' | 'text';

export type KadrikStyle = {
  id: string;
  name: string;
  kind: KadrikKind;
  /** коротко, что внутри */
  sub: string;
  desc: string;
  /** что получится на выходе */
  get: string;
  /** что нужно на вход, словами */
  need: string;
  inp: KadrikInput;
  tags: string[];
  format: KadrikFormat;
  poster: string | null;
  video: string | null;
};

export const KADRIK_STYLES = data as KadrikStyle[];

export function findKadrikStyle(id: string): KadrikStyle | undefined {
  return KADRIK_STYLES.find((s) => s.id === id);
}

/** скилл с папкой футажей работает только на машине бота — из Persona не запустить */
export function kadrikRunnable(s: KadrikStyle) {
  return s.inp !== 'folder';
}

/** во сколько раз дороже рилса — как в Кадрике: длинный YouTube-ролик = 4 монтажа */
export function kadrikCostFactor(s: KadrikStyle) {
  return s.kind === 'youtube' ? 4 : 1;
}

type Noun = [one: string, few: string, many: string];
export type KadrikGroup = { key: string; title: string; format?: string; noun: Noun; styles: KadrikStyle[] };

const STYLE: Noun = ['стиль', 'стиля', 'стилей'];
const TOOL: Noun = ['инструмент', 'инструмента', 'инструментов'];

// Группы галереи как на витрине: вертикальные — сеткой по 4, 16:9 — по 2.
const GROUPS: { key: string; title: string; format?: string; noun: Noun; pick: (s: KadrikStyle) => boolean }[] = [
  { key: 'short', title: 'Рилсы', format: '9:16', noun: STYLE, pick: (s) => (s.kind === 'reels' || s.kind === 'clips') && s.format === '9:16' },
  { key: 'styles', title: 'Стили @ilia.paliy', format: '9:16', noun: STYLE, pick: (s) => s.kind === 'styles' },
  { key: 'long', title: 'Длинные видео и клипы', format: '16:9', noun: STYLE, pick: (s) => s.format === '16:9' },
  { key: 'tools', title: 'Инструменты к стилям', noun: TOOL, pick: (s) => s.kind === 'content' },
];

export function kadrikGroups(styles: KadrikStyle[] = KADRIK_STYLES): KadrikGroup[] {
  const used = new Set<string>();
  return GROUPS.map(({ pick, ...g }) => {
    const list = styles.filter((s) => !used.has(s.id) && pick(s));
    list.forEach((s) => used.add(s.id));
    return { ...g, styles: list };
  }).filter((g) => g.styles.length);
}

/** «14 стилей», «3 инструмента» */
export function countLabel(n: number, [one, few, many]: Noun) {
  const d = n % 10;
  const dd = n % 100;
  const w = d === 1 && dd !== 11 ? one : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
  return `${n} ${w}`;
}
