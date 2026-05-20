import Link from "next/link";
import { Sparkles, Zap, Image as ImageIcon, Camera } from "lucide-react";

const samples = [
  "Luxury Founder",
  "Podcast Studio",
  "Cinematic Creator",
  "AI Visionary",
  "Editorial Fashion",
  "Dark Premium",
];

export default function Landing() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-40"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, rgba(167,139,250,0.35), transparent 60%)",
          }}
        />
        <div className="mx-auto max-w-5xl px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-ink-900/60 px-3 py-1 text-xs text-ink-500">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Powered by Nano Banana 2 + HeyGen
          </div>
          <h1 className="mt-6 text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            AI content from <span className="gradient-text">your face</span>
            <br />
            in 2 minutes.
          </h1>
          <p className="mt-5 mx-auto max-w-2xl text-lg text-ink-500">
            Upload one photo. Get 10 cinematic AI avatars. Turn them into viral
            Instagram covers — and (soon) talking-head videos.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/generate"
              className="rounded-xl bg-accent px-6 h-12 inline-flex items-center text-ink-950 font-semibold hover:bg-accent-glow shadow-glow"
            >
              Create AI Avatar
            </Link>
            <Link
              href="#how"
              className="rounded-xl border border-white/10 bg-ink-900/60 px-6 h-12 inline-flex items-center hover:bg-ink-800"
            >
              How it works
            </Link>
          </div>
          <div className="mt-3 text-xs text-ink-500">
            10 free tokens on signup. No credit card.
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {samples.map((s) => (
            <div
              key={s}
              className="aspect-[4/5] rounded-2xl border border-white/10 bg-gradient-to-br from-ink-800 to-ink-900 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_30%,rgba(167,139,250,0.35),transparent_55%)]" />
              <div className="absolute bottom-2 left-2 right-2 text-[11px] text-ink-200/90">
                {s}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="text-3xl font-semibold tracking-tight text-center">
          How it works
        </h2>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {[
            {
              icon: Camera,
              title: "Upload one photo",
              body: "Front-facing, well-lit. JPG / PNG / WEBP, ≥ 512×512.",
            },
            {
              icon: Zap,
              title: "Generate 10 avatars",
              body: "Luxury, podcast, cinematic, editorial — all in one batch.",
            },
            {
              icon: ImageIcon,
              title: "Make a viral cover",
              body: "Pick your favourite, add a hook, export Instagram-ready 4:5.",
            },
          ].map((s) => (
            <div
              key={s.title}
              className="rounded-2xl border border-white/10 bg-ink-900/60 p-6"
            >
              <s.icon className="h-7 w-7 text-accent" />
              <div className="mt-4 font-semibold">{s.title}</div>
              <div className="mt-1 text-sm text-ink-500">{s.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-32">
        <h2 className="text-3xl font-semibold tracking-tight text-center">
          Pricing
        </h2>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {[
            {
              name: "Free",
              price: "$0",
              tagline: "Try it",
              perks: ["1 avatar batch", "Watermark", "Standard quality"],
              cta: "Start free",
            },
            {
              name: "Starter",
              price: "$19",
              tagline: "Most popular",
              perks: ["100 tokens", "10 avatar batches", "Cover exports"],
              cta: "Get Starter",
              highlight: true,
            },
            {
              name: "Pro",
              price: "$49",
              tagline: "Creators & founders",
              perks: ["300 tokens", "HeyGen video (soon)", "Premium templates"],
              cta: "Get Pro",
            },
          ].map((p) => (
            <div
              key={p.name}
              className={
                "rounded-2xl border p-6 " +
                (p.highlight
                  ? "border-accent bg-gradient-to-b from-ink-900 to-ink-800 shadow-glow"
                  : "border-white/10 bg-ink-900/60")
              }
            >
              <div className="text-sm uppercase tracking-wider text-ink-500">
                {p.name}
              </div>
              <div className="mt-2 text-4xl font-semibold">{p.price}</div>
              <div className="text-sm text-ink-500">{p.tagline}</div>
              <ul className="mt-5 space-y-2 text-sm">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-accent" />
                    {perk}
                  </li>
                ))}
              </ul>
              <Link
                href="/billing"
                className={
                  "mt-6 inline-flex w-full items-center justify-center rounded-xl h-11 font-semibold " +
                  (p.highlight
                    ? "bg-accent text-ink-950 hover:bg-accent-glow"
                    : "border border-white/10 bg-ink-800 hover:bg-ink-700")
                }
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
