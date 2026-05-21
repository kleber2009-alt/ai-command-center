// /onboard — first-login wizard. 3 steps:
//   1) Niche pick (стилист / фитнес / онлайн-школа / e-com / другое)
//   2) Quick tour (4 capability cards, no generation triggered here)
//   3) CTA to first generation in /play/nano-banana-2 with niche-tailored prompt prefill
//
// State lives in URL: ?step=1|2|3. Final "Begin" submits niche and marks
// onboarding_completed_at = now() so this wizard never shows for the user again.

import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { completeOnboarding } from "./actions";

export const dynamic = "force-dynamic";

const NICHES = [
  { id: "stylist",      label: "Стилист / fashion",     emoji: "👗", prompt: "Photoreal Instagram outfit lookbook, luxury Loro Piana aesthetic, soft beige + cream palette, cinematic daylight, no text" },
  { id: "fitness",      label: "Фитнес / coach",         emoji: "💪", prompt: "High-energy fitness reel cover, neon gym lighting, motion blur, athletic person mid-action, vivid contrast, no text" },
  { id: "school",       label: "Онлайн-школа / эксперт", emoji: "🎓", prompt: "Modern educational carousel cover, soft purple gradient background, abstract geometric shapes, mockup of phone with course preview, no text" },
  { id: "ecom",         label: "E-commerce / бренд",     emoji: "🛍", prompt: "Premium product hero shot, single product centered, marble surface, soft window light, cinematic shadows, no text" },
  { id: "beauty",       label: "Beauty / SMM",           emoji: "💄", prompt: "Beauty reel thumbnail, glossy cosmetic product, dreamy pink/peach palette, droplets, hyperreal close-up, no text" },
  { id: "real-estate",  label: "Недвижимость",           emoji: "🏠", prompt: "Architectural exterior, golden hour, modern minimalist house, lush garden, drone perspective, cinematic, no text" },
  { id: "food",         label: "Food / ресторан",        emoji: "🍝", prompt: "Overhead food shot, dark moody wood table, single plated dish, candlelight, steam wisps, cinematic, no text" },
  { id: "other",        label: "Другое",                  emoji: "✨", prompt: "Cinematic Instagram thumbnail, luxury aesthetic, soft gradient background, hero-level composition" },
] as const;

interface SearchParams { step?: string; niche?: string }

