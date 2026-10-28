/* История задач, которая пополняется сама (sync/sync.mjs, workflow hq-office-history):
   новые PR на GitHub — после каждого слияния и раз в сутки — и ссылки из формы «Run workflow».
   Сайт показывает эти задачи вместе с tasks.js. Править можно прямо здесь: синк не трогает
   готовые задачи, только дописывает к ним новые PR той же ветки. Удалённая задача не вернётся —
   её PR остаются в seen. Чтобы задача стала «ручной», перенесите её в tasks.js. */
window.OFFICE_TASKS_AUTO = {
  "since": "2026-10-28T09:09:11Z",
  "seen": [148, 149, 150, 151, 152, 153],
  "tasks": [
    {
      "id": "gh-148",
      "date": "2026-10-28",
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
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/affectionate-keller-qy05o4",
      "prs": [148, 149, 150, 152],
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
        { "kind": "site", "label": "Живой офис агентов — живой сайт", "url": "https://hq2.aicex.club" }
      ],
      "group": "hq-office|claude/determined-hawking-5lh954",
      "prs": [151],
      "auto": true
    }
  ]
};
