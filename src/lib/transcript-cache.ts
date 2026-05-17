'use client'
import type { TranscriptData } from './types'
import { apiFetch } from './telegram'

const PREFIX = 'transcript-cache:'

export function isLocalId(id: string): boolean {
  return id.startsWith('local-')
}

export function newLocalId(): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `local-${rand}`
}

export function saveLocal(data: TranscriptData) {
  try {
    sessionStorage.setItem(PREFIX + data.id, JSON.stringify(data))
  } catch {}
}

export function loadLocal(id: string): TranscriptData | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + id)
    return raw ? (JSON.parse(raw) as TranscriptData) : null
  } catch {
    return null
  }
}

export function patchLocal(id: string, patch: Partial<TranscriptData>) {
  const existing = loadLocal(id)
  if (!existing) return
  saveLocal({ ...existing, ...patch })
}

export async function fetchTranscript(id: string): Promise<TranscriptData | null> {
  if (isLocalId(id)) {
    return loadLocal(id)
  }
  try {
    const res = await apiFetch(`/api/transcribe/history/${id}`)
    if (!res.ok) return null
    const data = await res.json()
    return {
      id: data.id,
      url: data.url,
      transcript: data.transcript,
      paragraphs: data.paragraphs ?? [],
      duration: data.duration,
      detectedLanguage: data.language,
      source: data.source,
      title: data.title,
      summary: data.summary,
      bullets: data.bullets,
      translation: data.translation,
      generations: data.generations,
    }
  } catch {
    return null
  }
}
