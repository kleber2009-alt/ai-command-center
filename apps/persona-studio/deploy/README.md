# Persona Studio — запуск на новом сервере

Всё приложение (сайт, воркеры, монтаж ffmpeg, Postgres, Redis, файловое
хранилище S3, HTTPS) поднимается на одном чистом сервере одной командой.

## 1. Сервер

Любой VPS: **Ubuntu 24.04**, от **4 vCPU / 8 ГБ RAM / 80 ГБ диска**
(Timeweb Cloud, Aeza, DigitalOcean, Vultr, Hetzner…). Нужен только root-доступ
через веб-консоль провайдера — SSH не обязателен.

## 2. DNS

У зоны `aicex.club` DNS на Cloudflare (не в GoDaddy). Cloudflare → aicex.club →
DNS → запись **A** `studio` → IP сервера, **Proxy status: DNS only** (серое
облако) — иначе Caddy не получит сертификат.

## 3. Установка

В консоли сервера (root):

```bash
curl -fsSL https://raw.githubusercontent.com/kleber2009-alt/ai-command-center/main/apps/persona-studio/deploy/bootstrap.sh \
  | bash -s -- studio.aicex.club
```

Пока изменения не влиты в `main`, добавьте ветку:
`curl -fsSL https://raw.githubusercontent.com/kleber2009-alt/ai-command-center/claude/persona-studio-status-pU6YD/apps/persona-studio/deploy/bootstrap.sh | BRANCH=claude/persona-studio-status-pU6YD bash -s -- studio.aicex.club`

Первая сборка — 5–10 минут. В конце: `✓ Persona Studio is live`.

## 4. Ключи

```bash
nano /opt/ai-command-center/apps/persona-studio/deploy/.env.prod   # вписать ключи
cd /opt/ai-command-center/apps/persona-studio/deploy
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

| Ключ | Для чего |
|---|---|
| `KIE_API_KEY` | аватары, обложки, видео OmniHuman, AI-картинки слайдов |
| `ANTHROPIC_API_KEY` | сценарии, карусели, модерация фото, ресёрч |
| `OPENAI_API_KEY` | запасной вариант для текстов; распознавание речи уже работает локально (контейнер `whisper`) |
| `ELEVENLABS_API_KEY` | клон голоса и озвучка |
| `EMAIL_SERVER_*` | письма со ссылкой входа (Resend/Brevo/Яндекс SMTP, порт 465) |
| `TELEGRAM_BOT_TOKEN`, `CRYPTOBOT_TOKEN` | оплата Stars / USDT, автопостинг в TG |
| `APIFY_TOKEN` | ресёрч вирусных рилсов |
| `HEYGEN_API_KEY`, `SUBMAGIC_API_KEY`, `POSTMYPOST_API_TOKEN`, `VOYAGE_API_KEY` | опционально |

Пока SMTP не заполнен, ссылка для входа пишется в лог:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs web | grep magic-link
```

## Обновление

Повторный запуск той же команды из шага 3 — подтянет код и перезапустит
контейнеры; данные (тома) и `.env.prod` сохраняются.

## Бэкап

```bash
cd /opt/ai-command-center/apps/persona-studio/deploy
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_dump -U persona -Fc persona_studio > ~/persona_$(date +%F).dump
```
Храните копии вне сервера (например, скачивайте к себе) — прошлый прод хранил
бэкапы на той же машине и потерял их вместе с ней.
