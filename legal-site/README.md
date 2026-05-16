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

## Деплой на Netlify

Через git-импорт (без CLI):

1. Запушить ветку (уже сделано).
2. https://app.netlify.com → **Add new site** → **Import an existing project** → выбрать репозиторий.
3. В настройках сборки указать:
   - **Branch to deploy**: `claude/legal-company-site-Iy5a0` (или `main` после мержа).
   - **Base directory**: `legal-site`
   - Команду сборки и publish-папку Netlify прочитает из `legal-site/netlify.toml` (`npm run build`, `.next`).
4. **Site configuration → Environment variables** → добавить:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `NEXT_PUBLIC_TELEGRAM_USERNAME`
   - `NEXT_PUBLIC_WHATSAPP_PHONE`
5. **Deploy site**. После сборки API-роут `/api/lead` поднимется как Netlify Function автоматически (через `@netlify/plugin-nextjs`).

> Netlify Drop (drag-and-drop одной папкой) не подойдёт — он деплоит только статические файлы, а у нас серверный роут для отправки в Telegram.

## Дальше

- Дополнить список услуг (`src/components/Services.tsx`).
- Сделать отдельные страницы под каждую услугу (`src/app/services/[slug]/page.tsx`).
- Добавить hCaptcha / Turnstile в `/api/lead` против спама.
- Сохранять заявки не только в Telegram, но и в БД.
