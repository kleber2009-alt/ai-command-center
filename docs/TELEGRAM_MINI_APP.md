# Telegram Mini App

The app is built to run both as a regular web page and as a Telegram Mini App.
When opened from inside Telegram, it adapts: hides the in-page submit button
and binds the form to Telegram's native `MainButton` at the bottom of the
viewport, applies the user's Telegram theme colors, and fires haptic feedback
on key actions.

## Quick check

After deploy, open your Vercel URL in a regular browser — should work as before
(in-page "Получить текст" button visible).

Open the same URL inside Telegram (see setup below) — submit button is gone
and a blue "Получить текст" bar appears at the bottom of the screen.

## One-time bot setup via BotFather

1. Open [@BotFather](https://t.me/BotFather) in Telegram → `/start`
2. `/newbot` → pick a name and username (e.g. `mytranscribe_bot`).
   Save the **bot token** that BotFather sends.
3. `/newapp` → pick the bot you just created
4. Fill in:
   - **Title**: `Транскрипция`
   - **Description**: short pitch (≤256 chars)
   - **Photo**: a 640×360 PNG/JPG (your icon/cover)
   - **Web App URL**: your Vercel production URL (e.g.
     `https://ai-command-center.vercel.app/transcribe`)
   - **Short name**: short identifier (e.g. `transcribe`)
5. BotFather replies with a `https://t.me/<bot>/app` or
   `https://t.me/<bot>?startapp` link — that's your mini app link.

## Bonus: pin the app to the bot's menu

1. `/mybots` → pick your bot → **Bot Settings** → **Menu Button**
2. **Configure menu button** → set:
   - Button text: `Открыть`
   - URL: your Vercel URL
3. Now users open the bot chat and tap the persistent menu button at the
   bottom-left to launch the app.

## Server-side auth (TODO)

Telegram passes `initData` to the web app — a signed query string containing
the user's id, name, and a hash computed with the bot token. The app should
verify this hash on the server before trusting the user.

Right now the API routes are open (no verification). If you want per-user
history or rate limiting:

1. Add `TELEGRAM_BOT_TOKEN` env var on Vercel
2. Implement `verifyTelegramInitData(initData, token)` per
   [Telegram docs](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
3. Frontend sends `Authorization: tma <initData>` on each API call
4. Each route validates and extracts `user_id`

Skip for now if you just want the mini app to work for everyone.

## Theme

The app uses Telegram's `themeParams` exposed as CSS variables on `<html>`
(`--tg-bg`, `--tg-text`, `--tg-button`, …). Currently we fall back to our own
slate-950 dark theme everywhere. If you want full theme adoption, swap the
fixed slate colors for the CSS vars in `src/app/transcribe/page.tsx`.

## Reference

- [Mini Apps platform docs](https://core.telegram.org/bots/webapps)
- [BotFather commands](https://core.telegram.org/bots/features#botfather)
