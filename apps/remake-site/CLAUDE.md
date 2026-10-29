# remake-site — CLAUDE.md

Сайт «Ремейк залёта» — `remake.aicex.club`. Две вкладки:

- **Прогоны** (видно всем) — как скилл `.claude/skills/remake-top-reel` превращает залетевший рилс @ilia.paliy в новый:
  отбор, расшифровка, сценарий «было/стало», проверка, аватар HeyGen, монтаж.
- **Студия** (вход по паролю, тратит кредиты) — то же руками на сайте: загрузил референс (файл до 700 МБ или ссылка) →
  расшифровка → сценарий как есть, поправленный или «Сценарий 2.0» от Claude по правилам скилла → образ и голос из
  своего HeyGen → монтаж скиллом Студии Кадрика → скачать рилс 1080×1920 (и аватара без монтажа).

- **Ветка «Instagram Reels»** в Telegram (`reels-bot.mjs`) — связка как у Threads: каждое утро ищет залёты у конкурентов
  (нет конкурентов — в своём аккаунте), уникализирует хук и сценарий и шлёт карточки в ветку; «✅ Одобрено» → HeyGen →
  монтаж Кадрика → готовое видео файлом в ветку.

## Файлы

- `index.html` — одна страница на два места. Это **тело** документа: в claude.ai его публикуют как артефакт
  (`https://claude.ai/artifact/TzpSjDViTsbwJqjJ8bmRtf`, только прогоны из базы артефакта, картинки — id хранилища),
  на сайте `deploy/build.sh` оборачивает его в полный документ: прогоны из `GET /api/runs` (опрос раз в 10 с, картинки —
  `media/<файл>`), студия — второй `<script>`, работает только с API сайта. Правишь страницу — правь здесь
  и переопубликуй артефакт с этого пути.
- `server.mjs` — API без зависимостей: `GET /api/health`, `GET /api/runs`, `PUT /api/runs/<slug>`,
  `PUT /api/media/<файл>` (запись — по `REMAKE_SITE_TOKEN`, без токена только чтение) и `/api/studio/*` → `studio.mjs`.
- `studio.mjs` — студия (маршруты — в шапке файла). Вход: `REMAKE_SITE_PASSWORD` (нет — `REMAKE_SITE_TOKEN`) → подписанная
  кука `rs_studio` на 30 дней; запросы с чужим `Origin` отклоняются. Ролик — `DATA_DIR/studio/<id>.json` + рабочая папка,
  файлы — `DATA_DIR/media/<id>-<key>-*` (имя не угадать, Caddy отдаёт по `/media`). Шаги идут в фоне, рендер HeyGen и монтаж
  Кадрика после перезапуска опрашиваются дальше. Старше `STUDIO_KEEP_DAYS` (45) ролики удаляются.
  - референс: файл телом `PUT …/source`, ссылка — `yt-dlp` (кука `DATA_DIR/cookies.txt`, если положить), для Instagram
    запасной Apify; кадр и длина — ffmpeg/ffprobe;
  - расшифровка: ElevenLabs Scribe v2 → v1, запасной OpenAI whisper-1; кодовое слово — `common.code_word` скилла;
  - сценарий 2.0: `@anthropic-ai/sdk`, `claude-opus-5-5`, adaptive thinking, effort high, structured output, server-side
    fallback (`fallbacks: "default"`); система — `references/script-rules.md` скилла + правила студии. После ответа —
    `check_script.py` скилла; не прошёл — один раунд правки с причинами. Проверка в студии — подсказка, рендер не блокирует;
  - аватар: HeyGen v3 (`/v3/avatars`, `/v3/avatars/looks`, `/v3/voices`, `/v3/users/me`, `POST /v3/videos` 9:16, 1080p или
    4K для Avatar III, `Idempotency-Key`), движок по умолчанию — `avatar.engine`/`engine_switch` из `config.json` скилла;
  - монтаж: Студия Кадрика, `POST {KADRIK_URL}/api/ext/jobs` (Bearer = `PERSONA_API_KEY` Кадрика) с публичной ссылкой на
    видео аватара, сценарием, кодовым словом и пожеланиями; результат — `GET …/result`. Стили — каталог Кадрика
    (`skills.json` Creator Pack + установленные `~/.claude/skills`, только видео 9:16), топ-3 из `config.json` скилла первыми.
