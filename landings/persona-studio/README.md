# persona-studio-landing

Статический лендинг для **Persona Studio** — «одно фото → месяц контента».

Один HTML-файл, без сборки. Тёмная редакционная эстетика (Playfair Display +
JetBrains Mono, золото на чёрном). Раскрывает воронку продукта:
парсер виральных роликов → аватары из одного фото → говорящее видео твоим
голосом → авто-монтаж → автопубликация по расписанию. Ниже — тарифы на
токенах (Старт / Креатор / Про / Студия).

CTA («Войти через Google», тарифные кнопки) ведут на приложение —
`https://persona-app.46-62-215-11.nip.io/`.

## Деплой

Скопировать `index.html` (вместе с возможным `_redirects`) в директорию
nip.io-статики, например:

```bash
rsync -av landings/persona-studio/ prod:/var/www/persona-studio-landing/
```

И добавить блок в Caddyfile:

```
persona.46-62-215-11.nip.io {
    root * /var/www/persona-studio-landing
    file_server
}
```

## Приложение

Само приложение (Next.js + Prisma + Gemini + воркеры) живёт в этом монорепо
по пути `apps/persona-studio/`. Прод-домен приложения —
`persona-app.46-62-215-11.nip.io`. Настрой Caddy так, чтобы лендинговые CTA
уводили на корень приложения.
