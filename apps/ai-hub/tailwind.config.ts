import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0b",
        panel: "#121214",
        border: "#1f1f23",
        text: "#f5f5f7",
        muted: "#8a8a90",
        accent: "#7c5cff",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
