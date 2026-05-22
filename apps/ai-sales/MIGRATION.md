# 🚚 Migration Kit · полный переезд на новое устройство

**Дата:** 16 мая 2026
**Текущая позиция:** production-bot работает в Telegram (@ilia_pali0_bot), pipeline classify→generate с Claude, обучение через `/teach on`.

Этот файл — твой компас. Открой его первым на новом Mac.

---

## 📋 Что переезжает

```
ИСХОДНОЕ СОСТОЯНИЕ
──────────────────
1. Старый Mac · ~/ai-sales-system/         ← код, скрипты, прототипы
2. Старый Mac · ~/.claude/skills/...        ← design skill
3. Старый Mac · ~/.ssh/                     ← SSH-ключ для Hetzner
4. Старый Mac · pip/npm установки           ← venv, netlify-cli
5. Сервер Hetzner · ~/aisales-app-v2/       ← запущенный production
6. Cloud · ANTHROPIC_API_KEY                ← в console.anthropic.com
7. Cloud · TG_BOT_TOKEN                     ← у @BotFather
8. Cloud · Netlify auth                     ← если будешь обратно деплоить
9. Cloud · Notion knowledge base            ← привязан к твоему Notion
```

---

## ⚡ TL;DR (быстрый план)

```bash
# === НА СТАРОМ MAC (5 минут) ===
cd ~/ai-sales-system
bash scripts/migration_export.sh
# → создаёт ~/Downloads/ai-sales-MIGRATION-YYYYMMDD.zip и .secrets.txt

# Перекинь оба файла на новый Mac через AirDrop / iCloud / флешку

# === НА НОВОМ MAC (15-20 минут) ===
cd ~/Downloads
unzip ai-sales-MIGRATION-*.zip -d ~
cd ~/ai-sales-system
bash scripts/migration_import.sh
# → ставит зависимости, восстанавливает .env, проверяет SSH

# Готово — продолжай с того места где остановился
```

---

## 🔧 Шаг 0 — Что нужно установить на новом Mac

`migration_import.sh` сделает это автоматически, но для понимания:

| Что | Версия | Для чего |
|---|---|---|
| **Homebrew** | latest | пакеты macOS |
| **Python 3.12** | 3.12+ | venv для проекта |
| **Node.js** | 20+ | netlify-cli, если деплой |
| **netlify-cli** | latest | деплой дашборда |
| **Docker Desktop** | latest | опционально, для локального стека |
| **Claude Code** | latest | если используешь |

---

## 📦 Шаг 1 — На старом Mac · экспорт

Запусти один скрипт:

```bash
cd ~/ai-sales-system
bash scripts/migration_export.sh
```

Скрипт создаст:

1. **`~/Downloads/ai-sales-MIGRATION-YYYYMMDD.zip`** — весь код проекта, скрипты, прототипы, документация. Без `venv/`, без `.env`, без `audio/`. Размер ~500 KB.

2. **`~/Downloads/ai-sales-MIGRATION-SECRETS-YYYYMMDD.txt`** — список того что нужно перенести руками или из менеджера паролей:
   - Anthropic API key
   - TG bot token
   - Hetzner server credentials
   - Netlify deploy info
   - Notion workspace IDs

3. **`~/Downloads/ai-sales-MIGRATION-ssh-config-YYYYMMDD.txt`** — твой `~/.ssh/known_hosts` для Hetzner и подсказка по копированию приватного ключа.

Все три файла безопасны для AirDrop / iCloud / флешки (не содержат паролей).

**SSH-ключ** копируй отдельно — это самое чувствительное:
```bash
# На старом Mac
cat ~/.ssh/id_ed25519
# (или id_rsa — какой у тебя)
```
Скопируй вывод в безопасное место (1Password, защищённая заметка). На новом Mac положишь обратно в `~/.ssh/`.

---

## 🆕 Шаг 2 — На новом Mac · импорт

### 2.1 — Распаковка

```bash
cd ~/Downloads
unzip ai-sales-MIGRATION-*.zip -d ~
ls ~/ai-sales-system   # должна появиться вся структура
```

