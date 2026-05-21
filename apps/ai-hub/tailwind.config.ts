import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:           "#050505",            // page background (deepest)
        "bg-1":       "#0A0A0B",            // elevated background
        "bg-2":       "#111113",            // panel
        panel:        "#111113",
        border:       "rgba(255,255,255,0.08)",
        "border-2":   "rgba(255,255,255,0.14)",
        text:         "#f5f5f7",
        muted:        "#8a8a90",
        // primary accent + secondaries from luxury palette
        accent:       "#7B61FF",
        "accent-2":   "#A855F7",
        "accent-pink": "#FF6B9F",
        "accent-cyan": "#5EEAD4",
      },
      fontFamily: {
        sans:    ["var(--font-inter)", "-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Inter", "sans-serif"],
        display: ["var(--font-inter-tight)", "var(--font-inter)", "Inter Tight", "sans-serif"],
        mono:    ["ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
      boxShadow: {
        glow:       "0 0 0 1px rgba(123,97,255,0.30), 0 0 24px -6px rgba(123,97,255,0.50)",
        "glow-sm":  "0 0 0 1px rgba(255,255,255,0.10), 0 0 16px -8px rgba(255,255,255,0.30)",
        "glow-lg":  "0 0 0 1px rgba(123,97,255,0.40), 0 0 60px -10px rgba(123,97,255,0.40)",
        elevated:   "0 24px 60px -20px rgba(0,0,0,0.6), 0 8px 24px -8px rgba(0,0,0,0.4)",
      },
      backgroundImage: {
        "ambient": "radial-gradient(60% 50% at 50% 0%, rgba(123,97,255,0.10) 0%, transparent 60%), radial-gradient(40% 40% at 100% 100%, rgba(255,107,159,0.06) 0%, transparent 60%), radial-gradient(40% 40% at 0% 80%, rgba(94,234,212,0.04) 0%, transparent 60%)",
        "shimmer": "linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.06) 50%, transparent 75%)",
        "accent-grad": "linear-gradient(135deg, #7B61FF 0%, #A855F7 50%, #FF6B9F 100%)",
      },
      keyframes: {
        shimmer:    { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "pulse-ai": { "0%, 100%": { opacity: "0.6" }, "50%": { opacity: "1" } },
        float:      { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-4px)" } },
      },
      animation: {
        shimmer:    "shimmer 1.6s linear infinite",
        "pulse-ai": "pulse-ai 1.8s ease-in-out infinite",
        float:      "float 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
