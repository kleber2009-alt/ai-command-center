import type { Logger } from './logger.js'

export type OfficeHqView = 'help' | 'brief' | 'standup' | 'focus' | 'escalations' | 'decisions'

export type OfficeHqClient = {
  enabled: boolean
  webUrl?: string
  fetchView(view: OfficeHqView): Promise<{ title: string; text: string; fallback: boolean }>
}

type OfficeHqClientDeps = {
  baseUrl?: string
  webUrl?: string
  timeoutMs: number
  logger: Logger
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '')
}

export function createOfficeHqClient(deps: OfficeHqClientDeps): OfficeHqClient {
  const { baseUrl, webUrl, timeoutMs, logger } = deps

  if (!baseUrl) {
    return {
      enabled: false,
      webUrl,
      async fetchView() {
        throw new Error('OFFICE_HQ_BASE_URL is not configured')
      },
    }
  }

  const normalizedBase = normalizeBaseUrl(baseUrl)

  return {
    enabled: true,
    webUrl,
    async fetchView(view) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(`${normalizedBase}/api/office/hq?view=${encodeURIComponent(view)}`, {
          method: 'GET',
          signal: controller.signal,
          headers: { accept: 'application/json' },
        })
        if (!res.ok) {
          throw new Error(`HQ request failed: ${res.status}`)
        }
        const json = await res.json() as { title?: string; text?: string; fallback?: boolean }
        if (!json.title || !json.text) {
          throw new Error('HQ response is missing title or text')
        }
        return {
          title: json.title,
          text: json.text,
          fallback: Boolean(json.fallback),
        }
      } catch (error) {
        logger.error('office HQ fetch failed', {
          view,
          baseUrl: normalizedBase,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