### 2.2 — Восстановить SSH-ключ

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Создай файл с твоим приватным ключом
nano ~/.ssh/id_ed25519
# (вставь содержимое из 1Password)

chmod 600 ~/.ssh/id_ed25519

# Скопируй known_hosts для Hetzner (опционально, чтобы не подтверждать fingerprint)
cat ai-sales-MIGRATION-ssh-config-*.txt >> ~/.ssh/known_hosts
```

### 2.3 — Автоматический setup

```bash
cd ~/ai-sales-system
bash scripts/migration_import.sh
```

Скрипт:
1. Проверит / установит Homebrew, Python 3.12, Node.js
2. Создаст `code/venv` и поставит зависимости
3. Установит netlify-cli глобально
4. Установит Claude Code (по желанию)
5. Запросит API ключи из MIGRATION-SECRETS.txt и создаст `code/.env`
6. Проверит SSH к Hetzner
7. Покажет следующие шаги

### 2.4 — Verify

```bash
# Тесты должны пройти
cd ~/ai-sales-system/code
source venv/bin/activate
make test
# → 46 passed

# SSH работает
ssh aisales@46.62.215.11 'docker ps --format "{{.Names}}: {{.Status}}"'
# → должен показать 5 контейнеров
```

---

## 🔑 Шаг 3 — Что НЕЛЬЗЯ потерять (secrets)

Эти штуки нужно перенести руками или иметь доступ через cloud:

| Что | Где взять | Что с этим делать |
|---|---|---|
| **ANTHROPIC_API_KEY** | console.anthropic.com → Settings → API Keys | подставить в `code/.env` на маке (для локальной разработки) |
| **TG_BOT_TOKEN** | у @BotFather в Telegram (вспомнит) | сейчас токен `8854052425:AAFcGl...` уже на сервере |
| **Hetzner SSH** | приватный ключ `~/.ssh/id_ed25519` | скопируй через 1Password / защищённую заметку |
| **Hetzner user password** | была в Notes (заметка о сервере) | используется только если SSH-ключ потерян |
| **Netlify auth** | заново `netlify login` через браузер | потребуется только если деплой нужен |
| **Notion API token** (если будем подключать) | `https://www.notion.so/my-integrations` | для Notion MCP |
| **ElevenLabs API key** (когда настроишь) | elevenlabs.io → Profile → API Keys | для голосовых ответов бота |

---

## 🎯 Шаг 4 — Продолжение работы

После migration_import.sh у тебя на новом Mac будет:

```
~/ai-sales-system/                  ← весь проект
~/ai-sales-system/code/venv/        ← Python окружение
~/ai-sales-system/code/.env         ← с твоими ключами
~/.ssh/id_ed25519                   ← SSH к серверу
```

Чтобы продолжить с **точки где остановились**:

```bash
# 1. SSH на сервер — проверь что бот живой
ssh aisales@46.62.215.11
bash ~/health_check.sh
# → должно быть зелёным

# 2. Локальный preview дашборда
cd ~/ai-sales-system
python3 -m http.server 8765
# → открой http://localhost:8765/06-dashboard-prototype/pulse.html

# 3. Прочитай где остановились
cat ~/ai-sales-system/AUTONOMOUS_LOG.md | head -100
# (последняя сессия — 5-я, production deploy + teaching mode)
```

---

## 📍 Текущее состояние проекта (16 мая 2026)

### Что работает прямо сейчас

