# Деплой ai-office-project на свой VPS

Самодостаточный Node.js-сервер на замену Netlify. Раздаёт всю статику и
проксирует `/api/chat`, `/api/notify-tg`, `/api/voice-clone`,
`/api/voice-generate`, `/api/voice-list` к функциям из
`netlify/functions/*.js` без переписывания их кода.

Поддерживаются три варианта запуска:

1. **Docker / docker-compose** — рекомендую, минимум возни.
2. **systemd + Node 20** — если не хочешь Docker.
3. **+ Nginx сверху** — опционально, для gzip/rate-limit/TLS.

---

## 0. Что должно быть на сервере

- Ubuntu 22.04+ / Debian 12+ / любой современный Linux.
- Открытый 80-й порт во внешний firewall (если используешь UFW —
  `sudo ufw allow 80/tcp`).
- Если идёшь через Docker: `docker` + плагин `docker compose`.
- Если идёшь через systemd: `nodejs >= 20` (`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`).

Все секреты подставляются через `.env` — смотри `.env.example`. Без них
сервер всё равно стартует, просто соответствующие `/api/*` ответят 503.

---

## Вариант A — Docker (рекомендую)

```bash
# 1. Залить код на сервер (любым способом).
git clone https://github.com/kleber2009-alt/ai-command-center.git
cd ai-command-center/ai-office-project

# 2. Подготовить .env.
cp .env.example .env
$EDITOR .env   # вставь ANTHROPIC_API_KEY и т.д.

# 3. Поднять.
docker compose up -d --build

# 4. Проверить.
curl -fsS http://127.0.0.1/healthz
docker compose logs -f --tail=50
```

После этого сайт открывается по `http://<IP-сервера>/`.

### Обновление

```bash
git pull
docker compose up -d --build
```

### Остановка / удаление

```bash
docker compose down            # stop + remove container, образ остаётся
docker compose down --rmi all  # удалить и образ
```

---

## Вариант B — systemd, без Docker

```bash
# 1. Залить код в /opt (или куда удобнее).
sudo git clone https://github.com/kleber2009-alt/ai-command-center.git /opt/ai-command-center
sudo mv /opt/ai-command-center/ai-office-project /opt/ai-office-project
sudo rm -rf /opt/ai-command-center   # остальной next.js проект тут не нужен

# 2. Создать сервисного пользователя.
sudo useradd -r -s /bin/false aioffice
sudo chown -R aioffice:aioffice /opt/ai-office-project

# 3. .env с секретами.
sudo cp /opt/ai-office-project/.env.example /opt/ai-office-project/.env
sudo $EDITOR /opt/ai-office-project/.env
sudo chown aioffice:aioffice /opt/ai-office-project/.env
sudo chmod 600 /opt/ai-office-project/.env

# 4. Поставить unit.
sudo cp /opt/ai-office-project/deploy/ai-office.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ai-office

# 5. Проверить.
systemctl status ai-office
journalctl -u ai-office -f
curl -fsS http://127.0.0.1:8080/healthz
```

> По умолчанию unit слушает `8080`. Чтобы выставить наружу 80-й порт
> без root-прав, либо поставь Nginx сверху (Вариант C), либо дай Node
> capability `cap_net_bind_service`:
> ```bash
> sudo setcap 'cap_net_bind_service=+ep' $(readlink -f $(which node))
> sudo systemctl edit ai-office   # измени Environment=PORT=80
> sudo systemctl restart ai-office
> ```

### Обновление

```bash
cd /opt/ai-office-project
sudo -u aioffice git pull        # если /opt — git-репо
sudo systemctl restart ai-office
```

---

## Вариант C — Nginx сверху (опционально)

Имеет смысл если ты хочешь gzip, rate-limit, или планируешь повесить
TLS на домен.

```bash
sudo apt install -y nginx
sudo cp /opt/ai-office-project/deploy/nginx.conf /etc/nginx/sites-available/ai-office
sudo ln -sf /etc/nginx/sites-available/ai-office /etc/nginx/sites-enabled/ai-office
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Если используешь Docker, поменяй маппинг в `docker-compose.yml` с
`"80:8080"` на `"127.0.0.1:8080:8080"` чтобы контейнер слушал только
loopback, а наружу торчал только Nginx.

Когда появится домен — наверни TLS:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.ru -d www.your-domain.ru
```
Certbot сам пропишет SSL и редирект 80 → 443.

---

## Структура

```
ai-office-project/
├── server/
│   ├── index.js          ← Node http-сервер (статика + /api/* адаптер)
│   └── package.json      ← type:module, node >= 20
├── netlify/functions/*   ← оригинальные функции, не трогаем
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example
└── deploy/
    ├── ai-office.service ← systemd unit
    └── nginx.conf        ← reverse proxy
```

`server/index.js` оборачивает Node `IncomingMessage` в Web `Request`,
вызывает дефолтный экспорт функции из `netlify/functions/*.js`, и пишет
Web `Response` обратно в `ServerResponse`. Сами функции, кэш-правила и
clean-URL ребазы из `netlify.toml` / `_redirects` перенесены 1:1.

---

## Что проверить после первого запуска

| URL | Ожидаемый ответ |
|---|---|
| `http://<IP>/` | главная (index.html) |
| `http://<IP>/about` | страница "О проекте" (rewrite на about.html) |
| `http://<IP>/app` | mini-app/index.html (Telegram Mini App) |
| `http://<IP>/healthz` | `{"ok":true,"ts":...}` |
| `http://<IP>/api/chat` (POST с JSON) | 200 + поток / 503 если нет ключа |
| `http://<IP>/blog/ai-vs-hire` | статья из blog/ |
| `http://<IP>/nonexistent` | 404.html |

Если что-то не открывается — `docker compose logs -f` или
`journalctl -u ai-office -f` покажет полный лог запросов.

---

## Откат на Netlify

Никаких изменений в существующих файлах не было — `netlify.toml`,
`_redirects` и `netlify/functions/*` остались как были. Чтобы вернуться
на Netlify, просто перетащи `ai-office-deploy.zip` в Netlify Drop или
снова подключи репо.
