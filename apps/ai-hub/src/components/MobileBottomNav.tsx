"use client";

// Bottom nav rendered ONLY on mobile (md:hidden). Five tabs with the middle
// "Generate" raised into a FAB. Mirrors the sidebar's top items.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard",       label: "Home",     icon: <IconHome />,    match: (p: string) => p === "/dashboard" },
  { href: "/gallery",         label: "Gallery",  icon: <IconImage />,   match: (p: string) => p.startsWith("/gallery") },
  { href: "/play/nano-banana-2", label: "Generate", icon: <IconSparkle />, isCenter: true, match: (p: string) => p.startsWith("/play") },
  { href: "/history",         label: "History",  icon: <IconClock />,   match: (p: string) => p.startsWith("/history") },
  { href: "/wallet",          label: "Wallet",   icon: <IconCard />,    match: (p: string) => p.startsWith("/wallet") },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-bg/85 backdrop-blur-2xl border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-end justify-around px-3 pt-2 pb-2 relative">
        {TABS.map((t) => {
          const active = t.match(pathname);
          if (t.isCenter) {
            // Raised FAB-style center tab
            return (
              <Link key={t.href} href={t.href}
                    className="flex flex-col items-center gap-1 -mt-6">
                <span className={`w-14 h-14 rounded-2xl grid place-items-center shadow-glow-lg transition ${
                  active ? "bg-accent-grad scale-105" : "bg-accent-grad"
                }`}>
                  <span className="w-6 h-6 text-white">{t.icon}</span>
                </span>
                <span className={`text-[10px] font-medium ${active ? "text-accent" : "text-muted"}`}>
                  {t.label}
                </span>
              </Link>
            );
          }
          return (
            <Link key={t.href} href={t.href}
                  className={`flex flex-col items-center gap-1 px-3 py-1 transition ${
                    active ? "text-accent" : "text-muted active:text-text"
                  }`}>
              <span className="w-5 h-5">{t.icon}</span>
              <span className="text-[10px] font-medium">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function IconHome() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
  </svg>);
}
function IconImage() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m4 18 5-5 4 4 3-3 4 4" />
  </svg>);
}
function IconSparkle() {
  return (<svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M12 2 14 9l7 2-7 2-2 7-2-7-7-2 7-2 2-7Z" />
  </svg>);
}
function IconClock() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-full h-full">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>);
}
function IconCard() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-full h-full">
    <rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h3" />
  </svg>);
}
