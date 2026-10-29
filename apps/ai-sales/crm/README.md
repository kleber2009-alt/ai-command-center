# AI Sales CRM

Новый интерфейс CRM для AI Sales System. Заменяет `06-dashboard-prototype`. Стиль взят с marketing.aicex.club: шрифт Manrope, розово-лавандовый градиент, стеклянные карточки, фиолетово-розовый акцент.

Это статика без сборки: `index.html` + `assets/`.

| Файл | Что внутри |
|---|---|
| `assets/app.css` | Вся дизайн-система: токены на `:root`, карточки, таблицы, канбан, чат |
| `assets/data.js` | Демо-данные (`window.CRM_DATA`), перенесены из старого прототипа |
| `assets/app.js` | Роутер на `#/…` и экраны: пульс, входящие, диалоги, воронка, агенты, отчёты, база знаний, настройки |
| `deploy/server.sh` | Активация релиза на сервере `*.aicex.club` |

Чтобы посмотреть локально, запусти `python3 -m http.server` в этой папке и открой `http://localhost:8000/#/pulse`.

Деплой — `.github/workflows/deploy-aisales-crm.yml`, домен `crm.aicex.club` (переменная `AISALES_CRM_DOMAIN`). Раньше crm.aicex.club был описан в общем `/opt/edge/sites/aicex.caddy`. `server.sh` вырезает оттуда ровно этот блок (копия файла сохраняется в `/opt/aisales-crm/`) и пишет свой `/opt/edge/sites/aisales-crm.caddy`. В нём `/api/*` и `/webhooks/*` по-прежнему ведут на `aicex-sales-api`, а старые пути `/06-dashboard-prototype/`, `/01-portal/` — на старую статику. Если домен описан как-то иначе, скрипт останавливается и ничего не трогает. Если Caddy не принимает новый конфиг, оба файла возвращаются как были.

Следующий шаг: заменить `data.js` живыми данными. Диалоги и клиенты будут приходить из ChatPlace через `apps/ig-agent` (синхронизация `chats_list` и `chats_messages`). Разметку при этом менять не нужно: экраны читают только `window.CRM_DATA`.
