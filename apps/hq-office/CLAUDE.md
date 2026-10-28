# hq-office — CLAUDE.md

Живой офис агентов, вторая версия `hq.aicex.club` → `hq2.aicex.club`. Статика без сборки. Подробности — `README.md`.

- `index.html` — классические скрипты данных (`office.config.js`, `dept-content.js`,
  `agent-content.js` — копии с hq.aicex.club, `tasks.js` — история задач), затем
  `window.OFFICE_DATA` (тип экрана и цепочки передач агентов для визуализации), затем модуль.
- Модуль по разделам: планировка → рендер (GTAO + bloom) → текстуры/материалы →
  навигация (A* по сетке 0,2 м) → здание и мебель → риги и позы → класс `Agent`
  (план действий walk/do/work/call) → экраны на canvas → история задач и досье →
  камера/экскурсия → цикл.
- **Правая панель показывает только реальные задачи из `tasks.js`** — у каждой дата
  и ссылка-доказательство (PR/коммиты на GitHub, артефакт Claude, сайт, файл). Не добавлять
  туда выдуманные задачи; симуляция в 3D — только визуализация.
- Неподвижная мебель сливается по материалам (`mergeStatic`); всё изменяемое помечено
  `userData.keep = true`.
- Выкладка: `.github/workflows/deploy-hq-office.yml` → релиз в `/opt/hq-office/releases`, `deploy/server.sh`
  переключает `current`, контейнер `aicex-hq-office` в сети `edge`, сайт `/opt/edge/sites/hq-office.caddy`.
- Проверка без GPU: `?debug&noao` + `__hq.step(секунды)`.
