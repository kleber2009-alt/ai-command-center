# persona-studio-landing

Статический лендинг для **Persona Studio** — AI Avatar Content Studio.

Один HTML-файл, без сборки, без JS, тёмная Apple-эстетика с акцентом
на пурпур-фуксию. Аналог `transcribe-landing/`: тот же паттерн «лендинг
+ ссылка на приложение».

## Деплой

Скопировать `index.html` (вместе с возможным `_redirects`) в директорию
nip.io-статики — например:

```bash
rsync -av persona-studio-landing/ prod:/var/www/persona-studio-landing/
```

И добавить блок в Caddyfile:

```
persona.46-62-215-11.nip.io {
    root * /var/www/persona-studio-landing
    file_server
}
```

## Приложение

Само приложение (Next.js + Prisma + Gemini + HeyGen) живёт в
`kleber2009-alt/ai-command-center` →
`apps/persona-studio/`. Лендинг ссылается на корневой `/`
приложения — настрой Caddy так, чтобы `Создать аватар` уводил на
домен Next.js-приложения.
