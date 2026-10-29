# remake-site — CLAUDE.md

Сайт «Ремейк залёта» — `remake.aicex.club`: как скилл `.claude/skills/remake-top-reel` превращает залетевший рилс
@ilia.paliy в новый — отбор, расшифровка, сценарий «было/стало», проверка, аватар HeyGen, монтаж. Статика + маленький API.

- `index.html` — одна страница на два места. Это **тело** документа: в claude.ai его публикуют как артефакт
  (`https://claude.ai/artifact/TzpSjDViTsbwJqjJ8bmRtf`, данные из базы артефакта, картинки — id хранилища),
  на сайте `deploy/build.sh` оборачивает его в полный документ, а данные приходят из `GET /api/runs` (опрос раз в 10 с,
  картинки — `media/<файл>`). Правишь страницу — правь здесь и переопубликуй артефакт с этого пути.
- `server.mjs` — API без зависимостей: `GET /api/health`, `GET /api/runs`, `PUT /api/runs/<slug>`,
  `PUT /api/media/<файл>` (запись — по `REMAKE_SITE_TOKEN`, без токена только чтение). Данные — `DATA_DIR`
  (`runs/`, `media/`, `state.json`), деплой их не трогает.
- Пишет туда скилл: `report.py <slug> --media ключ=файл … --push` (токен — окружение или профиль оболочки).
- `seed/` — стартовые прогоны и их файлы; при выкладке докладываются в данные только тем, чего там ещё нет.
  Новый стартовый прогон — `report.py <slug> --media … --export apps/remake-site/seed`.
- Выкладка: `.github/workflows/deploy-remake-site.yml` (пуш в `main`) → релиз в `/opt/remake-site/releases`,
  `deploy/server.sh`: контейнеры `aicex-remake-site` (Caddy: страница и `/media` с перемоткой) и `aicex-remake-api`
  (node) в сети `edge`, сайт `/opt/edge/sites/remake-site.caddy`. Секрет `REMAKE_SITE_TOKEN`, переменная
  `REMAKE_SITE_DOMAIN` (по умолчанию `remake.aicex.club`).
- Локально: `bash deploy/build.sh && REMAKE_SITE_TOKEN=t DATA_DIR=/tmp/rs SERVE_STATIC=dist node server.mjs` → `:8790`.
