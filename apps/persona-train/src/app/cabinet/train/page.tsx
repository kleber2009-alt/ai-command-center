'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export default function TrainPage() {
  const [owner, setOwner] = useState('@ilia_pali0');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [filename, setFilename] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem('persona_train_owner');
      if (v) setOwner(v);
    } catch {}
  }, []);

  async function toggleRec() {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const b = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        setBlob(b);
        setFilename(`recording.${rec.mimeType.includes('mp4') ? 'm4a' : 'webm'}`);
        setRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
      };
      rec.start();
      recorderRef.current = rec;
      startRef.current = Date.now();
      setRecording(true);
      setStatus(null);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 200);
    } catch (e) {
      setStatus({ kind: 'err', text: 'Микрофон недоступен: ' + (e as Error).message });
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBlob(f);
    setFilename(f.name);
  }

  async function uploadAsSample() {
    if (!blob || !owner.trim()) return;
    const fd = new FormData();
    fd.append('owner_handle', owner.trim());
    fd.append('source', 'web');
    fd.append('file', blob, filename || 'sample.mp3');
    setStatus({ kind: 'info', text: 'Загружаю в samples…' });
    const res = await fetch('/api/voice/sample', { method: 'POST', body: fd });
    const data = await res.json();
    setStatus(res.ok
      ? { kind: 'ok', text: `+1 sample · pending ${data.pending_count} · ${Math.round(data.pending_seconds)}s${data.should_train ? ' · 🟢 ready /train' : ''}` }
      : { kind: 'err', text: JSON.stringify(data).slice(0, 200) });
  }

  async function uploadAsCloneNow() {
    if (!blob || !owner.trim()) return;
    const fd = new FormData();
    fd.append('owner_handle', owner.trim());
    fd.append('display_name', owner.trim());
    fd.append('files', blob, filename || 'sample.mp3');
    setStatus({ kind: 'info', text: 'Клонирую через ElevenLabs IVC (5-15s)…' });
    const res = await fetch('/api/voice/clone', { method: 'POST', body: fd });
    const data = await res.json();
    setStatus(res.ok
      ? { kind: 'ok', text: `✓ voice_id: ${data.voice_id} · provider_voice_id: ${data.provider_voice_id}` }
      : { kind: 'err', text: JSON.stringify(data).slice(0, 200) });
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <Link href="/cabinet" className="mb-6 inline-block text-[10px] uppercase tracking-[0.2em] text-muted hover:text-accent">
          ← Кабинет
        </Link>
        <h1 className="text-3xl font-bold">
          <span className="text-accent">Train</span> · клон голоса
        </h1>
        <p className="mt-3 text-[12px] text-muted">
          Запиши 30–180 сек чистой моноречи или загрузи готовый mp3/m4a/wav/ogg. <b className="text-text">Sample</b> = докинуть в общий пул, <b className="text-text">Clone now</b> = создать новый voice_id из этой записи.
        </p>

        <section className="mt-8 rounded-2xl border border-white/[0.06] bg-s1 p-6">
          <div className="mb-3 text-[10px] uppercase tracking-[0.15em] text-muted">Owner</div>
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-s2 px-4 py-3 text-[13px] outline-none focus:border-accent"
          />

          <div className="mt-6 flex flex-col items-center gap-4 rounded-xl border border-dashed border-white/10 bg-s2 p-6">
            <button
              onClick={toggleRec}
              className={`flex h-20 w-20 items-center justify-center rounded-full text-3xl text-white transition ${recording ? 'animate-pulse bg-gradient-to-br from-warm to-orange' : 'bg-gradient-to-br from-red to-[#a02040]'}`}
            >
              {recording ? '⏹' : '🎙'}
            </button>
            <div className="font-mono text-2xl tabular-nums">
              {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
              {String(elapsed % 60).padStart(2, '0')}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted">...или загрузи файл</div>
            <input type="file" accept="audio/*" onChange={onFile} className="text-[12px] text-muted" />
          </div>

          {blob && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-s2 p-3">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio src={URL.createObjectURL(blob)} controls className="flex-1" />
              <span className="text-[10px] text-muted">{(blob.size / 1024).toFixed(0)} KB</span>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={uploadAsSample}
              disabled={!blob}
              className="rounded-xl border border-accent/40 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent disabled:opacity-40"
            >
              + Sample
            </button>
            <button
              onClick={uploadAsCloneNow}
              disabled={!blob}
              className="rounded-xl bg-accent px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-bg disabled:opacity-40"
            >
              Clone now →
            </button>
          </div>

          {status && (
            <div
              className={`mt-4 rounded-xl border p-3 text-[12px] ${
                status.kind === 'ok'
                  ? 'border-green/30 bg-green/5 text-green'
                  : status.kind === 'err'
                    ? 'border-red/30 bg-red/5 text-red'
                    : 'border-cyan/30 bg-cyan/5 text-cyan'
              }`}
            >
              {status.text}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
