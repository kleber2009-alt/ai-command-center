'use client'

import { useEffect } from 'react'
import { getTelegram } from '@/lib/telegram'

// Runs once on mount: wires up Telegram WebApp lifecycle.
// - Marks the app as ready (otherwise the loader stays visible)
// - Expands to full height
// - Applies Telegram theme colors as CSS variables on <html>
//
// Safe to render outside Telegram — getTelegram() returns null and we no-op.
export default function TelegramInit() {
  useEffect(() => {
    const tg = getTelegram()
    if (!tg) return

    tg.ready()
    tg.expand()

    // Drop the raw initData into a cookie so server middleware can read it
    // on every API call without us threading a header through every fetch.
    // Not httpOnly (we set it from JS); SameSite=Lax is enough because we
    // never use it for cross-site auth.
    if (tg.initData) {
      document.cookie = `tg_init_data=${encodeURIComponent(tg.initData)}; path=/; max-age=86400; samesite=lax`
    }

    const applyTheme = () => {
      const t = tg.themeParams
      const root = document.documentElement
      const set = (k: string, v: string | undefined) => {
        if (v) root.style.setProperty(k, v)
      }
      set('--tg-bg', t.bg_color)
      set('--tg-text', t.text_color)
      set('--tg-hint', t.hint_color)
      set('--tg-link', t.link_color)
      set('--tg-button', t.button_color)
      set('--tg-button-text', t.button_text_color)
      set('--tg-secondary-bg', t.secondary_bg_color)
      set('--tg-section-bg', t.section_bg_color)
      set('--tg-section-header-text', t.section_header_text_color)
      set('--tg-accent-text', t.accent_text_color)
      set('--tg-destructive-text', t.destructive_text_color)
      root.dataset.tgScheme = tg.colorScheme
    }

    applyTheme()
    tg.onEvent('themeChanged', applyTheme)
    return () => tg.offEvent('themeChanged', applyTheme)
  }, [])

  return null
}
