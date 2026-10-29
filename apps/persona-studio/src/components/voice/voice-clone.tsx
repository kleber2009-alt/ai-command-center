'use client';

// Нативное клонирование голоса внутри persona-studio (один проект / один
// домен). Загрузка аудио-образца → POST /api/voice/clone → готовый голос.
// Без упоминания провайдера (white-label).

import { useRef, useState } from 'react';
import { Mic, Loader2, CheckCircle2 } from 'lucide-react';

export function VoiceClone({
  onCloned,
  compact,
}: {
  onCloned?: (voice: { voiceId: string; name: string }) => void;
  compact?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function clone() {
    if (!file) {
      setError('Прикрепите аудио-образец (30–90 секунд чистой речи).');
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const fd = new FormData();
      fd.append('sample', file);
      if (name.trim()) fd.append('name', name.trim());
      const res = await fetch('/api/voice/clone', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Не удалось клонировать голос.');
      setDone(data.name || 'Голос готов');
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onCloned?.({ voiceId: data.voiceId, name: data.name });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`grid gap-3 ${compact ? '' : 'panel p-5 sm:p-6'}`}>
      {!compact && (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue/15 text-gold">
            <Mic size={16} aria-hidden />
          </span>
          <span className="text-[16px] font-semibold tracking-[-0.02em] text-text">Клонировать свой голос</span>
        </div>
      )}
      <p className="text-[12px] leading-relaxed text-text-mute">
        Загрузите запись своего голоса (30–90 сек, чистая речь) — создадим голос для озвучки видео.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/mp4,video/webm"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-2 text-[13px] text-text-dim transition-colors hover:border-gold/60 hover:bg-blue/[0.06] file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-border-soft file:bg-white/[0.08] file:px-4 file:py-1.5 file:text-[13px] file:font-semibold file:text-text hover:file:bg-white/[0.12]"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название голоса (необязательно)"
        className="input"
      />
      {error && (
        <p className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">{error}</p>
      )}
      {done && (
        <p className="pop-in flex items-center gap-2 rounded-2xl border border-lime/30 bg-lime/10 px-4 py-2.5 text-[13px] text-lime">
          <CheckCircle2 size={15} aria-hidden /> Голос «{done}» готов — выберите его в списке голосов.
        </p>
      )}
      <button
        type="button"
        onClick={clone}
        disabled={busy}
        className="btn-primary justify-self-start"
      >
        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Mic size={15} aria-hidden />}
        {busy ? 'Клонирование…' : 'Клонировать голос'}
      </button>
    </div>
  );
}
