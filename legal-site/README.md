# Legal site — MVP

Лендинг юридической компании: hero, услуги, прямые контакты (Telegram + WhatsApp).
Полностью статический сайт, без бэкенда.

Стек: Next.js 14 (App Router, static export) + TypeScript + Tailwind.

## Запуск

```bash
npm install
cp .env.example .env.local   # затем заполнить переменные
npm run dev                  # http://localhost:3000
```

## Сборка

```bash
npm run build   # генерирует папку out/ со статикой
```

## Переменные окружения

Обе подставляются на этапе сборки и попадают в клиентский JS — секретов тут нет.

| Переменная                       | Назначение                                                          |
| -------------------------------- | ------------------------------------------------------------------- |
| `NEXT_PUBLIC_TELEGRAM_USERNAME`  | Юзернейм для кнопки «Telegram», без `@`.                            |
| `NEXT_PUBLIC_WHATSAPP_PHONE`     | Телефон для кнопки «WhatsApp», в формате `79991234567` (без `+`).   |

## Деплой на Netlify

### Вариант 1 — Netlify Drop (drag-and-drop одной папки)

```bash
NEXT_PUBLIC_TELEGRAM_USERNAME=legal_company \
NEXT_PUBLIC_WHATSAPP_PHONE=79991234567 \
npm run build
```

Открыть https://app.netlify.com/drop → перетащить папку `out/`. Сайт поднимется
за секунды. Чтобы поменять контакты — пересобрать с новыми env и перетащить заново.

### Вариант 2 — Git-импорт (автообновление при push)

1. https://app.netlify.com → **Add new site** → **Import an existing project** → выбрать репо.
2. Настройки сборки (большинство подтянется из `netlify.toml`):
   - **Base directory**: `legal-site`
   - **Build command**: `npm run build`
   - **Publish directory**: `out`
3. **Site configuration → Environment variables** → `NEXT_PUBLIC_TELEGRAM_USERNAME`, `NEXT_PUBLIC_WHATSAPP_PHONE`.
4. **Deploy site**.

## Структура

```
src/
  app/
    layout.tsx
    page.tsx            # одна страница, все секции
    globals.css
  components/
    Hero.tsx
    Services.tsx        # 3 общих блока — потом дополним
    Contacts.tsx        # Telegram + WhatsApp кнопки
    Footer.tsx
```

## Дальше

- Дополнить список услуг (`src/components/Services.tsx`).
- Сделать отдельные страницы под каждую услугу (`src/app/services/[slug]/page.tsx`).
- Если позже понадобится форма заявок — добавим серверный роут и переедем
  с `output: 'export'` на обычный SSR-деплой (тогда Drop уже не подойдёт).
```
