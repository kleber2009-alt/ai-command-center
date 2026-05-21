import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#06070a",
          900: "#0a0d14",
          800: "#11151f",
          700: "#1a1f2e",
          500: "#5b6478",
          200: "#e5e7eb",
        },
        accent: {
          DEFAULT: "#a78bfa",
          glow: "#c4b5fd",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Inter", "sans-serif"],
        display: ["ui-sans-serif", "system-ui", "Inter", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 60px -20px rgba(167,139,250,0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
