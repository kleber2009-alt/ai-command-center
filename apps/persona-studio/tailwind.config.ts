import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,js,jsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: '#080808',
        surface: '#0f0f0f',
        'surface-2': '#141414',
        'surface-3': '#181818',
        border: '#1a1a1a',
        'border-2': '#2a2a2a',
        text: '#f5f0e8',
        'text-dim': '#b8b3a8',
        'text-mute': '#5a5550',
        'text-faint': '#3a3a3a',
        lime: '#c8f060',
        cyan: '#60c8f0',
        pink: '#f06090',
        warm: '#f0c860',
      },
      fontFamily: {
        serif: ['Georgia', 'Times New Roman', 'serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        widest: '0.22em',
      },
    },
  },
  plugins: [],
};

export default config;
