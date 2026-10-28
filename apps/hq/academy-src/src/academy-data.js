// Track v2 catalogue: modules (rooms), files, ranks, badges, glossary, click-through guides.
(function () {
  var A = window.ACADEMY = window.ACADEMY || {};

  A.modules = [
    { id: 0, room: 'hall', title: 'Ресепшн', goal: 'Паспорт бизнеса, проект в Claude и подключения' },
    { id: 1, room: 'ceo', title: 'Стратегия', goal: 'Рынок, документы и продукт' },
    { id: 2, room: 'marketing', title: 'Контент-завод', goal: 'Аудитория, сценарии, видео, карусели, публикации' },
    { id: 3, room: 'marketing', title: 'Упаковка и воронка', goal: 'Лендинг, подарок, бот, презентация, креативы' },
    { id: 4, room: 'sales', title: 'Отдел продаж', goal: 'Комментарии, директ, база знаний, рассылки, сделки' },
    { id: 5, room: 'traffic', title: 'Реклама', goal: 'Кампании в Meta и отчёты по рекламе' },
    { id: 6, room: 'ceo', title: 'Автопилот', goal: 'Аналитика, утренний брифинг, свои скиллы и неделя офиса' }
  ];
  A.rooms = { hall: 'Ресепшн', ceo: 'Стратегия и продукт', marketing: 'Маркетинг', sales: 'Продажи', traffic: 'Реклама' };
  A.deptFolder = { ceo: 'strategy', marketing: 'marketing', sales: 'sales', traffic: 'ads' };

  A.ranks = [
    { name: 'Стажёр', xp: 0 },
    { name: 'Специалист', xp: 400 },
    { name: 'Менеджер', xp: 1200 },
    { name: 'Директор', xp: 2200 },
    { name: 'Основатель офиса', xp: 3000 }
  ];
  A.xp = { answers: 30, gifts: 10, task: 50, regulation: 20, boss: 50, streak7: 50 };

  A.badges = [
    { id: 'office-open', name: 'Офис открыт', desc: 'Паспорт бизнеса и проект в Claude' },
    { id: 'first-agent', name: 'Первый агент', desc: 'Нанял первого агента' },
    { id: 'content-factory', name: 'Контент-завод', desc: 'Нанят весь модуль «Контент-завод»' },
    { id: 'funnel-live', name: 'Воронка запущена', desc: 'Бот собрал первых подписчиков' },
    { id: 'first-sale', name: 'Первая продажа', desc: 'Клиент оплатил через систему' },
    { id: 'ads-live', name: 'Реклама в работе', desc: 'Запущен тест рекламы' },
    { id: 'own-skill', name: 'Своими руками', desc: 'Сделал свой первый скилл' },
    { id: 'autopilot', name: 'Офис на автопилоте', desc: 'Две недели по регламенту' },
    { id: 'streak7', name: 'Серия 7 дней', desc: '7 дней подряд хоть одно действие' }
  ];
  A.bossBadge = { '2.4': null, '3.3': 'funnel-live', '4.5': 'first-sale', '5.1': 'ads-live', '6.3': 'autopilot' };

  A.glossary = {
    'скилл': 'Инструкция для Claude, как делать одну работу. Установил один раз — Claude пользуется ей сам.',
    'агент': 'ИИ-сотрудник с одной задачей: скилл + твой контекст + регламент. Например, «Сценарии» пишет рилсы.',
    'коннектор': '«Провод» между Claude и сервисом: Google Drive, Chat Place, Windsor. Claude сам берёт оттуда данные.',
    'проект Claude': 'Отдельная папка в Claude со своими файлами и инструкцией. Все чаты в ней знают твой бизнес.',
    'знания проекта': 'Файлы, загруженные в проект Claude. Claude читает их в каждом чате этого проекта.',
    'инструкция проекта': 'Текст, который Claude читает перед каждым ответом: кто ты и как с тобой работать.',
    'регламент': 'Правило работы агента: когда запускать, что дать на вход, что получить и кто проверяет.',
    'артефакт': 'Готовая страница в Claude: лендинг, презентация, таблица, приложение. Открывается по ссылке.',
    'промпт': 'Текст задачи для Claude. Хороший промпт — с твоим контекстом и понятным результатом.',
    'контекст': 'Всё, что Claude знает о твоём бизнесе перед ответом. Больше контекста — точнее результат.',
    'бот': 'Программа в Telegram или Instagram, которая сама отвечает и отправляет сообщения по расписанию.',
    'воронка': 'Путь человека от рилса до оплаты: кодовое слово → подарок в боте → прогрев → покупка.',
    'лид-магнит': 'Бесплатный подарок за подписку: гайд, чек-лист, мини-урок.',
    'кодовое слово': 'Слово, которое человек пишет в комментариях, чтобы получить подарок. Например, ВОРОНКА.',
    'лендинг': 'Одна страница сайта, которая продаёт один продукт.',
    'рилс': 'Короткое вертикальное видео до минуты.',
    'карусель': 'Пост из нескольких картинок, которые листают вбок.',
    'креатив': 'Картинка или видео для рекламы.',
    'директ': 'Личные сообщения в Instagram.',
    'база знаний': 'Ответы на частые вопросы, по которым ИИ-агент отвечает клиентам.',
    'босс': 'Задание в реальной жизни: опубликовать, запустить, продать. За него — двойной опыт.'
  };

  // Click-through instructions with schematic screens.
  A.guides = [
    {
      id: 'claude-new-project', title: 'Создать проект в Claude', minutes: 2,
      why: 'В проекте Claude помнит твой бизнес. Не нужно каждый раз всё объяснять заново.',
      steps: [
        { screen: 'home', target: 'nav-projects', text: 'Открой claude.ai. Слева нажми **Projects** (Проекты).' },
        { screen: 'projects', target: 'btn-new', text: 'Справа сверху нажми **New project**.' },
        { screen: 'new-project', target: 'field-name', text: 'Впиши название проекта. Описание можно пропустить.' },
        { screen: 'new-project', target: 'btn-create', text: 'Нажми **Create project**. Проект готов.' }
      ]
    },
    {
      id: 'claude-instructions', title: 'Вставить инструкцию проекта', minutes: 2,
      why: 'Инструкцию Claude читает перед каждым ответом. Так он сразу знает, кто ты.',
      steps: [
        { screen: 'cabinet-file', target: 'btn-copy', text: 'В офисе открой «Проект» → CLAUDE.md и нажми **Скопировать**.' },
        { screen: 'project', target: 'instr', text: 'Открой свой проект в Claude. Справа нажми **Instructions**.' },
        { screen: 'instructions', target: 'textarea', text: 'Вставь текст: Ctrl+V на Windows или Cmd+V на Mac.' },
        { screen: 'instructions', target: 'btn-save', text: 'Нажми **Save instructions**.' }
      ]
    },
    {
      id: 'claude-knowledge', title: 'Загрузить файлы проекта в Claude', minutes: 3,
      why: 'Файлы — память о бизнесе. Агенты читают их и пишут про тебя, а не «в общем».',
      steps: [
        { screen: 'cabinet-files', target: 'btn-zip', text: 'В офисе открой «Проект» и нажми **Скачать всё (.zip)**. Распакуй архив.' },
        { screen: 'project', target: 'files-add', text: 'В проекте Claude справа найди **Files** и нажми **+**.' },
        { screen: 'project-add', target: 'menu-upload', text: 'Выбери **Upload from device**.' },
        { screen: 'project-files', target: 'files-list', text: 'Выдели все .md файлы из архива и загрузи.' }
      ]
    },
    {
      id: 'claude-prompt', title: 'Запустить промпт в проекте', minutes: 2,
      why: 'Промпт из задания уже содержит твои ответы. Осталось вставить и забрать результат.',
      steps: [
        { screen: 'cabinet-prompt', target: 'btn-copy-prompt', text: 'В задании нажми **Скопировать промпт**.' },
        { screen: 'project', target: 'chat-input', text: 'Открой свой проект в Claude и кликни в поле сообщения.' },
        { screen: 'chat', target: 'input', text: 'Вставь промпт и нажми Enter. Claude возьмёт файлы проекта сам.' },
        { screen: 'chat-answer', target: 'answer', text: 'Скопируй ответ или ссылку на артефакт и вставь в поле результата.' }
      ]
    },
    {
      id: 'claude-skill-upload', title: 'Установить скилл', minutes: 2,
      why: 'Скилл — готовый рецепт работы. Установил один раз — Claude пользуется им сам.',
      steps: [
        { screen: 'skills-site', target: 'btn-pack', text: 'Открой skills.aicex.club и скачай нужный скилл архивом .zip.' },
        { screen: 'home', target: 'nav-user', text: 'В Claude нажми на своё имя внизу слева → **Settings**.' },
        { screen: 'settings', target: 'tab-capabilities', text: 'Открой вкладку **Capabilities**.' },
        { screen: 'settings', target: 'btn-upload', text: 'В блоке **Skills** нажми **Upload skill** и выбери архив.' },
        { screen: 'chat', target: 'input', text: 'Проверь: напиши задачу словами. Claude сам возьмёт скилл.' }
      ]
    },
    {
      id: 'claude-connector', title: 'Подключить коннектор', minutes: 2,
      why: 'С коннектором Claude сам берёт данные из сервиса и сам туда пишет.',
      steps: [
        { screen: 'home', target: 'nav-user', text: 'В Claude нажми на своё имя внизу слева → **Settings**.' },
        { screen: 'settings-connectors', target: 'tab-connectors', text: 'Открой вкладку **Connectors**.' },
        { screen: 'settings-connectors', target: 'btn-connect', text: 'Найди сервис и нажми **Connect**. Войди в свой аккаунт.' },
        { screen: 'chat', target: 'input', text: 'Проверь запросом: «Покажи мои последние переписки в боте».' }
      ]
    },
    {
      id: 'office-open', title: 'Ходить по офису', minutes: 1,
      why: 'Офис — твоя карта. Здесь видно, кто нанят и где следующее рабочее место.',
      steps: [
        { screen: 'office', target: 'room', text: 'Нажми на комнату отдела — камера войдёт внутрь.' },
        { screen: 'office', target: 'marker', text: 'Мигающая метка — пустое рабочее место. Нажми на неё, чтобы начать шаг.' },
        { screen: 'office', target: 'agent', text: 'Нажми на нанятого агента — откроется его регламент и промпт запуска.' }
      ]
    }
  ];

  A.officeUrl = 'https://hq.aicex.club';
})();
