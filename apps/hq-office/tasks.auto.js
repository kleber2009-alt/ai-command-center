/* История задач, которая пополняется сама (sync/sync.mjs, workflow hq-office-history):
   новые PR на GitHub — после каждого слияния и раз в сутки — и ссылки из формы «Run workflow».
   Сайт показывает эти задачи вместе с tasks.js. Править можно прямо здесь: синк не трогает
   готовые задачи, только дописывает к ним новые PR той же ветки. Удалённая задача не вернётся —
   её PR остаются в seen. Чтобы задача стала «ручной», перенесите её в tasks.js. */
window.OFFICE_TASKS_AUTO = {
  "since": "2026-11-04T03:27:25Z",
  "seen": [148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213],
  "tasks": [
    {
      "id": "gh-209",
      "date": "2026-11-04",
      "dateNote": "слияние PR на GitHub",
      "kind": "Разработка",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product"],
      "title": "Живой офис агентов: в стиле «Волна» отделы переехали в стеклянные комнаты",
      "summary": "Этаж в стиле «Волна» стал больше и разделён на семь стеклянных комнат отделов с дверями и табличками: руководитель, число агентов и задачи. Клик по табличке наводит камеру на комнату, экскурсия идёт по комнатам.",
      "proof": [
        { "kind": "github", "label": "PR #209 · «Волна» — отделы в стеклянных комнатах на большем этаже", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/209" },
        { "kind": "github", "label": "PR #211 · «Волна» — пол больше не мерцает полосами при зуме", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/211" },
        { "kind": "github", "label": "PR #212 · «Волна» — диспетчерская в центре офиса", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/212" },
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/modest-gauss-yoq1n7",
      "prs": [209, 211, 212],
      "auto": true
    },
    {
      "id": "gh-210",
      "date": "2026-11-04",
      "dateNote": "слияние PR на GitHub",
      "kind": "Продукт",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product", "qa", "skills"],
      "title": "Живой офис агентов: затраты задач, уроки агентов, конвейеры и контролёр качества",
      "summary": "Видно время и стоимость каждой задачи и затраты по агентам за месяц; агенты учатся на правках владельца; конвейеры «Рилс под ключ» и «Оффер → лендинг»; новый контролёр качества и подключение ChatPlace, Meta Ads и HeyGen.",
      "proof": [
        {
          "kind": "github",
          "label": "PR #210 · затраты, уроки агентов, конвейеры, контролёр качества, системы исполнителя (MCP)",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/210"
        },
        {
          "kind": "github",
          "label": "PR #213 · исполнитель — свой User-Agent для MCP (ChatPlace отвечал 403)",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/213"
        },
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/upbeat-noether-pru5m5",
      "prs": [210, 213],
      "auto": true
    },
    {
      "id": "gh-196",
      "date": "2026-11-03",
      "dateNote": "слияние PR на GitHub",
      "kind": "Разработка",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product"],
      "title": "Живой офис агентов: в окне задачи можно раскрыть все файлы результата",
      "summary": "Раньше в окне задачи было видно только первые 40 файлов результата, а ссылка «ещё N» не работала. Теперь кнопка раскрывает весь список, и он не сворачивается при обновлении задачи.",
      "proof": [
        { "kind": "github", "label": "PR #196 · кнопка «ещё N» раскрывает все файлы результата задачи", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/196" },
        { "kind": "github", "label": "PR #197 · правки к задаче голосом", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/197" },
        { "kind": "github", "label": "PR #199 · голосовые правки — надёжнее запись и понятнее ошибки", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/199" },
        { "kind": "github", "label": "PR #202 · материалы к правкам и ответам на рабочем столе", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/202" },
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/epic-clarke-vovfst",
      "prs": [196, 197, 199, 202],
      "auto": true
    },
    {
      "id": "gh-198",
      "date": "2026-11-03",
      "dateNote": "слияние PR на GitHub",
      "kind": "Разработка",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product"],
      "title": "Живой офис агентов: перед монтажом, рилсами и каруселями агенты спрашивают стиль",
      "summary": "Задача на видео, рилс или карусель уходит агенту только после выбора стиля — кнопкой из готовых стилей монтажа и каруселей, своим текстом или «Выбери сам». Если стиль уже назван в задаче, вопроса нет.",
      "proof": [
        { "kind": "github", "label": "PR #198 · спрашивать стиль перед монтажом, рилсами и каруселями", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/198" },
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/nifty-thompson-10xg3c",
      "prs": [198],
      "auto": true
    },
    {
      "id": "gh-200",
      "date": "2026-11-03",
      "dateNote": "слияние PR на GitHub",
      "kind": "Продукт",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product", "skills"],
      "title": "Живой офис агентов: Транскрибатор, утренняя статистика соцсетей и контроль балансов",
      "summary": "Три новых агента: расшифровывают ролик по ссылке и передают текст нужному агенту, каждое утро разбирают цифры соцсетей за вчера с тремя шагами на день и проверяют балансы сервисов с предупреждением в Telegram.",
      "proof": [
        {
          "kind": "github",
          "label": "PR #200 · агенты Транскрибатор, Статистика соцсетей, Балансы и подписки",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/200"
        },
        { "kind": "github", "label": "PR #201 · yt-dlp для Транскрибатора и Telegram утренних агентов", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/201" },
        { "kind": "github", "label": "PR #203 · у каждого проекта, скилла и артефакта — свой агент и стол", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/203" },
        {
          "kind": "github",
          "label": "PR #204 · вход владельца на любом устройстве и мобильная версия как приложение",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/204"
        },
        {
          "kind": "github",
          "label": "PR #205 · новый дизайн рабочего стола — маршрут задачи, источник, структурированный…",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/205"
        },
        {
          "kind": "github",
          "label": "PR #206 · выдача результата — отчёт документом, материалы в просмотрщике",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/206"
        },
        {
          "kind": "github",
          "label": "PR #208 · переговорная легенд — 8 ИИ-советников по методам легенд бизнеса",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/208"
        },
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/bold-mccarthy-l4xavb",
      "prs": [200, 201, 203, 204, 205, 206, 208],
      "auto": true
    },
    {
      "id": "gh-207",
      "date": "2026-11-03",
      "dateNote": "слияние PR на GitHub",
      "kind": "Разработка",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["transcriber", "product"],
      "title": "Транскрибатор: надёжная расшифровка рилсов из Instagram, даже если в видео нет звука",
      "summary": "Транскрибатор теперь скачивает именно звуковую дорожку ролика, а если звука нет — пробует запасной источник и честно сообщает «в ролике нет звуковой дорожки» вместо сбоя задачи.",
      "proof": [
        { "kind": "github", "label": "PR #207 · Транскрибатор: качать звуковую дорожку, а не mp4 без звука", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/207" }
      ],
      "group": "repo|claude/blissful-bardeen-20g9xs",
      "prs": [207],
      "auto": true
    },
    {
      "id": "gh-185",
      "date": "2026-11-02",
      "dateNote": "слияние PR на GitHub",
      "kind": "Продукт",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product", "skills"],
      "title": "Живой офис агентов: «Двойник» — цифровой двойник Ильи с голосом, камерой и чатом",
      "summary": "Новая страница «Двойник» в офисе: разговор голосом и текстом, вкладки «Что знает» и «План развития». Гостям доступно демо «утро с двойником», владелец общается вживую. Подготовлены 10 концептов окна диалога.",
      "proof": [
        {
          "kind": "github",
          "label": "PR #185 · «Двойник» — цифровой двойник Ильи и Claude + 10 концептов окна",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/185"
        },
        { "kind": "github", "label": "PR #186 · концепт окна двойника «Нано-кольцо» в духе jarvis.ceo", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/186" },
        { "kind": "github", "label": "PR #187 · двойник вживую во всех 11 дизайнах, разговор без кнопки", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/187" },
        { "kind": "github", "label": "PR #188 · голосовой разговор с двойником на телефоне", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/188" },
        { "kind": "github", "label": "PR #189 · кнопка «Двойник» ведёт на живой разговор", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/189" },
        { "kind": "github", "label": "PR #190 · двойник запоминает Илью и слышит на телефоне потоком", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/190" },
        {
          "kind": "github",
          "label": "PR #191 · двойник знает весь бизнес Ильи — база знаний и свои материалы",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/191"
        },
        { "kind": "github", "label": "PR #192 · двойник — полный Claude и пульт Claude Code", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/192" },
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/zealous-maxwell-rr7sde",
      "prs": [185, 186, 187, 188, 189, 190, 191, 192],
      "auto": true
    },
    {
      "id": "gh-193",
      "date": "2026-11-02",
      "dateNote": "слияние PR на GitHub",
      "kind": "Дизайн",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product", "skills"],
      "title": "Живой офис агентов: пять «живых» дизайнов ИИ-двойника и скилл 3D-взрыв-схем",
      "summary": "У двойника появились пять новых образов «ИИ как живой организм»: клетка, грибница, колония, растущий узор и анатомическая схема. Они дышат, реагируют на курсор и голос. Плюс скилл для 3D-взрыв-схем в стиле техмануала.",
      "proof": [
        { "kind": "github", "label": "PR #193 · Двойник: 5 «живых» дизайнов (13–17) + скилл взрыв-схем", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/193" },
        {
          "kind": "github",
          "label": "PR #194 · Двойник: 8 дизайнов с лицом (18–25) — робот, пришелец, аура, голограмма",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/194"
        },
        { "kind": "github", "label": "PR #195 · Офис: голограмма двойника по кнопке в центре офиса", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/195" },
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/stoic-bardeen-wtkgfv",
      "prs": [193, 194, 195],
      "auto": true
    },
    {
      "id": "gh-180",
      "date": "2026-10-30",
      "dateNote": "слияние PR на GitHub",
      "kind": "Сайт",
      "dept": "marketing",
      "people": ["ilia"],
      "agents": ["landings"],
      "title": "Лендинг практикума: 5 версий страницы с ИИ-офисом и его маркетинговой командой",
      "summary": "В оффер практикума добавлен ИИ-офис: пять дизайнов страницы на practicum1–5.aicex.club с реальными работами агентов с hq2, регистрацией через форму Tilda, таймером до эфира и роликами. Выкладка на сервер автоматическая.",
      "proof": [
        { "kind": "github", "label": "PR #180 · Практикум: 5 версий с ИИ-офисом на practicum1–5.aicex.club", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/180" }
      ],
      "group": "landings|claude/sweet-thompson-rb1h0f",
      "prs": [180],
      "auto": true
    },
    {
      "id": "gh-181",
      "date": "2026-10-30",
      "dateNote": "слияние PR на GitHub",
      "kind": "Разработка",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product"],
      "title": "Живой офис агентов: диагностика сбоев исполнителя задач в один клик",
      "summary": "Когда задача на рабочем столе hq2 обрывается, причину теперь видно без доступа к серверу: статус и перезапуски исполнителя, память, журналы последних задач. Проверка только читает данные и прячет ключи доступа.",
      "proof": [
        { "kind": "github", "label": "PR #181 · кнопка диагностики исполнителя рабочего стола", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/181" },
        { "kind": "github", "label": "PR #183 · исполнитель переживает нехватку памяти и называет причину", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/183" },
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/intelligent-carson-quqf2c",
      "prs": [181, 183],
      "auto": true
    },
    {
      "id": "gh-182",
      "date": "2026-10-30",
      "dateNote": "слияние PR на GitHub",
      "kind": "Сайт",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product"],
      "title": "Живой офис агентов: аккуратная вёрстка и концепт изометрического офиса в 6 стилях",
      "summary": "Интерфейс hq2 не обрезается и не уезжает на любых экранах, включая телефон. Появилась страница-концепт: изометрический офис с комнатами отделов, где агенты передают работу по цепочкам и проигрывают реальные задачи. Шесть вариантов оформления.",
      "proof": [
        {
          "kind": "github",
          "label": "PR #182 · вёрстка не плывёт + концепт изометрического офиса (6 вариантов)",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/182"
        },
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/dreamy-albattani-ibx651",
      "prs": [182],
      "auto": true
    },
    {
      "id": "gh-184",
      "date": "2026-10-30",
      "dateNote": "слияние PR на GitHub",
      "kind": "Продукт",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product"],
      "title": "Живой офис агентов: второй стиль «Ночной Сити» с комнатами отделов",
      "summary": "На hq2 появился переключатель стилей: привычная «Волна» и ночное здание с комнатами отделов. Агенты ходят по тем же маршрутам, камера, экскурсия и доска задач работают, выбор стиля запоминается.",
      "proof": [
        { "kind": "github", "label": "PR #184 · второй стиль офиса «Ночной Сити» по концепту v1", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/184" },
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/relaxed-maxwell-9febvl",
      "prs": [184],
      "auto": true
    },
    {
      "id": "gh-148",
      "date": "2026-10-29",
      "dateNote": "слияние PR на GitHub",
      "kind": "Разработка",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product", "skills"],
      "title": "Живой офис агентов: история задач пополняется сама из GitHub и по ссылке",
      "summary": "Новые работы попадают в историю офиса автоматически после каждого обновления: Claude пишет понятные тексты, а задачу можно добавить одной ссылкой. Черновые описания переписываются сами, когда Claude становится доступен.",
      "proof": [
        { "kind": "github", "label": "PR #148 · история задач пополняется сама из GitHub и по ссылке", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/148" },
        { "kind": "github", "label": "PR #149 · в журнале синка видно, кто писал тексты задач", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/149" },
        {
          "kind": "github",
          "label": "PR #150 · тексты задач без Claude перепишутся сами, когда появится ключ",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/150"
        },
        {
          "kind": "github",
          "label": "PR #152 · история пишет тексты только своим ключом HQ_OFFICE_ANTHROPIC_API_KEY",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/152"
        },
        { "kind": "github", "label": "PR #157 · рабочий стол — задачи агентам прямо в офисе", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/157" },
        {
          "kind": "github",
          "label": "PR #158 · исполнитель проверяет Claude Code и показывает причину ошибки",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/158"
        },
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/affectionate-keller-qy05o4",
      "prs": [148, 149, 150, 152, 157, 158],
      "auto": true
    },
    {
      "id": "gh-156",
      "date": "2026-10-29",
      "dateNote": "слияние PR на GitHub",
      "kind": "Воронка",
      "dept": "marketing",
      "people": ["ilia"],
      "agents": ["threads", "funnels", "product"],
      "title": "Threads Growth: воронка из Threads в Telegram — 3 ветки в день с одобрением в боте",
      "summary": "Каждое утро агент готовит 3 ветки со ссылками на 44 бесплатных материала канала и присылает их на одобрение в Telegram. Удачные ветки возвращаются с новым хуком, по понедельникам приходит отчёт. В офисе появился агент «Threads-ветки».",
      "proof": [
        {
          "kind": "github",
          "label": "PR #156 · Воронка Threads → Telegram на каталоге материалов + агент «Threads-ветки» в…",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/156"
        },
        { "kind": "github", "label": "PR #164 · ветки от пользы канала, автопубликация, прогноз виральности", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/164" }
      ],
      "group": "threads-growth|claude/optimistic-newton-qysfiz",
      "prs": [156, 164],
      "auto": true
    },
    {
      "id": "gh-159",
      "date": "2026-10-29",
      "dateNote": "слияние PR на GitHub",
      "kind": "Продукт",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product", "montage"],
      "title": "Студия Кадрика: оплата картой, защищённый монтаж, ежедневный бэкап и мониторинг",
      "summary": "Бот монтажа принимает оплату картой с чеком по 54-ФЗ, задачи клиентов выполняются в изолированной песочнице без доступа к чужим данным, данные копируются каждый день, а работа бота проверяется каждые 30 минут.",
      "proof": [
        {
          "kind": "github",
          "label": "PR #159 · Студия Кадрика в монорепо + песочница, оплата картой, бэкап, мониторинг",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/159"
        },
        {
          "kind": "github",
          "label": "PR #161 · правка с сервера (сигнал о потере входа Claude) + режим деплоя fetch",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/161"
        },
        { "kind": "github", "label": "PR #162 · включение продаж переменной GitHub STUDIO_KADRIK_SELL", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/162" }
      ],
      "group": "studio-kadrik|claude/laughing-einstein-l7bumr",
      "prs": [159, 161, 162],
      "auto": true
    },
    {
      "id": "gh-160",
      "date": "2026-10-29",
      "dateNote": "слияние PR на GitHub",
      "kind": "Продукт",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["skills", "product", "avatar"],
      "title": "«Ремейк залёта»: скилл переснимает залетевшие рилсы цифровым двойником и сайт прогонов",
      "summary": "Скилл находит залетевшие рилсы с кодовым словом, усиливает сценарий с тем же словом, озвучивает его двойником HeyGen с голосом Ильи и монтирует в стиле Кадрика. На remake.aicex.club видно каждый прогон.",
      "proof": [
        { "kind": "github", "label": "PR #160 · «Ремейк залёта»: скилл + сайт remake.aicex.club", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/160" },
        {
          "kind": "github",
          "label": "PR #163 · Студия на remake.aicex.club: референс → расшифровка → сценарий → аватар HeyGen…",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/163"
        }
      ],
      "group": "remake-site|claude/dazzling-fermat-0inx8a",
      "prs": [160, 163],
      "auto": true
    },
    {
      "id": "gh-165",
      "date": "2026-10-29",
      "dateNote": "слияние PR на GitHub",
      "kind": "Разработка",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product", "specs"],
      "title": "Command Center: все 39 проектов, домены и боты на одной карте в дашборде",
      "summary": "Реестр всех проектов AICEX с архитектурой и ссылками на сайты, ботов, админки и код сам заливается в дашборд projects.aicex.club после каждого обновления. Добавлена схема серверов, доменов и связок.",
      "proof": [
        { "kind": "github", "label": "PR #165 · реестр всех проектов, карта архитектуры и синк в дашборд", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/165" },
        { "kind": "github", "label": "PR #167 · искать адрес дашборда по конфигу Caddy", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/167" }
      ],
      "group": "command-center|claude/great-goodall-2m5iae",
      "prs": [165, 167],
      "auto": true
    },
    {
      "id": "gh-168",
      "date": "2026-10-29",
      "dateNote": "слияние PR на GitHub",
      "kind": "Продукт",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product", "scripts", "avatar"],
      "title": "Remake: ветка «Instagram Reels» в Telegram — от залёта конкурента до готового рилса",
      "summary": "Каждое утро бот находит залетевшие рилсы конкурентов, пишет сценарий с новым хуком и шлёт карточку в Telegram. После «Одобрено» HeyGen-аватар и монтаж собирают ролик, готовый рилс приходит файлом.",
      "proof": [
        { "kind": "github", "label": "PR #168 · ветка «Instagram Reels» в Telegram — залёты → карточка с…", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/168" }
      ],
      "group": "remake-site|claude/focused-goodall-fhjxeu",
      "prs": [168],
      "auto": true
    },
    {
      "id": "gh-169",
      "date": "2026-10-29",
      "dateNote": "слияние PR на GitHub",
      "kind": "Разработка",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product"],
      "title": "Студия Кадрик: автоматическая очистка сервера от старых монтажей",
      "summary": "Сервер сам удаляет монтажи старше 2 дней, кэши и старые релизы раз в 2 дня, а при необходимости — вручную. Работы в процессе и служебные данные не трогаются, монтаж не встаёт из-за нехватки места.",
      "proof": [
        { "kind": "github", "label": "PR #169 · очистка диска сервера — раз в 2 дня и вручную", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/169" },
        { "kind": "github", "label": "PR #170 · очистка — показать или удалить остальное в ~/Movies", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/170" },
        { "kind": "github", "label": "PR #171 · очистка не падает на пустой папке в ~/Movies", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/171" },
        { "kind": "github", "label": "PR #174 · очистка удаляет и старые задачи соседних ботов в ~/Movies", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/174" }
      ],
      "group": "studio-kadrik|claude/friendly-tesla-4dcftg",
      "prs": [169, 170, 171, 174],
      "auto": true
    },
    {
      "id": "gh-172",
      "date": "2026-10-29",
      "dateNote": "слияние PR на GitHub",
      "kind": "Продукт",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product", "skills"],
      "title": "Студия Кадрик: 48 стилей Creator Pack теперь внутри, старый бот выведен",
      "summary": "Каталог из 48 стилей Creator Pack с обложками переехал в Кадрик, а отдельный бот @Productionskill_bot безопасно отключён с бэкапом и проверкой. Всё производство контента — в одном боте вместо двух.",
      "proof": [
        { "kind": "github", "label": "PR #172 · перенять стили @Productionskill_bot и вывести этот бот", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/172" },
        {
          "kind": "github",
          "label": "PR #175 · retire-скрипт находит папку задач старого бота и ждёт пустой очереди Кадрика",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/175"
        }
      ],
      "group": "studio-kadrik|claude/focused-mayer-43bdk9",
      "prs": [172, 175],
      "auto": true
    },
    {
      "id": "gh-173",
      "date": "2026-10-29",
      "dateNote": "слияние PR на GitHub",
      "kind": "Продукт",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product", "carousel", "skills"],
      "title": "Карусель Pro: бот в Telegram находит залетевшие карусели и делает ремикс",
      "summary": "Каждый день бот ищет карусели-залёты у вас и у конкурентов, разбирает, почему они залетели, и присылает план с новым хуком, кодовым словом и подписью. После одобрения готовые слайды 1080×1350 приходят альбомом и файлами без сжатия.",
      "proof": [
        { "kind": "github", "label": "PR #173 · ветка «Instagram Карусели» в Telegram + скилл carousel-pro", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/173" },
        { "kind": "github", "label": "PR #176 · Claude/great heisenberg thk6rj", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/176" },
        { "kind": "github", "label": "PR #177 · Claude/great heisenberg thk6rj", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/177" }
      ],
      "group": "remake-site|claude/great-heisenberg-thk6rj",
      "prs": [173, 176, 177],
      "auto": true
    },
    {
      "id": "gh-178",
      "date": "2026-10-29",
      "dateNote": "слияние PR на GitHub",
      "kind": "Продукт",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product"],
      "title": "Persona Studio: боевой запуск с автодеплоем, монтажом и новым оформлением",
      "summary": "Persona Studio готова к работе на своём сервере: автоматическое обновление при каждом изменении, вход по ссылке, новые шрифты и 3D-иконки разделов, а в базе появилась поддержка монтажа видео.",
      "proof": [
        { "kind": "github", "label": "PR #178 · Claude/persona studio status p u6 yd", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/178" }
      ],
      "group": "persona-studio|claude/persona-studio-status-pU6YD",
      "prs": [178],
      "auto": true
    },
    {
      "id": "gh-179",
      "date": "2026-10-29",
      "dateNote": "слияние PR на GitHub",
      "kind": "Разработка",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product", "montage", "scripts"],
      "title": "Remake: управление рилсами в Telegram кнопками — правки голосом, хуки и слоты публикации",
      "summary": "В ветке Instagram Reels появились кнопки одобрения, правки текстом или голосом, выбор из 4 хуков, замена ролика и авто-слоты публикации в 12:00 и 19:00 с напоминанием. Все карусели и стили, включая «Мой блог», собраны в одном боте.",
      "proof": [
        {
          "kind": "github",
          "label": "PR #179 · кнопки Threads в ветке Instagram Reels, карусели — в одном боте",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/179"
        }
      ],
      "group": "remake-site|claude/gifted-gates-3wo7i6",
      "prs": [179],
      "auto": true
    },
    {
      "id": "gh-151",
      "date": "2026-10-28",
      "dateNote": "слияние PR на GitHub",
      "kind": "Сайт",
      "dept": "ceo",
      "people": ["ilia"],
      "agents": ["product"],
      "title": "Живой офис агентов: готовые работы каждого агента с превью",
      "summary": "У каждого агента в досье теперь сами собираются его работы: ролики, сайты, документы, рассылки и код — с превью, датой и ссылкой на задачу. Новая вкладка «Работы» показывает всё по отделам.",
      "proof": [
        {
          "kind": "github",
          "label": "PR #151 · готовые работы каждого агента — с превью, из досье и истории задач",
          "url": "https://github.com/kleber2009-alt/ai-command-center/pull/151"
        },
        { "kind": "github", "label": "PR #154 · личный ассистент — разговор с офисом голосом и текстом", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/154" },
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/determined-hawking-5lh954",
      "prs": [151, 154],
      "auto": true
    }
  ]
};
