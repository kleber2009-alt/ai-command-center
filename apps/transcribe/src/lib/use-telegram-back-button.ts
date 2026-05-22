'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getTelegram } from './telegram'

/**
 * Show the native Telegram BackButton while this component is mounted.
 * Default behavior on tap: router.back(). Pass a custom handler to override.
 *
 * Safe outside Telegram — getTelegram() returns null and we no-op.
 */
export function useTelegramBackButton(onBack?: () => void) {
  const router = useRouter()
  useEffect(() => {
    const tg = getTelegram()
    if (!tg) return
    const handler = () => {
      if (onBack) onBack()
      else router.back()
    }
    tg.BackButton.onClick(handler)
    tg.BackButton.show()
    return () => {
      tg.BackButton.offClick(handler)
      tg.BackButton.hide()
    }
    // onBack is captured at mount; pass a stable callback if needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
