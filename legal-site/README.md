# Legal site — MVP

Лендинг юридической компании: hero, услуги, форма обратного звонка
(заявка летит в Telegram-бот), прямые контакты Telegram + WhatsApp.

Стек: Next.js 14 (App Router) + TypeScript + Tailwind.

## Запуск локально

```bash
npm install
cp .env.example .env.local   # затем заполнить переменные
npm run dev                  # http://localhost:3000
```

## Переменные окружения

| Переменная                       | Назначение                                                              | Тип        |
| -------------------------------- | ----------------------------------------------------------------------- | ---------- |
| `TELEGRAM_BOT_TOKEN`             | Токен бота от `@BotFather`. Никогда не светится клиенту.                | server     |
| `TELEGRAM_CHAT_ID`               | Чат, куда летят заявки (личный, группа, канал).                         | server     |
| `NEXT_PUBLIC_TELEGRAM_USERNAME`  | Юзернейм для прямой кнопки «Telegram», без `@`.                         | public     |
| `NEXT_PUBLIC_WHATSAPP_PHONE`     | Телефон для прямой кнопки «WhatsApp», `79991234567` (без `+`).          | public     |

### Получить chat_id

1. Создать бота у `@BotFather` → получить токен.
2. Для группы: добавить бота админом, написать в группу любое сообщение.
3. Открыть `https://api.telegram.org/bot<token>/getUpdates` — найти `chat.id`
   (для групп он отрицательный, например `-1001234567890`).

## Деплой на Netlify (git-import)

1. https://app.netlify.com → **Add new site** → **Import an existing project** → выбрать репо.
2. Настройки сборки подтянутся из `legal-site/netlify.toml`:
   - **Base directory**: `legal-site`
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
3. **Site configuration → Environment variables** → добавить 4 переменных выше.
4. **Deploy site**. `@netlify/plugin-nextjs` поднимет `/api/lead` как Netlify Function.

## Структура

```
src/
  app/
    api/lead/route.ts        # POST /api/lead → Telegram sendMessage
    layout.tsx
    page.tsx                 # одна страница, все секции
    globals.css
  components/
    Hero.tsx                 # CTA "Заказать звонок" → #callback
    Services.tsx             # 4 направления, дополним позже
    CallbackForm.tsx         # имя + телефон, "use client"
    CallbackSection.tsx
    Contacts.tsx             # Telegram + WhatsApp кнопки
    Footer.tsx
```

## Дальше

- Дополнить список услуг (`src/components/Services.tsx`).
- Отдельные страницы под каждую услугу (`src/app/services/[slug]/page.tsx`).
- Антиспам в `/api/lead` (hCaptcha / Turnstile + rate-limit по IP).
- Сохранение заявок в БД помимо Telegram.
