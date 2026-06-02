/** Design tokens for the Club Der Denker client. Single source of truth. */

export const colors = {
  bg: '#0f0f12',
  surface: '#1a1a20',
  surfaceAlt: '#23232c',
  border: '#2e2e38',
  text: '#f5f5f7',
  textMuted: '#a1a1aa',
  textFaint: '#71717a',
  accent: '#6d5dfc',
  accentText: '#ffffff',
  success: '#34d399',
  danger: '#f87171',
  warn: '#fbbf24',
  overlay: 'rgba(0,0,0,0.6)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  title: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
};
