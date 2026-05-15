# Lex & Partners — сайт юридической фирмы

Самостоятельный проект (Next.js 14 + TypeScript + Tailwind). Не связан с родительским
`ai-command-center` — может быть вынесен в отдельный репозиторий.

## Запуск

```bash
cd legal-site
npm install
npm run dev
```

Открыть http://localhost:3000

## Структура

```
legal-site/
├── app/
│   ├── layout.tsx        корневой layout, метаданные
│   ├── page.tsx          главная — собирает секции
│   └── globals.css       Tailwind + шрифты
└── components/
    ├── Header.tsx        шапка с навигацией и CTA
    ├── Hero.tsx          первый экран
    ├── Services.tsx      услуги — пустая сетка, ждёт наполнения
    ├── About.tsx         о фирме + цифры
    ├── Contact.tsx       форма заявки + контакты
    └── Footer.tsx        подвал
```

## Что дальше

- Наполнить `Services.tsx` реальными услугами (направления, описания, цены).
- Подключить отправку формы (e-mail / Telegram / CRM).
- Заменить плейсхолдеры: телефон, e-mail, адрес, название фирмы.
