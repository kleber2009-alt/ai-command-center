'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';

// Persona Train (внешний сервис) выдаёт voice_id; пользователь руками вставляет его
// в Custom (IVC) поле формы, и оно сохраняется в localStorage. Серверный User не
// знает про voiceId, поэтому статус читается только на клиенте после mount.
const CUSTOM_VOICE_LS_KEY = 'persona-studio:customVoiceId';

export function VoiceStatus() {
  const [voiceId, setVoiceId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CUSTOM_VOICE_LS_KEY);
      setVoiceId(saved && saved.trim().length > 0 ? saved.trim() : null);
    } catch {
      setVoiceId(null);
    }
  }, []);

  // Initial server-rendered state: render a neutral placeholder of the right height
  // to avoid layout shift.
  if (voiceId === undefined) {
    return <div aria-hidden className="mt-4 h-[38px]" />;
  }

  if (voiceId) {
    const shortId = voiceId.length > 12 ? `${voiceId.slice(0, 8)}…${voiceId.slice(-4)}` : voiceId;
    return (
      <div className="pop-in mt-4 inline-flex flex-wrap items-center gap-3 rounded-full border border-lime/30 bg-lime/[0.08] py-1.5 pl-3 pr-1.5">
        <span className="inline-block h-[6px] w-[6px] rounded-full bg-lime shadow-[0_0_8px_2px_rgba(184,240,74,0.45)]" />
        <span className="text-[12px] font-semibold text-lime">голос обучен</span>
        <span className="font-mono text-[11px] text-text-dim">{shortId}</span>
        <Link
          href="/voice"
          className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-3 py-1 text-[12px] font-medium text-text-dim transition-colors hover:bg-white/[0.1] hover:text-text"
        >
          сменить
          <ArrowRight size={12} aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="pop-in mt-4 inline-flex flex-wrap items-center gap-3 rounded-full border border-amber/35 bg-amber/[0.08] py-1.5 pl-3 pr-1.5">
      <span className="inline-block h-[6px] w-[6px] rounded-full bg-amber" />
      <span className="text-[12px] font-semibold text-amber">голос: дефолтный</span>
      <Link
        href="/voice"
        className="inline-flex items-center gap-1 rounded-full bg-blue px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-gold"
      >
        обучить свой
        <ArrowRight size={12} aria-hidden />
      </Link>
    </div>
  );
}