export default async function OnboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const session = await auth();
  const user = session?.user as { id?: string; email?: string; name?: string } | undefined;
  if (!user?.id) redirect("/login");

  // If already onboarded — skip.
  const [u] = await db.select({ done: users.onboardingCompletedAt })
    .from(users).where(eq(users.id, user.id)).limit(1);
  if (u?.done) redirect("/dashboard");

  const step = Number(sp.step ?? "1");
  const niche = sp.niche ?? "";
  const selected = NICHES.find((n) => n.id === niche);
  const firstName = (user.name ?? user.email ?? "").split(/[ @]/)[0] || "Creator";

  return (
    <div className="max-w-3xl mx-auto py-8">
      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-10 justify-center">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-3">
            <div className={`w-7 h-7 rounded-full grid place-items-center text-xs font-mono ${
              step >= n ? "bg-accent text-white shadow-glow" : "bg-white/5 text-muted border border-border"
            }`}>{n}</div>
            {n < 3 && <div className={`w-12 h-px ${step > n ? "bg-accent" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Step1 firstName={firstName} />
      )}
      {step === 2 && (
        <Step2 niche={selected} />
      )}
      {step === 3 && (
        <Step3 niche={selected} userId={user.id} />
      )}
    </div>
  );
}

function Step1({ firstName }: { firstName: string }) {
  return (
    <section className="glass p-8 md:p-10">
      <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-3">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
        Step 1 of 3 · Niche
      </div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
        Привет, {firstName}.
      </h1>
      <p className="text-muted mt-3 text-base leading-relaxed max-w-xl">
        Скажи под какую нишу настраиваем AI Hub — будем подсказывать промпты,
        стили и связки tools, которые работают именно для тебя.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
        {NICHES.map((n) => (
          <Link key={n.id} href={`/onboard?step=2&niche=${n.id}`}
                className="glass glass-hover p-4 flex flex-col items-start gap-2 hover:shadow-glow text-left">
            <span className="text-3xl">{n.emoji}</span>
            <span className="text-sm font-medium">{n.label}</span>
          </Link>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link href="/onboard?step=2&niche=other" className="text-xs text-muted hover:text-text underline-offset-2 hover:underline">
          Пропустить
        </Link>
      </div>
    </section>
  );
}

function Step2({ niche }: { niche: typeof NICHES[number] | undefined }) {
  const items = [
    { emoji: "🍌", title: "Nano Banana 2", desc: "Премиум-генерация и редактирование с сохранением лица. 12 ток за изображение." },
    { emoji: "🎞", title: "Carousel Studio", desc: "Бриф → 5-10 согласованных слайдов под Instagram-карусель за один заход." },
    { emoji: "🎬", title: "Kling Video", desc: "Анимировать статичную картинку или сгенерировать видео из текста (80-250 ток)." },
    { emoji: "🖼", title: "Gallery + Showcase", desc: "Каждая генерация сохраняется навсегда. Лучшие работы попадают в публичный Showcase." },
  ];
  return (
    <section className="glass p-8 md:p-10">
      <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-3">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
        Step 2 of 3 · What you can do
      </div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
        Что внутри.
      </h1>
      {niche && (
        <p className="text-muted mt-3 text-sm leading-relaxed">
          Ниша: <span className="text-text font-medium">{niche.label}</span> — мы подкинем тебе релевантный промпт на следующем шаге.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-8">
        {items.map((it) => (
          <div key={it.title} className="glass p-4 flex gap-3">
            <div className="text-2xl shrink-0">{it.emoji}</div>
            <div className="min-w-0">
              <div className="font-medium">{it.title}</div>
              <p className="text-xs text-muted mt-1 leading-relaxed">{it.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Link href="/onboard?step=1" className="text-sm text-muted hover:text-text">← Назад</Link>
        <Link href={`/onboard?step=3&niche=${niche?.id ?? "other"}`} className="btn">
          Дальше →
        </Link>
      </div>
    </section>
  );
}

function Step3({ niche, userId: _userId }: { niche: typeof NICHES[number] | undefined; userId: string }) {
  const prompt = niche?.prompt ?? "Cinematic Instagram thumbnail, luxury aesthetic";
  return (
    <section className="glass p-8 md:p-10">
      <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-3">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
        Step 3 of 3 · First generation
      </div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
        Ну что, поехали?
      </h1>
      <p className="text-muted mt-3 text-base leading-relaxed max-w-xl">
        100 токенов на старте — этого хватит на ~8 генераций Nano Banana 2.
        Откроем Playground с готовым промптом — отредактируй под себя и жми Run.
      </p>

      <div className="glass p-4 mt-6 border-accent/20">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted mb-2">
          Prompt · {niche?.label ?? "general"}
        </div>
        <div className="text-sm text-text/90 leading-relaxed font-mono">{prompt}</div>
      </div>

      <form action={completeOnboarding} className="mt-8 flex items-center justify-between">
        <input type="hidden" name="niche" value={niche?.id ?? "other"} />
        <input type="hidden" name="prompt" value={prompt} />
        <Link href={`/onboard?step=2&niche=${niche?.id ?? "other"}`} className="text-sm text-muted hover:text-text">← Назад</Link>
        <div className="flex items-center gap-3">
          <button type="submit" name="action" value="dashboard"
                  className="btn-ghost text-sm">Просто кабинет</button>
          <button type="submit" name="action" value="play"
                  className="btn gap-1.5">
            <span>Открыть Playground</span><span className="text-xs opacity-70">→</span>
          </button>
        </div>
      </form>
    </section>
  );
}
