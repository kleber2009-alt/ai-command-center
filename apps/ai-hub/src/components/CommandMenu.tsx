"use client";

// Global Cmd+K command menu (Linear / Arc style).
//
// Triggers:
//   - Cmd+K  / Ctrl+K  → toggle menu
//   - Escape           → close
//   - ↑ ↓              → navigate results
//   - Enter            → activate first result (or "Generate <text>" if no match)
//
// Result sources:
//   - Static pages (Dashboard / Gallery / Wallet / …)
//   - Static tools (Nano Banana 2 / Carousel / FLUX / …)
//   - "Generate X" — any free-form input becomes a prompt-prefill into /play/nano-banana-2

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface CmdItem {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  group: "page" | "tool" | "action";
  href: string;
  keywords?: string;                                     // extra fuzzy hits
}

const ITEMS: CmdItem[] = [
  // pages
  { id: "p-dash",   group: "page", icon: "⌂", label: "Dashboard",       href: "/dashboard",      keywords: "home main" },
  { id: "p-tools",  group: "page", icon: "⌗", label: "Tools",           href: "/tools",          keywords: "catalog instruments" },
  { id: "p-gal",    group: "page", icon: "▦", label: "Gallery",         href: "/gallery",        keywords: "галерея images history" },
  { id: "p-fav",    group: "page", icon: "★", label: "Favorites",       href: "/gallery?fav=1",  keywords: "избранное starred" },
  { id: "p-show",   group: "page", icon: "✦", label: "Showcase",        href: "/showcase",       keywords: "featured community curated" },
  { id: "p-hist",   group: "page", icon: "⏱", label: "History",         href: "/history",        keywords: "jobs runs история" },
  { id: "p-wallet", group: "page", icon: "◈", label: "Wallet · Balance",href: "/wallet",         keywords: "tokens billing stars" },
  // tools
  { id: "t-nano2",  group: "tool", icon: "🍌", label: "Nano Banana 2",  href: "/play/nano-banana-2", hint: "Premium image · 12⨉" },
  { id: "t-carou",  group: "tool", icon: "🎞", label: "Carousel Studio", href: "/play/carousel",     hint: "Multi-slide · 12⨉ per" },
  { id: "t-nano",   group: "tool", icon: "🎨", label: "Nano Banana",    href: "/play/nano-banana",  hint: "Gemini image · 10⨉" },
  { id: "t-nanoe",  group: "tool", icon: "✏️", label: "Nano Banana Edit",href: "/play/nano-banana-edit", hint: "Edit · 12⨉" },
  { id: "t-flux",   group: "tool", icon: "🖼", label: "Text → Image",    href: "/play/text-to-image", hint: "FLUX · 5⨉" },
  { id: "t-edit",   group: "tool", icon: "✂",  label: "Image Edit",      href: "/play/image-edit",    hint: "FLUX Pro Kontext · 8⨉" },
  { id: "t-bg",     group: "tool", icon: "◐", label: "Background Remove",href: "/play/background-remove", hint: "BiRefNet · 2⨉" },
  { id: "t-up",     group: "tool", icon: "🔍", label: "Image Upscale",   href: "/play/image-upscale", hint: "Real-ESRGAN · 3⨉" },
  { id: "t-upp",    group: "tool", icon: "✨", label: "Image Upscale · Pro", href: "/play/image-upscale-pro", hint: "Clarity · 8⨉" },
  { id: "t-i2v",    group: "tool", icon: "🎬", label: "Image → Video",   href: "/play/image-to-video", hint: "Kling 1.6 · 80⨉" },
  { id: "t-i2vp",   group: "tool", icon: "🎥", label: "Image → Video · Pro", href: "/play/image-to-video-pro", hint: "Kling 2.1 Master · 220⨉" },
  { id: "t-t2v",    group: "tool", icon: "📹", label: "Text → Video",    href: "/play/text-to-video", hint: "Kling 1.6 · 100⨉" },
  { id: "t-t2vp",   group: "tool", icon: "🎞", label: "Text → Video · Pro", href: "/play/text-to-video-pro", hint: "Kling 2.1 · 250⨉" },
  { id: "t-vup",    group: "tool", icon: "📺", label: "Video Upscale",   href: "/play/video-upscale", hint: "Topaz · 60⨉" },
  { id: "t-face",   group: "tool", icon: "🎭", label: "Face Swap",       href: "/play/face-swap",   hint: "Replicate · 10⨉" },
];

