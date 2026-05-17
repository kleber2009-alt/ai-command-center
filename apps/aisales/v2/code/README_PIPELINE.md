# 🤖 Контент-машина · END-TO-END

**Версия:** v1.0 · 16 мая 2026
**Что:** работающий конвейер от подкастов до готовых каруселей/Reels/подписей.

---

## 📊 Полный pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  voice-input/audio/*.mp3      ←  ты кладёшь подкасты                     │
│         │                                                                │
│         ▼  python -m utils.voice_transcribe                              │
│  voice-input/transcripts/*.txt + *.srt + *.json                          │
│         │                                                                │
│         ▼  python -m utils.voice_analyzer                                │
│  voice-input/analysis/voice-profile.json                                 │
│  voice-input/analysis/voice-profile-report.html      ←  визуальный отчёт│
│  voice-input/analysis/01-ig-manager.AUTO-FILLED.md   ←  готовый промпт  │
│         │                                                                │
│         ├──→  Notion · 🎭 Голос и тон (через MCP)                       │
│         └──→  Qdrant (через voyage эмбеддинги)                          │
│         │                                                                │
│         ▼  python content_pipeline.py --idea "..."                       │
│  ┌─────────────┬────────────┬─────────────┐                              │
│  │  Carousel   │   Reel     │   Caption   │                              │
│  │  Generator  │ Generator  │  Generator  │                              │
│  └─────────────┴────────────┴─────────────┘                              │
│         │           │             │                                      │
│         ▼           ▼             ▼                                      │
│  /carousels/    /reels/      /content-bank/                              │
│   generated/    generated/    generated-captions/                        │
│   *.html        *.html        *.json                                     │
│   *.json        *.srt ◄─ для Submagic                                    │
│                 *.json                                                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Быстрый старт

### 0. Setup (один раз)
```bash
cd ~/ai-sales-system/code
source venv/bin/activate

# Опционально для боевого режима:
export ANTHROPIC_API_KEY=sk-ant-...
```

### 1. Транскрипция подкастов
```bash
# Положи аудио в voice-input/audio/
python -m utils.voice_transcribe
```

### 2. Анализ голоса
```bash
# Mock (для теста)
python -m utils.voice_analyzer --mock

# Боевой (нужен ключ)
python -m utils.voice_analyzer
```

→ Выход: `voice-input/analysis/voice-profile.json`

### 3. Генерация контента

**Одна идея, все форматы:**
```bash
python content_pipeline.py \
    --idea "Как агентство EdTech освободило 18 часов в неделю" \
    --formats carousel,reel,caption \
    --segment A --mock
```

**Batch 5 идей из bank'a:**
```bash
python content_pipeline.py --from-bank 5 --formats carousel --mock
```

**Только Reel + SRT для Submagic:**
```bash
python -m utils.reel_generator \
    --topic "5 ошибок в директе" \
    --template tutorial --duration 75 --mock
# → reels/generated/...html + .json + .srt
```

---

## 🛠️ Команды по модулям

### Voice analyzer
```bash
# Все транскрипты
python -m utils.voice_analyzer [--mock]

# Один файл
python -m utils.voice_analyzer --file podcast-01.txt

# Без автозаполнения промпта
python -m utils.voice_analyzer --no-autofill
```

### Carousel generator
```bash
python -m utils.carousel_generator \
    --topic "..." \
    --template {pain-solution|case-study|n-mistakes} \
    --segment {A|B|C|all} \
    [--mock]
```

### Reel generator
```bash
python -m utils.reel_generator \
    --topic "..." \
    --template {hook-reveal|tutorial|case-talking-head} \
    --segment A --duration 60 \
    [--mock]
```

### Caption generator
```bash
python -m utils.caption_generator \
    --topic "..." \
    --content-type {carousel|reel|post|story} \
    --segment A [--mock]
```

### Pipeline orchestrator
```bash
python content_pipeline.py \
    --idea "..." | --from-bank N \
    --formats carousel,reel,caption \
    --segment A [--mock]
```

---

## 💰 Стоимость (примерно)

| Операция | Модель | Tokens | Cost |
|---|---|---|---|
| Voice analyzer | Sonnet 4.6 | 40K in / 4K out | ~$0.18 |
| Carousel | Opus 4.7 | 3K in / 2K out | ~$0.20 |
| Reel | Opus 4.7 | 2K in / 2K out | ~$0.18 |
| Caption | Sonnet 4.6 | 1K in / 800 out | ~$0.02 |

**Полный batch (carousel + reel + caption) на одну идею:** ~$0.40
**10 идей в день:** ~$4 → $120/мес → дешевле одной чашки кофе в Старбакс

---

## 🔗 Связь с дашбордом

Сгенерированный контент автоматически отображается на:
- **Calendar** (`/calendar`) — в очереди публикаций
- **Carousels** (`/carousels/index.html`) — в галерее
- **Reels** (`/reels/index.html`) — в галерее
- **Inbox** (`/inbox`) — нотификации о новых генерациях

Pipeline-log пишется в `content-bank/pipeline-log.jsonl`, читается дашбордом.

---

## 🐛 Troubleshooting

**ANTHROPIC_API_KEY не установлен** → запусти с `--mock` или экспортируй ключ.

**Транскриптов нет** → положи аудио в `voice-input/audio/`, запусти `python -m utils.voice_transcribe`.

**Voice profile generic** → нужно больше материала. 1-2 эпизода подкаста = хорошо, 5+ = отлично.

**JSON parse error из Claude** → редко, обычно из-за triple-backtick. Перезапусти.

---

## 📂 Структура

```
code/
├── content_pipeline.py            ← orchestrator
└── utils/
    ├── voice_transcribe.py        ← whisper
    ├── voice_analyzer.py          ← голос → JSON
    ├── carousel_generator.py      ← карусели
    ├── reel_generator.py          ← Reels
    ├── caption_generator.py       ← подписи
    └── whisper_to_srt.py          ← SRT для существующих видео
```

---

**Готово. С ANTHROPIC_API_KEY всё работает в production-режиме.**
