# 🐍 Python код · скелет агентского пайплайна

**Версия:** v0.1 · 15 мая 2026
**Назначение:** работающий каркас агентов на LangGraph + FastAPI, готовый к интеграции

Это **скелет** — реальные API-ключи и подключения к Postgres/Qdrant/Redis выставлены через env. Код запускается локально на маке через `docker compose` или через `python -m uvicorn`, при подстановке ENV запускается на сервере.

---

## Структура

```
code/
├── agents/
│   ├── __init__.py
│   ├── flow.py              ← LangGraph DAG для одного входящего сообщения
│   ├── nodes.py             ← узлы графа (classify, rag, generate, escalate)
│   ├── state.py             ← TypedDict состояния агента
│   └── prompts_loader.py    ← загрузка системных промптов из agent-prompts/
├── webhooks/
│   ├── __init__.py
│   ├── instagram.py         ← обработчик IG webhook от Meta
│   ├── telegram.py          ← обработчик TG через aiogram
│   └── shared.py            ← общая логика: верификация подписи, очередь
└── utils/
    ├── whisper_to_srt.py    ← Whisper API → SRT-файл для Submagic/Captions
    ├── voice_consistency.py ← embedding-similarity к эталону голоса
    └── escalation_alert.py  ← пинг Ильи в TG при эскалации
```

## Установка локально

```bash
cd code
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Заполнить ANTHROPIC_API_KEY, QDRANT_URL, REDIS_URL, POSTGRES_URL и т.д.
```

## Что готово

- ✅ LangGraph скелет flow (5 узлов, conditional routing)
- ✅ Webhook handlers IG + TG (структура, верификация подписи)
- ✅ Whisper → SRT для генерации субтитров под видео
- ✅ Voice consistency через эмбеддинги
- ✅ Escalation alert хендлер

## Что НЕ работает (нужны ключи)

- ⏳ Реальные вызовы Anthropic API (нужен `ANTHROPIC_API_KEY`)
- ⏳ Подключение к Qdrant (нужен `QDRANT_URL` + наполнение)
- ⏳ ElevenLabs PVC (нужен `ELEVENLABS_API_KEY`)
- ⏳ Реальные IG/TG токены

Без них код запускается в **mock-режиме** — на каждый вызов возвращает заглушку с правильной структурой.

---

## Как запустить mock-тест

```bash
python -m agents.flow --mock --message "Привет, расскажи про автоматизацию SMM"
```

Покажет полный путь сообщения по графу: classify → rag → generate → return.
