import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,js,jsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: '#080808',
        s1: '#111118',
        s2: '#181820',
        border: '#1f1f28',
        text: '#e8e4f0',
        muted: '#6b6880',
        accent: '#c8f060',
        cyan: '#60c8f0',
        pink: '#f06090',
        orange: '#f0640a',
        red: '#f04060',
        green: '#60f090',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