- `reels-bot.mjs` — Telegram-ветка «Instagram Reels» поверх шагов студии (`studio.bot`: те же источник/расшифровка/сценарий/
  аватар/монтаж, слушатель шагов `on`). Свой бот `REMAKE_TG_BOT_TOKEN`, long polling (токен нигде больше не поллить).
  Поиск — Apify `instagram-scraper` по `REELS_COMPETITORS`/`/competitors add` (пусто → `instagram.username` скилла), сила =
  просмотры / медиана автора (как xn в Threads), не младше 2 дней, 12–120 с, взятые за `scan.reuse_after_days` — мимо;
  меньше 30 слов в расшифровке — не говорящая голова, берётся следующий. Карточка: залёт, разбор, хук «было → стало»,
  сценарий 2.0, проверка скилла, стиль (ротация из `config.json`). Кнопки ✅ / 🔄 Другой хук / 🎨 Стиль / 🗑, ответ
  текстом — переписать с пожеланием, ссылка на рилс в ветке — сразу в работу. Видео >49 МБ пережимается ffmpeg, не
  вышло — ссылка `media/…`. `/bind` в ветке — привязать её и переименовать в `REELS_TOPIC_NAME` (боту нужен админ с
  «Управлением темами»); кнопки жмут `REMAKE_TG_OWNER_IDS` или тот, кто первым сделал `/bind`. Состояние —
  `DATA_DIR/reels/state.json`, ролики ветки видны и в студии сайта. Поиск — раз в день в `REELS_HOUR` (`REELS_TZ`), `/scan` — сейчас.
- `Dockerfile` — образ API: node 22 + ffmpeg + python3 + свежий yt-dlp + `npm ci`; `skill/` кладёт `deploy/build.sh`
  (config.json, scripts/*.py, references/script-rules.md из скилла).
- Пишет прогоны скилл: `report.py <slug> --media ключ=файл … --push` (токен — окружение или профиль оболочки).
- `seed/` — стартовые прогоны и их файлы; при выкладке докладываются в данные только тем, чего там ещё нет.
  Новый стартовый прогон — `report.py <slug> --media … --export apps/remake-site/seed`.

## Выкладка

`.github/workflows/deploy-remake-site.yml` (пуш в `main`, в том числе правка `config.json`/скриптов/правил сценария скилла)
→ релиз в `/opt/remake-site/releases`, `deploy/server.sh`: сборка образа `aicex-remake-api:<релиз>` (не собрался — живой сайт
не трогается), контейнеры `aicex-remake-site` (Caddy: страница и `/media` с перемоткой) и `aicex-remake-api` в сети `edge`,
сайт `/opt/edge/sites/remake-site.caddy`. Ключи: `/opt/remake-site/api.env` пишет workflow из секретов (`REMAKE_*`, иначе
уже существующие `PERSONA_TRAIN_*`/`WORKER_*`/`HQ_OFFICE_*` — список в шапке workflow); `/opt/remake-site/kadrik.env` —
`server.sh` из `.env` Кадрика (`KADRIK_HOME`, по умолчанию `/home/iliapaliy`): `PERSONA_API_KEY`, адрес, ElevenLabs, если
своего нет. Каталог стилей Кадрика монтируется только на чтение. Кадрика деплой не меняет и не перезапускает.

## Локально

```bash
cd apps/remake-site && npm install && bash deploy/build.sh
REMAKE_SITE_PASSWORD=p REMAKE_SITE_TOKEN=t DATA_DIR=/tmp/rs SERVE_STATIC=dist node server.mjs   # → :8790
```

Ключи студии — те же переменные (`HEYGEN_API_KEY`, `ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY`, `KADRIK_URL`,
`KADRIK_API_KEY`, `KADRIK_PACK`, `KADRIK_SKILLS`, `PUBLIC_URL`); для заглушек — `HEYGEN_API_BASE`, `ELEVENLABS_API_BASE`,
`ANTHROPIC_BASE_URL`, `TELEGRAM_API_BASE`, `APIFY_API_BASE`. Нужны ffmpeg, python3 и yt-dlp в `PATH`.
