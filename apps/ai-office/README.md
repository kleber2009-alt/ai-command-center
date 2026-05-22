# AI Growth Office

> Виртуальная команда из 169 AI-агентов под бизнес.
> Эксперты / онлайн-школы / агентства / стартапы с выручкой 200K–5M ₽/мес.

**Стадия:** MVP-фронтенд + админка готовы (16.05.2026), бэкенд в работе.
**Статика без build-step.** Чистый HTML + JS + CSS, разворачивается на Netlify за 30 секунд.

---

## 📖 Главное

- **`HANDOFF.md`** — полный документ для переезда на новое устройство / возобновления работы
- **Notion:** `📦 Handoff · Полный статус проекта · 16.05.2026` (поиск в твоём workspace)
- **Live-сайт:** `https://spiffy-selkie-ec834f.netlify.app/` (после переезда — `https://ai-growth-office.ru`)

---

## 🚀 Быстрый старт

### Локальный preview
```bash
python3 -m http.server 8000
# → http://localhost:8000
```

### Деплой на Netlify (Drop)
```
1. https://app.netlify.com/drop
2. Перетащить ai-office-deploy.zip
3. Готово
```

### Деплой на Netlify (GitHub)
```bash
git init
git add .
git commit -m "initial"
git remote add origin git@github.com:USERNAME/ai-office.git
git push -u origin main
# Затем: Netlify → New site from Git → выбрать репо
# Settings → Environment Variables → ANTHROPIC_API_KEY = sk-ant-...
```

---

## 🗂 Структура проекта

```
ai-office-project/
├── HANDOFF.md                 ← полное описание (обязательно прочитать)
├── README.md                  ← этот файл
│
├── *.html                     ← 39 публичных страниц
├── netlify/functions/chat.js  ← Anthropic API proxy
├── netlify.toml + _redirects  ← конфигурация Netlify
│
├── state.js                   ← центральный менеджер localStorage
├── analytics.js               ← трекер событий (под GA4/Yandex)
├── alisa-widget.js            ← плавающий чат-консьерж
├── sidebar.js                 ← единое меню
├── sw.js + sw-register.js     ← Service Worker (PWA)
├── api-fallback.js            ← диагностика /api/chat
├── cookies.js                 ← cookie consent
│
├── agents.json                ← 169 AI-агентов
├── lead-magnet.pdf            ← готовый PDF 14 страниц
│
├── manifest.json + icon-*.png ← PWA-манифест
├── og-image.{jpg,png,svg}     ← Open Graph
├── robots.txt + sitemap.xml   ← SEO
│
└── ai-office-deploy.zip       ← готовый для Netlify Drop
```

---

## 🎯 Ключевые страницы

| URL | Что это |
|---|---|
| `/` | Главная с живым демо |
| `/whats-new` | Showcase всех функций |
| `/how-it-works` | 5 шагов customer journey |
| `/onboarding` | Бриф 10 шагов |
| `/dashboard` | Личный AI-офис |
| `/pricing` | Тарифы |
| `/roi` | Калькулятор экономии |
| `/compare` | AI vs найм/фриланс/курсы |
| `/cases` | 5 кейсов |
| `/glossary` | 25 AI-терминов |
| `/about` | О проекте |
| `/partners` | Партнёрская программа 30% |
| `/leads-inbox` | Админ-инбокс всех лидов |
| `/dev-tools` | Диагностика, API-тест, mock-данные |

---

## ⚙️ Технологии

- **LLM:** Anthropic Claude Sonnet 4.5 (через Netlify Function)
- **Hosting:** Netlify
- **Storage:** localStorage (→ Supabase в Фазе 1)
- **PWA:** Service Worker + Manifest
- **No build:** чистый HTML/JS/CSS, никаких npm/webpack

---

## 📋 Следующие шаги (TOP 5)

См. `HANDOFF.md` — раздел «Следующие приоритеты».

1. Купить домен `ai-growth-office.ru`
2. Подключить Supabase Auth + БД
3. Подключить YooKassa
4. Создать Telegram-бот для уведомлений
5. Поставить GA4 счётчик

---

## 💬 Контакты

- Telegram: @ilia_paliy
- Email: ilia.info.paliy@gmail.com
- Notion: workspace «AI Growth Office»
