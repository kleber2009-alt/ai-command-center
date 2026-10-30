// Design tokens of the «Огненный сплит» style, measured from the reference (1080×1920, 30 fps).
// Change the look here, not in components.
import {continueRender, delayRender, staticFile} from 'remotion';

// Fonts ship with the kit (public/fonts, OFL): variable Montserrat 100–900 and JetBrains Mono, cyrillic + latin.
// Local files, so renders work offline and behind proxies.
const fonts: [string, string, string][] = [
  ['Montserrat', 'montserrat-cyrillic-wght-normal.woff2', 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'],
  ['Montserrat', 'montserrat-latin-wght-normal.woff2', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'],
  ['JetBrains Mono', 'jetbrains-mono-cyrillic-wght-normal.woff2', 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'],
  ['JetBrains Mono', 'jetbrains-mono-latin-wght-normal.woff2', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'],
];
if (typeof document !== 'undefined') {
  const handle = delayRender('Loading local fonts');
  Promise.all(
    fonts.map(([family, file, range]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format('woff2')`, {weight: '100 900', unicodeRange: range});
      document.fonts.add(face);
      return face.load();
    }),
  ).then(() => continueRender(handle), () => continueRender(handle));
}

export const T = {
  w: 1080,
  h: 1920,
  fps: 30,

  font: "'Montserrat', sans-serif",
  mono: "'JetBrains Mono', monospace",

  // colors
  bg: '#000000',
  ember: '#4A1300', // warm glow under the face frame / bottom of the frame
  emberHot: '#8E3201',
  cardBg: '#080605', // card fill
  row: '#0F0C0D', // row / input fill inside a card
  rowBorder: 'rgba(255,255,255,0.06)',
  grid: 'rgba(255,255,255,0.035)',
  gridStep: 44,
  text: '#F2EEE4', // warm white
  sub: '#8C8580', // grey labels
  dim: '#4A4442',
  orange: '#F65A0A', // keyword pill, number tile
  orangeText: '#EC7434', // orange words inside cards
  orangeBar: '#F2803B', // progress bars
  chipBg: '#2C190F', // background of /command chips
  chipText: '#E8743A',
  red: '#B81F0D', // block behind a face-caption line
  purple: '#6E53AC',
  green: '#59A968',
  slider: ['#F25815', '#F87F04', '#EE8B00', '#A2850F', '#698822'],

  // neon edge of cards and the face frame
  edge: '#E89A5C',
  glow: [
    '0 0 0 3px #E89A5C',
    '0 0 14px 4px rgba(232,104,26,0.95)',
    '0 0 44px 12px rgba(214,84,10,0.65)',
    '0 0 96px 26px rgba(160,50,0,0.40)',
    'inset 0 0 22px rgba(230,110,30,0.30)',
  ].join(', '),

  // layout of the split screen
  card: {x: 90, y: 192, w: 900, h: 700, r: 48},
  caption: {y: 951, size: 46}, // centre line of the word caption between card and face
  face: {x: 76, y: 1012, w: 928, h: 850, r: 48},

  // full-screen face captions
  faceCaption: {top: 1265, size: 88, lineH: 94, maxW: 900},

  // easing durations in frames
  dur: {word: 4, pill: 5, cube: 12, zoom: 10, smear: 7, shine: 14},
};

export type Word = {text: string; at: number; hl?: boolean}; // at = frame when the word appears
