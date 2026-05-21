# ai-office — CLAUDE.md

AI Growth Office. Static "AI Business Command Center" marketing site +
**живой `persona-train.html`** прототип (ElevenLabs voice-clone flow,
`netlify/functions/voice-{clone,generate,list}.js`), backed by `voices` /
`voice_generations` таблицами и `voice-notes` storage bucket из
`apps/ai-office/supabase/migrations/003_voice.sql`.

Prod: `ai-office.46-62-215-11.nip.io` (Caddy → контейнер `infra-ai-office-1`).
Лиды → Make.com + Supabase (НЕ через `apps/transcribe/api/leads`).

## Деплой

Hetzner через Caddy + статика. Часть voice-* endpoints — **Netlify
Functions**, поэтому Netlify нужен (не Vercel; Netlify Drop без функций не
работает). См. корневой `netlify.toml`.

## Legacy notice

Большая часть страниц этого приложения — legacy маркетинг. **Единственная
живая фича — `persona-train.html` + voice endpoints**, остальное держим
для ссылок / истории.

Реальный продакшен flow по обучению голоса теперь живёт в
`apps/persona-train/`. Если делаешь фичу про voice — иди туда, не сюда.

## Schema

`apps/ai-office/supabase/migrations/003_voice.sql` создаёт:
- `voices` — список клонированных голосов (шерится с `apps/persona-train`!)
- `voice_generations` — TTS-генерации
- bucket `voice-notes` — исходники

## Shared invariant

Таблица `voices` шерится с `apps/persona-train`. Любая миграция здесь
должна учитывать контракт там. См. `apps/persona-train/CLAUDE.md`.
