"use client";

// Hero-level input. Enter → navigates to /play/<slug>?prompt=<text>.
// Active default model is the user's previously selected one (localStorage),
// falling back to Nano Banana 2.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ToolOption {
  slug: string;
  name: string;
  emoji: string;
  cost: number;
}

const DEFAULT_TOOLS: ToolOption[] = [
  { slug: "nano-banana-2", name: "Nano Banana 2", emoji: "🍌", cost: 12 },
  { slug: "nano-banana",   name: "Nano Banana",   emoji: "🎨", cost: 10 },
  { slug: "text-to-image", name: "Text → Image",  emoji: "🖼", cost: 5  },
  { slug: "image-to-video",name: "Image → Video", emoji: "🎬", cost: 80 },
  { slug: "carousel",      name: "Carousel",      emoji: "📚", cost: 12 },
];

export function QuickPromptBar() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [tool, setTool] = useState(DEFAULT_TOOLS[0]);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("aihub.quickbar.tool");
    if (saved) {
      const t = DEFAULT_TOOLS.find((x) => x.slug === saved);
      if (t) setTool(t);
    }
  }, []);

  function selectTool(t: ToolOption) {
    setTool(t);
    setOpen(false);
    localStorage.setItem("aihub.quickbar.tool", t.slug);
    inputRef.current?.focus();
  }

  function submit() {
    const text = prompt.trim();
    if (!text) { inputRef.current?.focus(); return; }
    start(() => {
      const q = new URLSearchParams({ prompt: text });
      router.push(`/play/${tool.slug}?${q.toString()}`);
    });
  }

  return (
    <div className="glass p-2.5 flex items-end gap-2 shadow-elevated">
      {/* Model picker */}
      <div className="relative">
        <button onClick={() => setOpen(!open)} type="button"
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-border hover:border-accent/40 transition text-sm whitespace-nowrap h-full">
          <span className="text-lg leading-none">{tool.emoji}</span>
          <span className="font-medium hidden sm:inline">{tool.name}</span>
          <span className="text-xs text-muted tabular-nums">{tool.cost}t</span>
          <span className="text-muted text-xs">▾</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full mt-2 w-56 panel p-1.5 z-40 shadow-elevated">
              {DEFAULT_TOOLS.map((t) => (
                <button key={t.slug} type="button" onClick={() => selectTool(t)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                          t.slug === tool.slug ? "bg-accent/15 text-text" : "hover:bg-white/5 text-muted hover:text-text"
                        }`}>
                  <span className="text-base">{t.emoji}</span>
                  <span className="flex-1 text-left">{t.name}</span>
                  <span className="text-xs text-muted tabular-nums">{t.cost}t</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Prompt */}
      <textarea
        ref={inputRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
        }}
        placeholder="Describe your next viral creative…"
        rows={1}
        className="flex-1 resize-none bg-transparent border-none outline-none px-2 py-3 text-base placeholder:text-muted min-w-0"
        style={{ maxHeight: 160 }}
      />

      {/* Submit */}
      <button onClick={submit} disabled={pending || !prompt.trim()}
              className="btn px-5 py-2.5 gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
        {pending ? (
          <span className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            <span>Generate</span>
            <span className="text-xs opacity-70">↵</span>
          </>
        )}
      </button>
    </div>
  );
}
