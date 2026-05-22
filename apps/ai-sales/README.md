# 🚀 AI Sales System — Бэкап проекта

**Дата бэкапа:** 14 мая 2026  
**Статус проекта:** Этап 2 (инфраструктура) полностью завершён, Этап 3 (база знаний) начат

---

## Что это

Мульти-агентная система продаж для Instagram + Telegram. Заменяет менеджера по продажам на 4 AI-агента:

- **IG-Менеджер** (Claude Opus 4.7) — общается в Instagram Direct
- **TG-Менеджер** (Claude Opus 4.7) — общается в Telegram, может отправлять кружочки через Wav2Lip
- **Аналитик** (Claude Sonnet 4.6) — оценивает диалоги, скоринг 0-100, рекомендации
- **РОП** (Claude Opus 4.7) — управляет, шлёт дайджесты, ставит задачи

Все четыре говорят голосом владельца (ElevenLabs PVC) и читают единую базу знаний через RAG.

---

## Текущий прогресс

```
Этап 1: Фундамент              ✅ ВЫПОЛНЕНО
Этап 2: Инфраструктура         ✅ ВЫПОЛНЕНО (2.5 SSL отложен)
Этап 3: База знаний            🔄 В РАБОТЕ (структура создана)
Этап 4: Дашборд (Next.js)      ⏳ Ожидает
Этап 5: Каналы (IG + TG)       ⏳ Ожидает
Этап 6: Голос (ElevenLabs)     ⏳ Ожидает
Этап 7: Запуск агентов         ⏳ Ожидает
Этап 8: Юридический запуск     ⏳ Ожидает
```

---

## Доступы и инфраструктура

### Сервер
- **Провайдер:** Hetzner Cloud (Германия, Nuremberg)
- **IP:** `<SERVER_IP>` (хранится локально)
- **Тариф:** CPX31 (4 vCPU, 8 GB RAM, 160 GB NVMe SSD) — ~13.49€/мес
- **ОС:** Ubuntu 24.04 LTS
- **SSH:** `ssh aisales@<SERVER_IP>` (вход по ключу, пароль отключён)
- **Пользователь:** `aisales` с правами sudo, root отключён
- **Защита:** UFW (открыты 22, 80, 443), fail2ban активен

### Запущенные сервисы (Docker)
1. **PostgreSQL 16** — основная БД, 8 таблиц, порт 5432 (127.0.0.1)
2. **Redis 7** — кеш и очереди, порт 6379 (127.0.0.1)
3. **Qdrant** — векторная БД для RAG, порт 6333-6334 (127.0.0.1)
4. **MinIO** — хранилище медиа, bucket `aisales-media`, порты 9000-9001 (127.0.0.1)
5. **FastAPI backend** — `aisales-api`, порт 8000 (127.0.0.1)

### Доступ к Swagger UI (документация API)
```bash
# На маке открыть туннель:
ssh -L 8000:localhost:8000 aisales@<SERVER_IP>

# Затем в браузере:
# http://localhost:8000/docs
```

### Учётные данные
- **Email админа дашборда:** `<ADMIN_EMAIL>` (хранится локально)
- **Пароль:** хранится в Notes на маке (НЕ в этом архиве)
- **4 пароля БД (Postgres, Redis, Qdrant, MinIO):** хранятся в `.env` на сервере + в Notes

### Бэкапы PostgreSQL
- Автоматически каждую ночь в 3:00 (cron)
- Хранятся в `~/aisales/backups/`
- Сжатие gzip, ротация 30 дней
- Ручной запуск: `~/aisales/backup.sh`

---

## База знаний в Notion

**Главная страница:** https://www.notion.so/3604924397e18173ad41fb2904d24590

**5 коллекций созданы:**
1. 🎭 Голос и тон — https://www.notion.so/32c5a2285cf34f2d9558ddfc953058c6
2. 🛒 Продукты — https://www.notion.so/be0939e113f54707a47d1ae4ce4a064b
3. 🎯 Сегменты — https://www.notion.so/9f3497a8dce948c7a093adfa719dec5a
4. 🛡️ Возражения и ответы — https://www.notion.so/c10ffd767e02456caccc2b4ca47c33af
5. 📚 Контент-память — https://www.notion.so/01946f92a8bd4d649cf38634e72a8ffe

Статус: структура готова, наполнение MVP — следующий шаг.

---

## Структура архива

