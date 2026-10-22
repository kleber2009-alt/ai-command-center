# Сквозная аналитика (funnel-analytics)

Одностраничный дашборд для онлайн-школы с вебинарной воронкой:
**декомпозиция × кабинет Meta × файл оплат с UTM**. Сборщик на Python (только stdlib)
собирает один самодостаточный `index.html`. Период, курс и фильтры пересчитываются в браузере,
а сервер не нужен: файл можно открыть локально, выложить на Netlify или отдать через Caddy.

Что на странице:

- **Школа за период**: KPI-плитки (бюджет, CPR против цели, доходимость, CAC, средний чек, ROMI).
- **Сквозная воронка**: клики → регистрации → зрители → заявки → предоплаты → оплаты.
- **Динамика по вебинарным окнам**: включаемые кривые, календарь выбора периода с тепловой заливкой.
- **Помесячно**: сортируемая таблица.
- **Сверка с кабинетом**: бюджет, клики, Lead против регистраций, CPL, Purchase. Ловит пиксель, который
  двоит события, отсутствие Purchase и расход вне декомпозиции.
- **Рекламный слой**: дерево «кампании → группы → объявления» с оплатами, привязанными по UTM,
  ссылки на объявление в Ads Manager, фильтр по лендингу.
- **Лендинги, источники, хуки, плейсменты, страны**: ROMI по реальному расходу, если кабинет его отдаёт, иначе модельный (по CAC).
- **Юнит-экономика и прибыль**: расходы из `config.json`, а незаполненные месяцы подсвечиваются.
- **Что делать**: список действий, который генерируется из найденных проблем.

Вкладки (показываются только те, для которых есть данные):

- **Воронка и реклама** — всё перечисленное выше.
- **Доходы и расходы** — из ежемесячных листов «Расходы <Месяц> [ГГ]» финансовой таблицы (`finance.py`):
  выручка план/факт и % выполнения, выручка по каналам (ГК, Lava, доп. выручка) с детализацией,
  расходы по категориям и статьям (план/факт/отклонение/статус), доли партнёров, прибыль и маржа по месяцам,
  перерасходы, расходы вне плана, невыплаченные начисления и расхождения с итогами самой таблицы.
- **Контент** — публикации с наибольшим числом входов (комментарии с кодовым словом) и «× нормы»,
  медианы по аккаунтам, рилс против каруселей, механики хуков, структура карусели, калькулятор
  «сколько публикаций нужно на цель» со сравнением с ценой регистрации из рекламы.

## Быстрый старт

```bash
cd apps/funnel-analytics
python3 build.py                 # демо на вымышленных данных из sample/
open dist/index.html
```

`python3 make_sample.py` перегенерирует демо-данные.

## Свои данные

Создайте папку (например `~/school/`) с файлами ниже и запустите:

```bash
python3 build.py --data ~/school --out dist/school.html
```

| Файл | Откуда | Колонки |
|---|---|---|
| `decomposition.csv` | лист декомпозиции, одна строка на вебинарное окно | `date_from,date_to,label,spend_usd,impressions,clicks,registrations,viewers,applications,prepayments,sales,revenue_rub,revenue_fact_rub` |
| `payments.csv` | выгрузка оплат (GetCourse / Prodamus / таблица) | `date,amount_rub,utm_source,utm_medium,utm_campaign,utm_term,utm_content,country` (дата может быть пустой) |
| `meta_ads.csv` | `meta_api.py` или экспорт Ads Manager на уровне объявлений | `campaign_id,campaign_name,campaign_status,adset_id,adset_name,ad_id,ad_name,landing_url,spend,impressions,clicks,leads,lpv` |
| `meta_daily.csv` | `meta_api.py` или экспорт по дням | `date,spend,impressions,clicks,leads,lpv,purchases` |
| `meta_breakdowns.csv` | `meta_api.py`, необязательно | `dim,key,spend` (`dim` = `placement` или `country`) |
| `config.json` | вручную, образец в `sample/config.json` | см. ниже |

Даты принимаются в форматах `2026-07-01` и `01.07.2026`, числа допускаются с пробелами и запятой.

### Финансовая таблица (вкладка «Доходы и расходы»)

```bash
python3 finance.py --sheet "https://docs.google.com/spreadsheets/d/<id>/edit" --config ~/school/config.json --out ~/school/finance.json
# или: --xlsx ~/Downloads/book.xlsx   (Файл → Скачать → .xlsx)
```

