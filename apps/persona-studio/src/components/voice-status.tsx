'use client';

import Link from 'next/link';
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
      <div className="mt-4 inline-flex items-center gap-3 border border-lime/40 bg-lime/[0.05] px-3 py-2">
        <span className="inline-block w-[6px] h-[6px] rounded-full bg-lime" />
        <span className="mono text-[10px] tracking-widest uppercase text-lime">голос обучен</span>
        <span className="mono text-[10px] tracking-wider text-text-dim">{shortId}</span>
        <Link
          href="/voice"
          className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text"
        >
          сменить →
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 inline-flex items-center gap-3 border border-warm/50 bg-warm/[0.05] px-3 py-2">
      <span className="inline-block w-[6px] h-[6px] rounded-full bg-warm" />
      <span className="mono text-[10px] tracking-widest uppercase text-warm">голос: дефолтный</span>
      <Link
        href="/voice"
        className="mono text-[10px] tracking-widest uppercase text-text hover:text-text-dim"
      >
        обучить свой →
      </Link>
    </div>
  );
}
