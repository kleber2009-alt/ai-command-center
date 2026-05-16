# Legal site — MVP

Лендинг юридической компании: услуги, форма заявки → Telegram, контакты для прямой связи.

Стек: Next.js 14 (App Router) + TypeScript + Tailwind.

## Запуск

```bash
npm install
cp .env.example .env.local   # затем заполнить переменные
npm run dev                  # http://localhost:3000
```

## Переменные окружения

| Переменная                       | Назначение                                                            |
| -------------------------------- | --------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`             | Токен бота от `@BotFather`. Серверная переменная.                     |
| `TELEGRAM_CHAT_ID`               | Куда слать заявки (личный чат, группа, канал). Серверная переменная.  |
| `NEXT_PUBLIC_TELEGRAM_USERNAME`  | Юзернейм для кнопки «Telegram» в контактах, без `@`.                  |
| `NEXT_PUBLIC_WHATSAPP_PHONE`     | Телефон для кнопки «WhatsApp», в формате `79991234567` (без `+`).     |

### Как получить chat_id

1. Создать бота у `@BotFather` → получить токен.
2. Если заявки в группу — добавить бота в группу админом и написать туда любое сообщение.
3. Открыть `https://api.telegram.org/bot<token>/getUpdates` — в JSON найти `chat.id`
   (для групп он отрицательный, например `-1001234567890`).

## Структура

```
src/
  app/
    api/lead/route.ts   # POST /api/lead → Telegram sendMessage
    layout.tsx
    page.tsx            # одна страница, все секции
    globals.css
  components/
    Hero.tsx
    Services.tsx        # 3 блока — потом дополним
    LeadSection.tsx
    LeadForm.tsx        # клиентский компонент
    Contacts.tsx        # Telegram + WhatsApp
    Footer.tsx
```

## Деплой

Vercel: импортировать репо, прописать env-переменные в Project Settings → Environment Variables, задеплоить.

## Дальше

- Дополнить список услуг (`src/components/Services.tsx`).
- Сделать отдельные страницы под каждую услугу (`src/app/services/[slug]/page.tsx`).
- Добавить hCaptcha / Turnstile в `/api/lead` против спама.
- Сохранять заявки не только в Telegram, но и в БД.