`--sheet` работает, если у таблицы включён доступ «всем, у кого есть ссылка», или задан `GOOGLE_ACCESS_TOKEN`
(OAuth-токен с `drive.readonly`). Из нескольких версий одного месяца берётся «Пересчитанные», затем «Оформленные».
Листы без года получают `finance.base_year` из config, исключения задаются в `finance.month_overrides`
(`{"Расходы декабрь": "2024-12"}`).

### Контент (вкладка «Контент»)

`import_content_plan.py <папка с index.html, hooks.json, ready.json> content.json content.json <ссылка>` переносит все вкладки контент-плана (готовые карусели и рилс, лид-магниты, инструкцию, базу хуков, мои хуки, сценарии VSL, расчёт, показ актива) во вкладку «Контент» как подвкладки.

`content.json`: `{"own": "<ваш аккаунт>", "pubs": [{"acc","url","ins","xn","date","fmt","hook"}], "accounts": [{"acc","lang","posts","median","max"}], "mechanics": [...], "slides": [...]}` — формат в `sample/content.json`.

### Внешние страницы отдельными вкладками

`"embeds": [{"title": "Realism AI", "url": "https://realism-ai-dashboard.netlify.app/", "note": "Пример"}]` в config.json:
`update.py` при каждом обновлении сохраняет свежую копию страницы в `data/embeds/` (если не скачалась — остаётся прошлая),
вкладка показывает её в изолированном iframe (sandbox, без доступа к дашборду) со ссылкой на оригинал.
`"replace": {"Realism AI": "Aicex AI"}` в записи embeds меняет текст в копии (например, название) при каждой сборке.

### Кабинет Meta по API

```bash
export META_TOKEN=...            # токен системного пользователя с ads_read
python3 build.py --data ~/school --fetch --since 2026-07-01 --until 2026-09-30
```

`--fetch` вызывает `meta_api.py`, который перезаписывает три `meta_*.csv` в папке данных.
ID кабинета берётся из `config.json` (`ad_account_id`) или из `META_AD_ACCOUNT`.

### Как оплата привязывается к объявлению

Оплата привязывается к объявлению по `utm_content` (ID или имя объявления). Если не получилось,
то к группе по `utm_term`, затем к кампании по `utm_campaign`. Плейсмент берётся из `utm_medium`.
Для 90%+ атрибуции поставьте в «Параметры URL» на уровне объявления:

```
utm_source=facebook&utm_medium={{placement}}&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}
```

Метки нужно донести до кассы: передать в форму регистрации и дальше в заказ.

### config.json

```jsonc
{
  "title": "Онлайн-школа",            // заголовок страницы
  "fx": 92,                            // курс ₽/$ по умолчанию (меняется на странице)
  "target_cpr": 1.5,                   // целевая цена регистрации, $
  "ad_account_id": "act_123",          // для ссылок в Ads Manager и --fetch
  "landings": {"Основной": "school.ru/webinar"},   // имя лендинга -> подстрока URL
  "sources": {"facebook": "Meta (размечено)"},      // utm_source -> подпись в «Источниках»
  "hook_regex": "^(.*?) #",            // необязательно: как вытащить хук из имени объявления
  "costs": {                           // расходы для P&L
    "Команда таргета": {"2026-07": 30000, "2026-08": null},  // null = «не заполнено»
    "Отдел продаж": {"rate": 0.08}                           // доля от выручки
  }
}
```

## Деплой

Результат — статический HTML. Его можно положить в `landings/<client>/` или раздавать через Caddy
(`file_server`). Для ежедневного обновления подойдёт cron на прод-боксе:
`python3 build.py --data /path --fetch --since … --until … --out /var/www/…/index.html`.


## Прод: dashboard.aicex.club

Дашборд живёт на своём сервере и обновляется сам: `deploy/setup-server.sh` (под root) ставит код в
`/opt/ai-command-center`, кладёт данные в `/opt/funnel-analytics-data` (0700), включает cron каждые 3 часа
(`/usr/local/bin/funnel-analytics-update`: git pull → расшифровка данных контента → `update.py`) и подключает
сайт в Caddy или nginx (бэкап конфига, проверка, при ошибке откат). Лог: `/var/log/funnel-analytics.log`.
Ключи API (Meta, GetCourse) — в `/etc/funnel-analytics.env`. Сайт открыт без пароля, `noindex`.
Данные вкладки «Контент» лежат в репо зашифрованными (`private/content.json.gz.enc`).

DNS: зона `aicex.club` в Cloudflare — запись `A dashboard → <IP сервера>`, режим «DNS only».
