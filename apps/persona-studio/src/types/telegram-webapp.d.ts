// Shared global typing for window.Telegram.WebApp (Telegram Mini App SDK).
// Loaded by `<Script src="https://telegram.org/js/telegram-web-app.js?57">`.
// Only the methods/fields we actually call are typed.

declare global {
  interface TelegramWebApp {
    initData?: string;
    initDataUnsafe?: { user?: { id?: number; first_name?: string; username?: string } };
    colorScheme?: 'light' | 'dark';
    themeParams?: Record<string, string>;
    ready: () => void;
    expand: () => void;
    openInvoice?: (
      url: string,
      cb: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void,
    ) => void;
  }

  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export {};