- ✅ **Бот в Telegram** · @ilia_pali0_bot · отвечает реальным Claude
- ✅ **HTTPS** · api.46-62-215-11.nip.io (Caddy + Let's Encrypt)
- ✅ **Pipeline** · Sonnet 4.6 classify → Opus 4.7 generate
- ✅ **Prompt caching** · -90% на повторных вызовах
- ✅ **Teaching mode** · /teach on собирает твои голосовые
- ✅ **5 Docker контейнеров** на Hetzner
- ✅ **Себестоимость** · ~$0.025 за turn

### Что в работе

- ⏳ Заполнение промптов твоим голосом (через `/teach on` + voice_analyzer)
- ⏳ ElevenLabs voice clone для голосовых ответов
- ⏳ Knowledge base в Notion + RAG через Voyage-3 / Qdrant

### Что дальше (после переезда)

1. Накопить 5-10 голосовых через `/teach on` → автоматический analyzer
2. Зарегистрировать ElevenLabs → подключить voice answers
3. Подключить Instagram (1-3 дня модерация Meta)
4. Заполнить knowledge base в Notion

---

## 🆘 Если что-то пошло не так

**SSH не работает на новом Mac:**
```bash
ssh -v aisales@46.62.215.11    # покажет verbose debug
ls -la ~/.ssh/                  # проверь permissions: id_ed25519 = 600
```

**Python 3.12 не ставится через brew:**
```bash
brew install python@3.12
# Если конфликт с system Python:
brew link --force --overwrite python@3.12
```

**Тесты падают на новом Mac:**
```bash
cd ~/ai-sales-system/code
rm -rf venv
python3.12 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install pytest pytest-asyncio fastapi httpx anthropic eval_type_backport
make test
```

**Бот на сервере молчит:**
```bash
ssh aisales@46.62.215.11
docker logs aisales-api-v2 --tail 50
bash ~/health_check.sh
# Если нужно перезапустить:
docker restart aisales-api-v2
```

---

## 📚 Где что лежит — карта проекта

```
~/ai-sales-system/
│
├── MIGRATION.md                    ← ты сейчас тут
├── README.md                       ← начало знакомства с проектом
├── TODO.md                         ← задачи на завтра/потом
├── AUTONOMOUS_LOG.md               ← полный лог 5 ночных сессий
│
├── 01-portal/                      ← портал с 6 базовыми документами
├── 02-stage-instructions/          ← инструкции по этапам
├── 03-server-scripts/              ← скрипты на сервере (setup_fastapi)
├── 04-database/                    ← SQL миграции (001 + 003)
├── 05-docs/                        ← roadmap
├── 06-dashboard-prototype/         ← 12 HTML экранов дашборда
│
├── agent-prompts/                  ← 4 промпта (IG, TG, Analyst, РОП)
├── carousels/                      ← 3 шаблона + landing
├── reels/                          ← 2 сценария + landing
├── content-bank/                   ← idea-bank, hooks, captions
├── funnel-scripts/                 ← скрипты по этапам воронки
├── objections/                     ← 20 ответов на возражения
├── notion-templates/               ← шаблоны для 5 коллекций Notion
│
├── voice-input/                    ← голосовые для voice_analyzer
│   ├── audio/                      ← (пустая, заполняется через /teach on)
│   ├── transcripts/                ← .txt транскрипты
│   └── analysis/                   ← voice-profile.json
│
├── code/                           ← Python бэкенд
│   ├── main.py                     ← FastAPI entry
│   ├── agents/                     ← LangGraph DAG
│   ├── webhooks/                   ← IG + TG handlers
│   ├── services/                   ← media, wav2lip, tg, ig, storage
│   ├── api/                        ← REST endpoints
│   ├── db/                         ← SQLAlchemy models
│   ├── utils/                      ← voice_transcribe, voice_analyzer, carousel/reel/caption_generator
│   ├── tests/                      ← 46 тестов
│   ├── docker-compose.yml          ← локальный стек
│   ├── Dockerfile                  ← multi-stage build
│   ├── Makefile                    ← make dev / make test / make content
│   ├── DEPLOY.md                   ← деплой на сервер
│   ├── MEDIA_PIPELINE.md           ← как работает voice/circle
│   └── README_PIPELINE.md          ← контент-машина
│
├── scripts/                        ← ops скрипты
│   ├── test_conversations.py       ← прогон 10 диалогов через прод
│   ├── setup_tg_webhook.sh         ← регистрация TG webhook
│   ├── setup_ssl_nip_io.sh         ← HTTPS через Let's Encrypt
│   ├── health_check.sh             ← мониторинг
│   ├── migration_export.sh         ← упаковка для переезда
│   └── migration_import.sh         ← разворачивание на новом маке
│
├── assets/                         ← фронтенд (sidebar.js)
└── netlify.toml                    ← конфиг Netlify

~/.claude/skills/pro-web-design/    ← дизайн-скилл (для нового мака отдельно)
```
