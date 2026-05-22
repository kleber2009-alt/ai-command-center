/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dark + amber theme. Token names kept as `apple-*` for backwards
        // compatibility with existing class usages across components — the
        // palette underneath changed from light Apple-grey/blue to dark
        // surfaces with amber accent.
        apple: {
          blue: '#fbbf24',          // accent (amber-400)
          'blue-hover': '#f59e0b',  // amber-500
          'blue-pressed': '#d97706', // amber-600
          ink: '#fafafa',           // primary text on dark surface
          muted: '#a1a1aa',         // zinc-400 — secondary copy
          faint: '#71717a',         // zinc-500 — labels / hints
          line: 'rgba(251, 191, 36, 0.16)',       // amber tinted hairline
          'line-strong': 'rgba(251, 191, 36, 0.32)',
          bg: '#0a0a0a',            // page background
          'bg-elev': '#141414',     // raised surface (cards)
          'bg-soft': '#1c1c1c',     // hover / inputs
        },
        brand: {
          amber: '#fbbf24',
          'amber-soft': '#fde68a',
          'amber-deep': '#b45309',
        },
      },
      boxShadow: {
        'apple-sm': '0 1px 2px rgba(0,0,0,0.4)',
        'apple': '0 4px 12px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.2)',
        'apple-lg': '0 12px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        // Soft amber halo used to recreate the "glowing card" look from the
        // reference design. Stack a focus ring (1px amber) on top of a
        // diffused glow.
        'glow': '0 0 0 1px rgba(251, 191, 36, 0.32), 0 12px 40px -8px rgba(251, 191, 36, 0.18)',
        'glow-sm': '0 0 0 1px rgba(251, 191, 36, 0.24), 0 6px 20px -6px rgba(251, 191, 36, 0.14)',
        'glow-strong': '0 0 0 1px rgba(251, 191, 36, 0.5), 0 16px 48px -8px rgba(251, 191, 36, 0.28)',
      },
      borderRadius: {
        'apple': '14px',
        'apple-lg': '18px',
        'apple-xl': '24px',
      },
      backgroundImage: {
        'amber-radial':
          'radial-gradient(60% 50% at 50% 0%, rgba(251, 191, 36, 0.12) 0%, rgba(251, 191, 36, 0) 70%)',
      },
      animation: {
        'slide-in': 'slideIn 0.25s ease-out',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 0 1px rgba(251, 191, 36, 0.3), 0 8px 32px -6px rgba(251, 191, 36, 0.15)' },
          '50%': { boxShadow: '0 0 0 1px rgba(251, 191, 36, 0.45), 0 12px 48px -6px rgba(251, 191, 36, 0.28)' },
        },
      },
    },
  },
  plugins: [],
}
