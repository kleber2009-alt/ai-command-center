'use client'

import { useEffect, useRef, useState } from 'react'
import { apiFetch } from './api-client'

export type VoiceState = 'idle' | 'recording' | 'transcribing'

export type UseVoiceInputOptions = {
  language?: 'ru' | 'en' | 'auto'
  onResult: (text: string) => void
  onError?: (message: string) => void
}

/**
 * Records mic audio with MediaRecorder, then POSTs it to /api/voice/transcribe.
 * Caller toggles record/stop via the returned `start` / `stop` functions
 * (or the single `toggle` for a single mic button).
 */
export function useVoiceInput({ language = 'ru', onResult, onError }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceState>('idle')
  const [supported, setSupported] = useState(true)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef<number>(0)

  useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      !!navigator?.mediaDevices?.getUserMedia &&
      typeof window.MediaRecorder !== 'undefined'
    setSupported(ok)
  }, [])

  function pickMime(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ]
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c
    }
    return ''
  }

  async function start() {
    if (!supported || state !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickMime()
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorderRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = handleStop
      startedAtRef.current = Date.now()
      rec.start()
      setState('recording')
    } catch (e: any) {
      const msg =
        e?.name === 'NotAllowedError'
          ? 'Доступ к микрофону запрещён'
          : e?.message || 'Не удалось начать запись'
      onError?.(msg)
      cleanup()
    }
  }

  async function handleStop() {
    const tooShort = Date.now() - startedAtRef.current < 250
    const mime = recorderRef.current?.mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: mime })
    cleanup()

    if (tooShort || blob.size < 1000) {
      setState('idle')
      onError?.('Слишком короткая запись')
      return
    }

    setState('transcribing')
    try {
      const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'bin'
      const fd = new FormData()
      fd.append('audio', new File([blob], `voice.${ext}`, { type: mime }))
      fd.append('language', language)
      const res = await apiFetch('/api/voice/transcribe', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      const text = typeof data.text === 'string' ? data.text.trim() : ''
      if (!text) throw new Error('Пустой ответ распознавания')
      onResult(text)
    } catch (e: any) {
      onError?.(e?.message || 'Ошибка распознавания')
    } finally {
      setState('idle')
    }
  }

  function stop() {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }

  function cancel() {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      // Replace onstop so we don't trigger the upload path on a cancel.
      rec.onstop = () => {}
      rec.stop()
    }
    chunksRef.current = []
    cleanup()
    setState('idle')
  }

  function cleanup() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recorderRef.current = null
  }

  async function toggle() {
    if (state === 'recording') stop()
    else if (state === 'idle') await start()
  }

  return { state, supported, start, stop, toggle, cancel }
}
