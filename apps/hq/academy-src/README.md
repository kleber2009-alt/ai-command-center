# Академия «Свой ИИ-офис»

Кабинет ученика внутри 3D-офиса hq. Модули — комнаты, шаги — найм агентов с готовыми решениями AICEX (скиллы, артефакты, продукты, коннекторы, шаблоны). Из ответов ученика собирается его проект Claude: `CLAUDE.md`, `context/`, `agents/`, `regulations/`, `skills/`.

- Сайт: `apps/hq/academy.html` → https://hq.aicex.club/academy. Прогресс в браузере, проверка заданий без ИИ, архив проекта скачивается браузером.
- Прогресс переносится файлом: «Перенести» в треке → скачать на одном устройстве, загрузить на другом или в claude.ai.
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
node test/skills-visual.js dist/test.html test/shots  # карточки скиллов и окно кода ученика
node test/needs-visual.js dist/test.html test/shots   # «Что понадобится»: приветствие, модуль, телефон
node test/transfer.js dist/test.html test/shots       # перенос прогресса файлом в чистый браузер
node test/goal.js dist/test.html test/shots           # цель на входе, блок «Твоя цель», смена цели
node test/week.js dist/test.html test/shots           # «Сегодня» и «Неделя офиса» по регламентам агентов
```

## Деплой

Вместе с hq: `cd apps/hq && npx wrangler deploy` (нужны `CLOUDFLARE_API_TOKEN` с правом Workers Scripts: Edit и `CLOUDFLARE_ACCOUNT_ID`). Папка `academy-src` и `worker.js` в ассеты не попадают (`.assetsignore`).

## Скиллы AICEX для учеников

Архивы скиллов в git не лежат: репозиторий публичный. Перед деплоем их собирают из папки со скиллами:

```bash
python3 tools/pack_skills.py <папка со скиллами>   # → ../academy-files/skills/*.zip, личные данные в примерах заменены
```

Без архивов `wrangler deploy` остановится (`tools/check_files.py`), чтобы не стереть скиллы с сайта.

Архив отдаётся только по коду ученика `имя-XXXXXX`: `../worker.js` стоит перед `/academy-files/*` и сверяет код с секретом. Без кода — страница «Нужен код ученика».

- Секрет: `npx wrangler secret put ACADEMY_SECRET` или Cloudflare → Workers & Pages → hq-aicex → Settings → Variables and Secrets → Add (Secret). В репозиторий не класть.
- Выдать коды: https://hq.aicex.club/academy-codes (секрет + имена → коды, считается в браузере) или `ACADEMY_SECRET=… python3 tools/codes.py Анна "Борис Петров"`.
- Отозвать код: имя из кода (`anna`) в переменную `ACADEMY_REVOKED`, через запятую.
- Новый секрет отзывает все коды сразу.

## Где что

| Файл | Что внутри |
|---|---|
| `src/content-a.js`, `src/content-b.js` | 26 шагов: вопросы, помощь «Не знаю», готовые решения, задание, регламент, босс |
| `src/academy-data.js` | модули, ранги, опыт, значки, инструкции «куда нажать» |
| `src/acad-*.js`, `src/academy.css` | логика и вид кабинета |
| `src/office-academy.js` | 3D-слой: замки комнат, голограммы мест, Проводник, найм |
| `SPEC.md`, `AGENTS-REAL.md` | схема шага и реальные агенты AICEX — источник готовых решений |
| `tools/` | архивы скиллов (`pack_skills.py`), коды учеников (`codes.py`), проверка перед деплоем |
| `../worker.js`, `../academy-codes.html` | выдача скиллов по коду, генератор кодов |
