export const AVATAR_STYLES = [
  "Luxury Founder",
  "Podcast Studio",
  "Cinematic Creator",
  "Instagram Educator",
  "Tech Entrepreneur",
  "Viral Reels Cover",
  "Editorial Fashion",
  "Dark Premium",
  "AI Visionary",
  "Minimal Apple Style",
] as const;

export type AvatarStyle = (typeof AVATAR_STYLES)[number];

export const STYLE_HINTS: Record<AvatarStyle, string> = {
  "Luxury Founder":
    "tailored suit, marble penthouse backdrop, soft golden rim light, confident upright posture",
  "Podcast Studio":
    "Shure SM7B mic in foreground, warm bokeh studio lights, headphones around neck, cinematic depth",
  "Cinematic Creator":
    "anamorphic 2.39:1 mood, teal-orange grade, neon sign behind, hint of haze",
  "Instagram Educator":
    "bright softbox key light, pastel gradient backdrop, friendly direct-to-camera energy",
  "Tech Entrepreneur":
    "minimal glass office, monochrome palette, subtle product silhouettes blurred behind",
  "Viral Reels Cover":
    "high-contrast pop, vibrant gradient backdrop, slight wide-angle drama, magnetic eye-line",
  "Editorial Fashion":
    "Vogue cover styling, dramatic single hard light, fabric texture, fashion grade",
  "Dark Premium":
    "near-black backdrop, single sculpted Rembrandt light, deep blacks, luxury tone",
  "AI Visionary":
    "subtle holographic UI light spill, future-tech vibe, charcoal blazer, controlled cool palette",
  "Minimal Apple Style":
    "pure neutral seamless backdrop, perfectly even key, calm composed expression, Apple-keynote energy",
};
