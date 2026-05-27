import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,js,jsx,html}'],
  theme: {
    extend: {
      colors: {
        // Luxury Editorial AI Studio palette.
        // Legacy tokens (bg/surface/border/text/lime/cyan/pink/warm) preserved so
        // existing pages keep rendering while we wrap them in new UI.
        bg: '#050505',
        'bg-main': '#050505',
        'bg-panel': '#0D0D0C',
        'bg-card': '#11110F',
        surface: '#0D0D0C',
        'surface-2': '#11110F',
        'surface-3': '#161613',
        border: 'rgba(255,255,255,0.08)',
        'border-soft': 'rgba(255,255,255,0.08)',
        'border-2': 'rgba(255,255,255,0.14)',
        text: '#F5F1E8',
        'text-primary': '#F5F1E8',
        'text-dim': '#A8A098',
        'text-secondary': '#A8A098',
        'text-mute': '#6F6A64',
        'text-muted': '#6F6A64',
        'text-faint': '#3a3a3a',
        // accents
        gold: '#D7B76A',
        'accent-gold': '#D7B76A',
        lime: '#C7FF4A',
        'accent-lime': '#C7FF4A',
        cyan: '#65D8FF',
        'accent-blue': '#65D8FF',
        pink: '#FF5C9A',
        'accent-pink': '#FF5C9A',
        warm: '#D7B76A',
        danger: '#FF4D5E',
        success: '#C7FF4A',
      },
      fontFamily: {
        // Editorial serif for big display text, Inter for UI, mono for labels.
        serif: ['"Playfair Display"', '"Cormorant Garamond"', '"Libre Baskerville"', 'Georgia', 'Times New Roman', 'serif'],
        display: ['"Playfair Display"', '"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', '"Geist"', '"Neue Haas Grotesk"', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'SF Mono', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        widest: '0.22em',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(215,183,106,0.25), 0 12px 40px rgba(0,0,0,0.55)',
        'glow-lime': '0 0 0 1px rgba(199,255,74,0.25), 0 12px 40px rgba(0,0,0,0.55)',
        editorial: '0 24px 60px rgba(0,0,0,0.55)',
      },
      backgroundImage: {
        'noise': 'radial-gradient(circle at 20% 20%, rgba(215,183,106,0.06), transparent 50%)',
      },
    },
  },
  plugins: [],
};

export default config;