```
01-portal/                  Главный портал проекта (HTML, читается в браузере)
  ├── ai-sales-portal.html      ← открой это, единая точка входа со всеми документами
  ├── doc-01-constitution.html      Конституция проекта: KPI, ICP, воронка, эскалации
  ├── doc-02-voice-collection.html  План сбора голоса (текст, аудио, видео)
  ├── doc-03-legal-package.html     Юридический пакет: 152-ФЗ, GDPR, AI Act
  └── doc-04-knowledge-base.html    Архитектура базы знаний и RAG

02-stage-instructions/      Пошаговые инструкции для каждого подэтапа Этапа 2
  ├── stage-2-1-vps.html        Покупка и настройка VPS
  ├── stage-2-2-docker.html     Docker и 4 базы данных
  ├── stage-2-3-database.html   Схема БД и миграции
  └── stage-2-4-fastapi.html    FastAPI backend, JWT, Swagger

03-server-scripts/          Скрипты, запускаемые на сервере
  └── setup_fastapi.sh          Создаёт всю структуру FastAPI-приложения

04-database/                SQL для PostgreSQL
  ├── 001_initial_schema.sql    Создание 8 таблиц, индексов, триггеров
  └── 002_seed_test_data.sql    Тестовый клиент Анна для проверки

05-docs/                    Высокоуровневые документы
  └── 00-roadmap.html           Дорожная карта всего проекта (8 этапов)
```

---

## Как пользоваться этим архивом

### Если нужно вспомнить общую картину
→ Открой `01-portal/ai-sales-portal.html` — это главная точка входа со всеми 6 базовыми документами в одном месте.

### Если нужно повторить какой-то технический шаг
→ Открой соответствующий файл в `02-stage-instructions/`.

### Если потерял сервер и нужно поднять с нуля
→ Последовательно выполни:
1. Создай новый VPS (Hetzner CPX31, Ubuntu 24.04) — см. `stage-2-1-vps.html`
2. Настрой Docker и 4 сервиса — см. `stage-2-2-docker.html`
3. Применить SQL: `docker exec -i aisales-postgres psql -U aisales -d aisales < 04-database/001_initial_schema.sql`
4. Запустить FastAPI: `bash 03-server-scripts/setup_fastapi.sh` + `docker compose build api && docker compose up -d api`

### Если бэкап БД восстановить
→ На сервере: `gunzip -c ~/aisales/backups/postgres_YYYYMMDD_HHMMSS.sql.gz | docker exec -i aisales-postgres psql -U aisales -d aisales`

---

## Полезные команды на сервере

Все команды из папки `~/aisales`:

```bash
# Статус всех контейнеров
docker compose ps

# Перезапустить всё
docker compose restart

# Логи API в реальном времени
docker compose logs -f api

# Логи последние 50 строк
docker compose logs api --tail=50

# Зайти в PostgreSQL
docker exec -it aisales-postgres psql -U aisales -d aisales

# Сделать бэкап вручную
~/aisales/backup.sh

# Посмотреть размер дисков
df -h /

# Использование ресурсов контейнерами
docker stats --no-stream
```

---

## Технологический стек

- **Backend:** Python 3.12, FastAPI 0.115, SQLAlchemy 2.0, Pydantic 2.9
- **Auth:** JWT (python-jose), bcrypt
- **Базы данных:** PostgreSQL 16, Redis 7, Qdrant, MinIO
- **AI:** Claude Opus 4.7 (диалоги), Claude Sonnet 4.6 (аналитика), Claude Haiku 4.5 (резерв)
- **Embeddings:** Voyage-3 (планируется)
- **Голос:** ElevenLabs PVC (планируется)
- **Видео-кружочки:** Wav2Lip (планируется)
- **Каналы:** Instagram Graph API, Telegram Bot API (aiogram)
- **Контейнеризация:** Docker, docker-compose
- **Дашборд:** Next.js + Tailwind + shadcn/ui (планируется)

---

## Ключевые принципы проекта

1. **Дизайн-система AI Mastery Platform** — единый стиль для всех интерфейсов:
   - Фон `#080808`, текст `#f5f0e8`
   - Акценты `#c8f060` (lime), `#60c8f0` (cyan), `#f06090` (pink)
   - Шрифты: Georgia (заголовки/проза) + JetBrains Mono (код/labels)
   - 2px gaps, 10-11px ALL CAPS labels, outline-style decorative numbers

2. **Воронка 7 этапов:** hello → discovery → pitch → objections → close → followup → closed_won/closed_lost

3. **Скоринг клиентов:** 0-100, сегменты A/B/C/unknown

4. **Эскалация к человеку** — обязательна в кейсах: жалоба, угроза, упоминание давления, особый случай

---

## Контакты и связь

Этот проект ведётся совместно с Claude. Если что-то непонятно или нужен новый этап работы — начни разговор с Claude, прикрепи этот README, и продолжим с того места, где остановились.

**Текущая позиция в дорожной карте:** только что закрыли Этап 2.4 (FastAPI), создали 5 коллекций в Notion (Этап 3.1). Следующий шаг — Этап 3.5 (наполнение базы знаний реальным содержанием через интервью).
