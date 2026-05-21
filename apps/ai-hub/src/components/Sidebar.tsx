// Persistent left rail. Active state shows accent glow + accent text.
// Items map 1:1 to /(app)/* routes — sections marked "soon" route to /tools
// for now until the dedicated screens land.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  group: "main" | "creator" | "account";
  soon?: boolean;
  match?: (path: string) => boolean;
}

const ITEMS: NavItem[] = [
  { group: "main", href: "/dashboard", label: "Dashboard", icon: <IconHome /> },
  { group: "main", href: "/tools",     label: "Tools",     icon: <IconGrid /> },
  { group: "main", href: "/play/nano-banana-2", label: "Playground", icon: <IconWand />,
    match: (p) => p.startsWith("/play/") },
  { group: "main", href: "/gallery",   label: "Gallery",   icon: <IconImage /> },
  { group: "main", href: "/showcase",  label: "Showcase",  icon: <IconStar /> },
  { group: "main", href: "/history",   label: "History",   icon: <IconClock /> },

  { group: "creator", href: "/play/carousel",   label: "Carousel Studio", icon: <IconCarousel />,
    match: (p) => p.startsWith("/play/carousel") },
  { group: "creator", href: "/agents/reels", label: "AI Agents", icon: <IconSpark />,
    match: (p) => p.startsWith("/agents") },
  { group: "creator", href: "/play/video", label: "Video Studio", icon: <IconFilm />,
    match: (p) => p === "/play/video" },
  { group: "creator", href: "/research/ig",     label: "Instagram Research", icon: <IconAt />,
    match: (p) => p.startsWith("/research/ig") },
  { group: "creator", href: "/tools",           label: "Prompt Lab", icon: <IconBeaker />, soon: true },

  { group: "account", href: "/wallet",         label: "Billing", icon: <IconCard /> },
  { group: "account", href: "/admin/users",    label: "Settings", icon: <IconCog />,
    match: (p) => p.startsWith("/admin") },
];

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const isActive = (item: NavItem) =>
    item.match ? item.match(pathname) : pathname === item.href;

  const groups: Array<{ id: NavItem["group"]; label: string; items: NavItem[] }> = [
    { id: "main",    label: "Workspace", items: ITEMS.filter((i) => i.group === "main") },
    { id: "creator", label: "Creator",   items: ITEMS.filter((i) => i.group === "creator") },
    { id: "account", label: "Account",   items: ITEMS.filter((i) => i.group === "account" && (i.label !== "Settings" || isAdmin)) },
  ];

  return (
    <aside className="hidden md:flex w-60 shrink-0 sticky top-0 h-screen flex-col px-4 py-5 border-r border-border bg-bg/40 backdrop-blur-2xl">
      {/* Brand */}
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-1.5 mb-6">
        <div className="w-7 h-7 rounded-lg bg-accent-grad shadow-glow grid place-items-center text-white text-sm font-bold">◆</div>
        <div>
          <div className="font-display font-semibold text-[15px] leading-tight tracking-tight">AI Creative Hub</div>
          <div className="text-[10px] font-mono text-muted uppercase tracking-[0.15em]">Creator OS · beta</div>
        </div>
      </Link>

      {/* Groups */}
      <nav className="flex-1 flex flex-col gap-5 overflow-y-auto scrollbar-none -mx-2 px-2">
        {groups.map((g) => g.items.length === 0 ? null : (
          <div key={g.id}>
            <div className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.18em] font-mono text-muted/70">
              {g.label}
            </div>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => {
                const active = isActive(item);
                return (
                  <li key={item.label}>
                    <Link href={item.href}
                          className={`group flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition relative ${
                            active
                              ? "bg-accent/15 text-text shadow-[inset_0_0_0_1px_rgba(123,97,255,0.30)]"
                              : "text-muted hover:bg-white/[0.04] hover:text-text"
                          }`}>
                      <span className={`w-4 h-4 shrink-0 transition ${active ? "text-accent" : "text-muted group-hover:text-text"}`}>
                        {item.icon}
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {item.soon && (
                        <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-muted/80">
                          soon
                        </span>
                      )}
                      {active && (
                        <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)]" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom: Telegram bot */}
      <a href="https://t.me/aicex_one_bot" target="_blank" rel="noreferrer"
         className="mt-4 mx-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl glass hover:border-accent/40 transition text-xs">
        <span className="text-base">💬</span>
        <div className="flex-1 leading-tight">
          <div className="text-text">Telegram Mini App</div>
          <div className="text-muted text-[10px]">@aicex_one_bot</div>
        </div>
        <span className="text-muted">↗</span>
      </a>
    </aside>
  );
}

/* ===== Inline SVG icons (stroke 1.5, currentColor) ===== */
function IconHome() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
  </svg>);
}
function IconGrid() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-full h-full">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>);
}
function IconWand() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-full h-full">
    <path d="m4 20 12-12" /><path d="M14 6h.01M18 10h.01M20 14h.01M10 4h.01M6 8h.01" />
    <path d="m15 5 2 2-12 12-2-2 12-12Z" />
  </svg>);
}
function IconImage() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m4 18 5-5 4 4 3-3 4 4" />
  </svg>);
}
function IconClock() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-full h-full">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>);
}
function IconSpark() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2" />
    <circle cx="12" cy="12" r="3" />
  </svg>);
}
function IconAt() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-full h-full">
    <circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 5.5 1.7A9 9 0 1 0 18 19" />
  </svg>);
}
function IconBeaker() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M9 3v6L4.5 17.5A2 2 0 0 0 6.2 20.5h11.6a2 2 0 0 0 1.7-3L15 9V3" /><path d="M8 3h8" /><path d="M7 13h10" />
  </svg>);
}
function IconCard() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-full h-full">
    <rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h3" />
  </svg>);
}
function IconFilm() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4" />
  </svg>);
}
function IconStar() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.95 6.75 19.65l1-5.85L3.5 9.65l5.9-.85L12 3.5Z" />
  </svg>);
}
function IconCarousel() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="6" y="5" width="12" height="14" rx="2" />
    <path d="M3 8v8M21 8v8" />
  </svg>);
}
function IconCog() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.3l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.7 7l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>);
}
