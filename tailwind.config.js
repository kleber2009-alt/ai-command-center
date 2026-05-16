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
        apple: {
          blue: '#0071e3',
          'blue-hover': '#0077ed',
          'blue-pressed': '#006edb',
          ink: '#1d1d1f',
          muted: '#6e6e73',
          faint: '#86868b',
          line: 'rgba(0,0,0,0.08)',
          'line-strong': 'rgba(0,0,0,0.14)',
          bg: '#ffffff',
          'bg-elev': '#fbfbfd',
          'bg-soft': '#f5f5f7',
        },
      },
      boxShadow: {
        'apple-sm': '0 1px 2px rgba(0,0,0,0.04)',
        'apple': '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'apple-lg': '0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)',
      },
      borderRadius: {
        'apple': '14px',
        'apple-lg': '18px',
      },
      animation: {
        'slide-in': 'slideIn 0.25s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
