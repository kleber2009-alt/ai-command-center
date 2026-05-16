// Minimal type surface for the Telegram WebApp JS SDK.
// Full reference: https://core.telegram.org/bots/webapps

export type TelegramThemeParams = {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
  header_bg_color?: string
  accent_text_color?: string
  section_bg_color?: string
  section_header_text_color?: string
  subtitle_text_color?: string
  destructive_text_color?: string
}

export type TelegramUser = {
  id: number
  is_bot?: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  photo_url?: string
}

export type TelegramMainButton = {
  text: string
  color: string
  textColor: string
  isVisible: boolean
  isActive: boolean
  isProgressVisible: boolean
  setText(text: string): TelegramMainButton
  onClick(cb: () => void): TelegramMainButton
  offClick(cb: () => void): TelegramMainButton
  show(): TelegramMainButton
  hide(): TelegramMainButton
  enable(): TelegramMainButton
  disable(): TelegramMainButton
  showProgress(leaveActive?: boolean): TelegramMainButton
  hideProgress(): TelegramMainButton
  setParams(params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): TelegramMainButton
}

export type TelegramBackButton = {
  isVisible: boolean
  onClick(cb: () => void): TelegramBackButton
  offClick(cb: () => void): TelegramBackButton
  show(): TelegramBackButton
  hide(): TelegramBackButton
}

export type TelegramHapticFeedback = {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
  notificationOccurred(type: 'error' | 'success' | 'warning'): void
  selectionChanged(): void
}

export type TelegramWebApp = {
  initData: string
  initDataUnsafe: { user?: TelegramUser; auth_date?: number; hash?: string; query_id?: string }
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  themeParams: TelegramThemeParams
  isExpanded: boolean
  viewportHeight: number
  viewportStableHeight: number
  MainButton: TelegramMainButton
  BackButton: TelegramBackButton
  HapticFeedback: TelegramHapticFeedback
  ready(): void
  expand(): void
  close(): void
  onEvent(event: string, cb: () => void): void
  offEvent(event: string, cb: () => void): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  showAlert(message: string, cb?: () => void): void
  showConfirm(message: string, cb?: (ok: boolean) => void): void
  showPopup(params: { title?: string; message: string; buttons?: any[] }, cb?: (id: string) => void): void
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp }
  }
}

export function getTelegram(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null
  return window.Telegram?.WebApp ?? null
}

export function isInTelegram(): boolean {
  const tg = getTelegram()
  // initData is empty when opened outside Telegram (or with disabled WebApp)
  return Boolean(tg && tg.initData && tg.initData.length > 0)
}
