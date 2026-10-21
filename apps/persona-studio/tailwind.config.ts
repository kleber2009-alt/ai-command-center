import type { Config } from 'tailwindcss';

// UI-моушн design system (reels-ui-motion skill): near-black #0B0B0D with a
// faint grid, glass cards, one blue accent #1F7BFF plus pink / lime pills,
// Onest headlines in lowercase. Token NAMES are kept from the previous theme
// (gold = primary accent, lime, cyan, pink, surface*, text*) so every page
// picks up the new look without per-component edits.
const config: Config = {
  content: ['./src/**/*.{ts,tsx,js,jsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B0B0D',
        'bg-main': '#0B0B0D',
        'bg-panel': '#131317',
        'bg-card': '#18181D',
        surface: '#131317',
        'surface-2': '#18181D',
        'surface-3': '#1F1F25',
        border: 'rgba(255,255,255,0.10)',
        'border-soft': 'rgba(255,255,255,0.10)',
        'border-2': 'rgba(255,255,255,0.16)',
        text: '#F5F5F7',
        'text-main': '#F5F5F7',
        'text-primary': '#F5F5F7',
        'text-dim': '#B4B4BE',
        'text-secondary': '#B4B4BE',
        'text-mute': '#8A8A93',
        'text-muted': '#8A8A93',
        'text-faint': '#45454D',
        // accents — `gold` is the legacy name of the primary accent
        gold: '#3B8CFF',
        'accent-gold': '#3B8CFF',
        warm: '#3B8CFF',
        blue: '#1F7BFF',
        'accent-blue': '#5AC8FA',
        cyan: '#5AC8FA',
        lime: '#B8F04A',
        'accent-lime': '#B8F04A',
        pink: '#FF3D8B',
        'accent-pink': '#FF3D8B',
        green: '#22C55E',
        amber: '#F5A524',
        danger: '#FF453A',
        success: '#22C55E',
      },
      fontFamily: {
        // One family across the UI (Onest has Cyrillic); serif/display aliases
        // keep old class names working.
        sans: ['var(--font-ui)', 'Onest', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['var(--font-ui)', 'Onest', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-ui)', 'Onest', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-code)', '"JetBrains Mono"', 'SF Mono', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        widest: '0.12em',
      },
      borderRadius: {
        card: '24px',
        tile: '20px',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(31,123,255,0.35), 0 12px 40px rgba(31,123,255,0.22)',
        'glow-lime': '0 0 0 1px rgba(184,240,74,0.35), 0 12px 40px rgba(184,240,74,0.18)',
        editorial: '0 24px 60px rgba(0,0,0,0.45)',
        glass: '0 20px 60px rgba(0,0,0,0.35)',
      },
      backgroundImage: {
        noise: 'radial-gradient(circle at 20% 20%, rgba(31,123,255,0.08), transparent 50%)',
      },
      transitionTimingFunction: {
        // spring-ish curves from the skill: settle (damping 200) and pop (overshoot)
        settle: 'cubic-bezier(0.22, 1, 0.36, 1)',
        pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
