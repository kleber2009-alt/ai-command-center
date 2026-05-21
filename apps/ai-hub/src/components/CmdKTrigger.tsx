"use client";

// Topbar pill that opens the global Cmd+K menu. Implemented as a client
// component because Server Components can't carry onClick handlers.

export function CmdKTrigger() {
  function openMenu() {
    const evt = new KeyboardEvent("keydown", { key: "k", metaKey: true });
    window.dispatchEvent(evt);
  }
  return (
    <button type="button" onClick={openMenu}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-border text-muted hover:text-text hover:border-accent/40 transition text-xs">
      <span>⌕</span>
      <span className="hidden lg:inline">Search…</span>
      <kbd className="font-mono px-1.5 py-0.5 rounded bg-white/5 border border-border text-[10px]">⌘K</kbd>
    </button>
  );
}
