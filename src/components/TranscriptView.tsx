'use client'
import { useState } from 'react'
import { Copy, Check, Download, FileText, Youtube, FileAudio } from 'lucide-react'
import { buildSrt, downloadFile, formatTime, safeFilename } from '@/lib/format'
import type { TranscriptData } from '@/lib/types'

export default function TranscriptView({ data }: { data: TranscriptData }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const text = data.paragraphs.length
      ? data.paragraphs.map(p => p.text).join('\n\n')
      : data.transcript
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function exportTxt() {
    const text = data.paragraphs.length
      ? data.paragraphs.map(p => p.text).join('\n\n')
      : data.transcript
    downloadFile(text, `${safeFilename(data.transcript.slice(0, 40))}.txt`, 'text/plain')
  }

  function exportSrt() {
    if (data.paragraphs.length === 0) return
    downloadFile(
      buildSrt(data.paragraphs),
      `${safeFilename(data.transcript.slice(0, 40))}.srt`,
      'text/plain',
    )
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700/40 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Транскрипт</h3>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
            {data.source === 'youtube' ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400">
                <Youtube className="w-3 h-3" /> YouTube
              </span>
            ) : data.source === 'ytdlp+deepgram' ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                <FileAudio className="w-3 h-3" /> yt-dlp + Deepgram
              </span>
            ) : (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400">
                <FileAudio className="w-3 h-3" /> Deepgram
              </span>
            )}
            {data.duration !== null && <span>{formatTime(data.duration)}</span>}
            {data.detectedLanguage && (
              <span className="px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-400 uppercase">
                {data.detectedLanguage}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={copy} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all">
            {copied ? (<><Check className="w-3 h-3 text-emerald-400" /> Скопировано</>) : (<><Copy className="w-3 h-3" /> Копировать</>)}
          </button>
          <button onClick={exportTxt} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all">
            <Download className="w-3 h-3" /> .txt
          </button>
          <button
            onClick={exportSrt}
            disabled={data.paragraphs.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText className="w-3 h-3" /> .srt
          </button>
        </div>
      </div>
      <div className="p-5 max-h-[60vh] overflow-y-auto">
        {data.paragraphs.length > 0 ? (
          <div className="space-y-4">
            {data.paragraphs.map((p, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-[11px] text-slate-600 font-mono tabular-nums flex-shrink-0 pt-0.5 w-14">
                  {formatTime(p.start)}
                </span>
                <p className="text-sm text-slate-200 leading-relaxed flex-1">{p.text}</p>
              </div>
            ))}
          </div>
        ) : data.transcript ? (
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{data.transcript}</p>
        ) : (
          <p className="text-sm text-slate-500 italic">Пустой результат</p>
        )}
      </div>
    </div>
  )
}
