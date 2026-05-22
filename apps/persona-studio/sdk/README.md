# @persona-studio/sdk

TypeScript-клиент для **Persona Studio** — 1 фото → 10 AI-аватаров → talking-photo
видео (HeyGen V) или обложка карусели.

Zero-deps (только глобальный `fetch`). Работает в Node 18+ и любом современном
браузере. Все методы типизированы.

---

## Установка

Внутри monorepo (workspaces):

```bash
npm i @persona-studio/sdk@*
```

Снаружи (если опубликован в приватном npm или установка из git):

```bash
npm i @persona-studio/sdk
# или
npm i git+https://github.com/YOUR/repo.git#path:apps/persona-studio/sdk
```

---

## Получение API-key

1. Логин в твой инстанс Persona Studio (например `https://persona-app.46-62-215-11.nip.io`)
2. `/settings/keys` → **Create key** → скопировать `ps_…` (показывается один раз)
3. Положить в env вызывающего проекта как `PERSONA_API_KEY`

---

## Quickstart

```ts
import { createPersonaClient } from '@persona-studio/sdk';
import fs from 'node:fs/promises';

const ps = createPersonaClient({
  baseUrl: 'https://persona-app.46-62-215-11.nip.io',
  apiKey:  process.env.PERSONA_API_KEY!,
});

// 1. Загрузить фото
const buf = await fs.readFile('./me.jpg');
const upload = await ps.uploadPhoto({ name: 'me.jpg', data: buf, type: 'image/jpeg' });

// 2. Стартовать генерацию 10 аватаров
const job = await ps.generateAvatars({ uploadId: upload.id });

// 3. Ждать завершения (хелпер polling'а)
const gen = await ps.waitFor(() => ps.getAvatarGeneration(job.id), { maxMs: 5 * 60_000 });
console.log(`Сгенерировано ${gen.avatars.filter(a => a.status === 'done').length} / 10`);

// 4. Выбрать аватар и создать видео
const best = gen.avatars.find(a => a.status === 'done')!;
await ps.selectAvatar(best.id);
const video = await ps.createVideo({
  avatarId: best.id,
  script: 'Привет! Это говорит мой цифровой двойник.',
  voiceId: 'ru-male-1',
  aspect: '9:16',
});

// 5. Ждать рендера
const ready = await ps.waitFor(() => ps.getVideo(video.id));
console.log('Готовое видео:', ready.videoUrl);
```

---

## curl, для тех кто не на JS

```bash
# Создать видео из уже существующего аватара
curl -X POST https://persona-app.46-62-215-11.nip.io/api/videos \
  -H "Authorization: Bearer ps_..." \
  -H "Content-Type: application/json" \
  -d '{
    "avatarId": "av_...",
    "script":   "Привет!",
    "voiceId":  "ru-male-1"
  }'

# Опросить статус
curl "https://persona-app.46-62-215-11.nip.io/api/videos?id=vid_..." \
  -H "Authorization: Bearer ps_..."
```

---

## Поддерживаемые методы

| Метод | HTTP | Что делает |
|---|---|---|
| `uploadPhoto(file)` | POST `/api/upload` | Загружает фото в S3, возвращает upload id |
| `listUploads()` | GET `/api/upload` | Последние 20 загрузок |
| `generateAvatars({ uploadId })` | POST `/api/generate-avatars` | Стартует batch на 10 аватаров (списывает 10 токенов) |
| `getAvatarGeneration(id)` | GET `/api/generate-avatars?id=…` | Статус batch'а + сами аватары |
| `listAvatars()` | GET `/api/avatars` | Все аватары пользователя |
| `selectAvatar(id)` | POST `/api/avatars/:id/select` | Помечает аватар как выбранный |
| `deleteAvatar(id)` | DELETE `/api/avatars/:id/select` | Удаляет аватар |
| `createVideo({...})` | POST `/api/videos` | Создаёт talking-photo видео (по умолч. HeyGen V, 30 токенов) |
| `getVideo(id)` | GET `/api/videos?id=…` | Статус и результат видео |
| `listVideos(limit?)` | GET `/api/videos` | Последние N видео |
| `createCover({...})` | POST `/api/generate-cover` | Обложка карусели из аватара (3 токена) |
| `getCover(id)` | GET `/api/generate-cover?id=…` | Статус и URL обложки |
| `listCovers(limit?)` | GET `/api/covers` | Последние N обложек |
| `getBalance()` | GET `/api/billing/balance` | Баланс токенов + последние 20 транзакций |
| `waitFor(poll, opts?)` | — | Polling-хелпер для ожидания `completed` |

---

## Ошибки

Все методы кидают `PersonaApiError` с полями:

```ts
class PersonaApiError extends Error {
  status: number;   // HTTP status (0 при network/timeout)
  code?: string;    // машинный код: "insufficient_tokens", "engine_disabled", "TIMEOUT", ...
  raw: unknown;     // полное тело ответа
}
```

Типовые коды:
- `401` — `UNAUTHORIZED` — ключ просрочен или отозван
- `402` — `insufficient_tokens` — не хватает токенов (см. `raw.have`, `raw.need`)
- `400` — `engine_disabled` — попытался использовать движок, не разрешённый на инстансе
- `400` — `script_required`, `voice_required`, `avatar_not_found`, `avatar_not_ready`
- `404` — `not_found`
- `500` — `enqueue_failed` — очередь BullMQ не приняла задачу, токены вернулись

---

## Стоимость операций (по умолчанию)

| Операция | Токены |
|---|---|
| `generateAvatars` (1 batch × 10 стилей) | 10 |
| `createVideo` (HeyGen V) | 30 |
| `createVideo` (OmniHuman 1.5) | 50 _(сейчас выключен)_ |
| `createCover` | 3 |

При network/queue failure токены автоматически возвращаются.

---

## Безопасность

- Plaintext ключа возвращается из POST `/api/keys` **один раз**. Если потерял — выпускай новый и удаляй старый.
- Ключ даёт доступ ко всем данным пользователя, на которого выпущен. Не клади в публичные репо. Используй env-переменные.
- Отзыв ключа: DELETE `/api/keys/:id` или через UI `/settings/keys`.

---

## Версионирование

Семантическое: `MAJOR.MINOR.PATCH`.
- MAJOR — ломающие изменения API (новый метод полей, удалённые методы).
- MINOR — новые методы.
- PATCH — bugfix, тип-уточнения.

Текущая версия: **0.1.0** — pre-stable, могут быть мелкие изменения сигнатур.
