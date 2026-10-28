# Академия «Свой ИИ-офис»

Кабинет ученика внутри 3D-офиса hq. Модули — комнаты, шаги — найм агентов с готовыми решениями AICEX (скиллы, артефакты, продукты, коннекторы, шаблоны). Из ответов ученика собирается его проект Claude: `CLAUDE.md`, `context/`, `agents/`, `regulations/`, `skills/`.

- Сайт: `apps/hq/academy.html` → https://hq.aicex.club/academy. Прогресс в браузере, проверка заданий без ИИ, архив проекта скачивается браузером.
- Артефакт claude.ai: тот же кабинет с ИИ-проверкой, облачным сохранением и наставником.

## Сборка

```bash
python3 build.py                        # → ../academy.html, dist/artifact.html, dist/test.html
python3 build.py --artifact <path>      # артефакт — в свой файл
node src/validate.js src/content-a.js   # проверка шагов по схеме из SPEC.md
```

## Тесты (Playwright + Chromium)

```bash
node test/flow.js dist/test.html test/shots   # онбординг → 0.1 → 0.2 → 1.1, файлы проекта, архив
node test/demo.js dist/test.html test/shots   # пример «офис AICEX на середине трека», телефон
```

## Деплой

Вместе с hq: `cd apps/hq && npx wrangler deploy` (нужны `CLOUDFLARE_API_TOKEN` с правом Workers Scripts: Edit и `CLOUDFLARE_ACCOUNT_ID`). Папка `academy-src` в ассеты не попадает (`.assetsignore`).

## Где что

| Файл | Что внутри |
|---|---|
| `src/content-a.js`, `src/content-b.js` | 26 шагов: вопросы, помощь «Не знаю», готовые решения, задание, регламент, босс |
| `src/academy-data.js` | модули, ранги, опыт, значки, инструкции «куда нажать» |
| `src/acad-*.js`, `src/academy.css` | логика и вид кабинета |
| `src/office-academy.js` | 3D-слой: замки комнат, голограммы мест, Проводник, найм |
| `SPEC.md`, `AGENTS-REAL.md` | схема шага и реальные агенты AICEX — источник готовых решений |