function fuzzy(item: CmdItem, q: string): number {
  const hay = (item.label + " " + (item.hint ?? "") + " " + (item.keywords ?? "")).toLowerCase();
  const needle = q.toLowerCase().trim();
  if (!needle) return 0;
  if (hay.startsWith(needle)) return 100;
  if (hay.includes(" " + needle)) return 80;
  if (hay.includes(needle)) return 60;
  // letter-by-letter fuzzy
  let i = 0, score = 0;
  for (const ch of needle) {
    const next = hay.indexOf(ch, i);
    if (next < 0) return 0;
    score += Math.max(0, 10 - (next - i));
    i = next + 1;
  }
  return score;
}

export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);                       // highlighted index
  const inputRef = useRef<HTMLInputElement>(null);

  // ===== Toggle on Cmd+K =====
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) { setQ(""); setHi(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  // ===== Results =====
  const results = useMemo(() => {
    if (!q.trim()) return ITEMS.slice(0, 10);
    return ITEMS
      .map((it) => ({ it, s: fuzzy(it, q) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .map(({ it }) => it)
      .slice(0, 12);
  }, [q]);

  // Generic "Generate <text>" action when query has substance but no exact tool match
  const showGenerate = q.trim().length >= 3 && !results.some((r) => r.label.toLowerCase() === q.toLowerCase());
  const totalCount = results.length + (showGenerate ? 1 : 0);

  function activate(idx: number) {
    if (idx < results.length) {
      router.push(results[idx].href);
    } else if (showGenerate) {
      router.push(`/play/nano-banana-2?prompt=${encodeURIComponent(q.trim())}`);
    }
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, totalCount - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); activate(hi); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-start pt-[10vh] px-4"
         onClick={() => setOpen(false)}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Menu */}
      <div className="relative w-full max-w-xl glass overflow-hidden shadow-elevated"
           onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <span className="text-muted text-lg">⌕</span>
          <input ref={inputRef} type="text" value={q}
                 onChange={(e) => { setQ(e.target.value); setHi(0); }}
                 onKeyDown={onKeyDown}
                 placeholder="Поиск инструментов, страниц или опиши идею…"
                 className="flex-1 bg-transparent border-none outline-none text-[15px] placeholder:text-muted" />
          <kbd className="text-[10px] font-mono px-2 py-1 rounded bg-white/5 border border-border text-muted">esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {totalCount === 0 ? (
            <div className="px-5 py-10 text-center text-muted text-sm">
              Ничего не найдено. Попробуй <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-border">tools</kbd> или <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-border">gallery</kbd>.
            </div>
          ) : (
            <>
              {/* group: page */}
              {renderGroup(results.filter((r) => r.group === "page"), "Pages", results, hi, activate)}
              {renderGroup(results.filter((r) => r.group === "tool"), "Tools", results, hi, activate)}

              {showGenerate && (
                <div>
                  <div className="px-5 pt-3 pb-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted">Action</div>
                  <button onClick={() => activate(results.length)}
                          onMouseEnter={() => setHi(results.length)}
                          className={`w-full px-5 py-3 flex items-center gap-3 text-left transition ${
                            hi === results.length ? "bg-accent/15" : "hover:bg-white/[0.04]"
                          }`}>
                    <span className="text-lg">✨</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">Generate: <span className="text-accent">{q}</span></div>
                      <div className="text-xs text-muted">Открыть Nano Banana 2 с этим промптом</div>
                    </div>
                    <span className="text-xs text-muted">↵</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-border text-[10px] text-muted font-mono">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-border">↑↓</kbd> navigate</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-border">↵</kbd> open</span>
          </div>
          <span>AI Creative Hub · ⌘K</span>
        </div>
      </div>
    </div>
  );
}

function renderGroup(items: CmdItem[], title: string, allResults: CmdItem[], hi: number, activate: (idx: number) => void) {
  if (items.length === 0) return null;
  return (
    <div key={title}>
      <div className="px-5 pt-3 pb-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted">{title}</div>
      <ul>
        {items.map((it) => {
          const idx = allResults.indexOf(it);
          const active = idx === hi;
          return (
            <li key={it.id}>
              <button onClick={() => activate(idx)}
                      onMouseEnter={() => {}}
                      className={`w-full px-5 py-2.5 flex items-center gap-3 text-left transition ${
                        active ? "bg-accent/15" : "hover:bg-white/[0.04]"
                      }`}>
                <span className="text-base shrink-0">{it.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{it.label}</div>
                  {it.hint && <div className="text-[11px] text-muted truncate">{it.hint}</div>}
                </div>
                {active && <span className="text-xs text-muted">↵</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
