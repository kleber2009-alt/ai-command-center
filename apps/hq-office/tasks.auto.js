/* История задач, которая пополняется сама (sync/sync.mjs, workflow hq-office-history):
   новые PR на GitHub — после каждого слияния и раз в сутки — и ссылки из формы «Run workflow».
   Сайт показывает эти задачи вместе с tasks.js. Править можно прямо здесь: синк не трогает
   готовые задачи, только дописывает к ним новые PR той же ветки. Удалённая задача не вернётся —
   её PR остаются в seen. Чтобы задача стала «ручной», перенесите её в tasks.js. */
window.OFFICE_TASKS_AUTO = {
  "since": "2026-10-29T07:11:00Z",
  "seen": [148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166],
  "tasks": [
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
        { "kind": "github", "label": "PR #165 · реестр всех проектов, карта архитектуры и синк в дашборд", "url": "https://github.com/kleber2009-alt/ai-command-center/pull/165" }
      ],
      "group": "command-center|claude/great-goodall-2m5iae",
      "prs": [165],
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
