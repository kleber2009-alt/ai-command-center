// Deterministic gradient cover for tool cards that have no real sample yet.
// Same slug → same palette across sessions (so the catalog feels stable, not random).

const PALETTES: Array<[string, string, string]> = [
  ["#7B61FF", "#A855F7", "#FF6B9F"],   // brand
  ["#FF6B9F", "#A855F7", "#5EEAD4"],   // sunset
  ["#5EEAD4", "#7B61FF", "#A855F7"],   // ocean
  ["#FFD93D", "#FF6B9F", "#7B61FF"],   // mango
  ["#34D399", "#5EEAD4", "#7B61FF"],   // mint
  ["#F472B6", "#A855F7", "#7B61FF"],   // pink-violet
  ["#FB923C", "#FF6B9F", "#A855F7"],   // orange-pink
  ["#60A5FA", "#7B61FF", "#A855F7"],   // sky-violet
];

const CATEGORY_ICON: Record<string, string> = {
  image:    "🖼",
  video:    "🎬",
  face:     "🎭",
  audio:    "🎵",
  content:  "📝",
  analysis: "📊",
};

function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = ((h << 5) - h + slug.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function ToolCover({ slug, category, name }: { slug: string; category: string; name: string }) {
  const [c1, c2, c3] = PALETTES[hashSlug(slug) % PALETTES.length];
  const icon = CATEGORY_ICON[category] ?? "✨";
  return (
    <div className="relative w-full h-full overflow-hidden"
         style={{ background: `linear-gradient(135deg, ${c1} 0%, ${c2} 55%, ${c3} 100%)` }}>
      <div className="absolute inset-0 opacity-20"
           style={{
             backgroundImage: "radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)",
             backgroundSize: "12px 12px",
             mixBlendMode: "overlay",
           }} />
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-50"
           style={{ background: "radial-gradient(circle, rgba(255,255,255,0.45) 0%, transparent 70%)" }} />
      <div className="absolute -bottom-12 -left-12 w-44 h-44 rounded-full opacity-30"
           style={{ background: "radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 70%)" }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <div className="text-6xl mb-2 transition group-hover:scale-110 group-hover:-translate-y-1 duration-300"
             style={{ filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.4))" }}>{icon}</div>
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/85">
          {name}
        </div>
      </div>
    </div>
  );
}
