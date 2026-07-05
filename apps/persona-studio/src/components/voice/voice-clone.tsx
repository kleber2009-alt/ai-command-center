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
    <div className={`grid gap-2 ${compact ? '' : 'border border-border-soft bg-surface p-4'}`}>
      {!compact && (
        <div className="flex items-center gap-2">
          <Mic size={14} className="text-gold" />
          <span className="font-serif text-[14px] text-text">Клонировать свой голос</span>
        </div>
      )}
      <p className="mono text-[10px] tracking-wider text-text-mute">
        Загрузите запись своего голоса (30–90 сек, чистая речь) — создадим голос для озвучки видео.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/mp4,video/webm"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-[12px] text-text-dim file:mr-3 file:py-1.5 file:px-3 file:border file:border-border file:bg-bg file:text-text file:mono file:text-[10px] file:tracking-widest file:uppercase file:cursor-pointer"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название голоса (необязательно)"
        className="w-full bg-bg border border-border px-3 py-2 font-serif text-[13px] text-text placeholder:text-text-mute focus:border-gold outline-none"
      />
      {error && <p className="mono text-[11px] text-pink">{error}</p>}
      {done && (
        <p className="flex items-center gap-1.5 mono text-[11px] text-lime">
          <CheckCircle2 size={13} /> Голос «{done}» готов — выберите его в списке голосов.
        </p>
      )}
      <button
        onClick={clone}
        disabled={busy}
        className="justify-self-start flex items-center gap-2 px-4 py-2 border border-gold bg-gold/10 mono text-[10px] tracking-widest uppercase text-gold hover:bg-gold/20 disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />}
        {busy ? 'Клонирование…' : 'Клонировать голос'}
      </button>
    </div>
  );
}
