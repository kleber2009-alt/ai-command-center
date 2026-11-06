/* Реестр агентов живого офиса — единственное место, где описан агент: отдел, имя, роль, цвет, экран в 3D,
   комнаты («Волна» — room, «Ночной Сити» — night; без них — комната своего отдела), что делает сейчас и кому
   что передаёт. Отсюда собираются: списки отделов (office.config.js), карточки AGENT_CATALOG (agent-content.js),
   сцена OFFICE_DATA.catalog и запасной config (index.html), комнаты WAVE_ROOM_OF / ROOM_OF (index.html, night.js),
   команда концепта (concepts/), каталог диспетчера рабочего стола (assistant/desk.mjs).

   Новый агент = запись здесь + досье в agent-content.js (AGENT_CONTENT: что умеет, процесс, скиллы, примеры задач).
   Порядок внутри отдела — порядок мест в комнате. Поля:
     dept      ceo | marketing | sales | traffic | council (переговорная легенд) | neuro (офис Нейроворонки, поле contour — контур)
     screen    что на мониторе в 3D: code | chart | doc | media | flow | chat | ads | calendar | …
     status    working | thinking | idle — состояние в карточке;  now — «сейчас делает» в карточке (иначе tasks[0])
     tasks     чем агент занят в 3D (по кругу);  out — кому и что он носит: o(кому, что сделал, предмет[, вопрос вам])
     works     готовые работы-ссылки в досье;  needsInput — ждёт вашего ответа;  figure:false — без фигуры в 3D
     control   id руководителя: агент контроля отдела — отчёт владельцу (assistant/desk.mjs → controlReport); задач не берёт,
               руководителю не подчиняется и в его агенты не входит */
(() => {
  const o = (to, say, item, ask) => ({ to, say, item, ask });
  const ART = id => 'https://claude.ai/artifact/' + id;
  const list = {
    // Стратегия и продукт
    product: { dept:'ceo', name:'Разработка продуктов', role:'Собирает продукты кодом и выкладывает', color:'#4da3ff', screen:'code', room:'tech', night:'tech', status:'working', now:'Дорабатывает продукт',
      tasks:['Дорабатывает Persona Studio 2.0', 'Выкатывает обновление бота монтажа', 'Чинит оплату в мини-аппе'],
      out:[
        o('you', 'выкатил Persona Studio 2.0 на тест', 'Релиз Persona Studio 2.0', 'Примите релиз Persona Studio 2.0'),
        o('chats', 'выкатил новую версию бота', 'Новая версия бота'),
        o('landings', 'подключил оплату к лендингу', 'Оплата на лендинге')],
      works:[['Транскрибация', 'https://transcribe.aicex.club'], ['AI Creative Hub', 'https://aihub.aicex.club'], ['Бот монтажа', 'https://reels.aicex.club'], ['Пак скиллов', 'https://skills.aicex.club']] },
    market: { dept:'ceo', name:'Исследования рынка', role:'Изучает рынок, конкурентов и тренды', color:'#9b6bff', screen:'chart', room:'ceo', night:'ceo', status:'thinking',
      tasks:['Сравнивает офферы конкурентов', 'Собирает игровые концепции', 'Ищет ниши для Нейроворонки'],
      out:[
        o('product', 'передал выводы по конкурентам', 'Отчёт по конкурентам'),
        o('specs', 'отдал карту рынка для ТЗ', 'Карта рынка'),
        o('you', 'собрал сравнение офферов', 'Сравнение офферов', 'Посмотрите сравнение офферов конкурентов')],
      works:[['Prod Skills — игровые концепции', ART('8bFig9B5aX3RqzZqS5LdkZ')], ['12 рабочих связок', ART('Xs6q7BfiHsmEdYxSAXt9DU')], ['VSL: Контент → Аудитория → Деньги', ART('3K2VLPCxZqQKu2oHTqTD69')]] },
    transcriber: { dept:'ceo', name:'Транскрибатор', role:'Расшифровывает ролики по ссылке и передаёт текст агентам', color:'#2fd3c6', screen:'doc', room:'studio', night:'studio', status:'working',
      tasks:['Расшифровывает рилс конкурента', 'Текст эфира для сценариев', 'Разбор YouTube-ролика'],
      out:[
        o('scripts', 'передал расшифровку рилса конкурента', 'Расшифровка референса'),
        o('carousel', 'отдал текст ролика для карусели', 'Текст ролика'),
        o('avatar', 'передал текст для аватара', 'Расшифровка'),
        o('audience', 'отдал расшифровки залётов конкурентов', 'Расшифровки залётов')],
      works:[['Транскрибация', 'https://transcribe.aicex.club']] },
    qa: { dept:'ceo', name:'Контролёр качества', role:'Проверяет работу агентов до того, как её увидите вы', color:'#9be15d', screen:'doc', room:'tech', night:'tech', status:'working', now:'Проверяет готовый ролик',
      tasks:['Сверяет результат с ТЗ', 'Смотрит главный файл', 'Возвращает на доработку'],
      out:[
        o('you', 'проверил результат — можно смотреть', 'Проверенный результат'),
        o('montage', 'вернул ролик на доработку', 'Замечания к ролику'),
        o('landings', 'вернул лендинг на доработку', 'Замечания к лендингу')] },
    socialstats: { dept:'ceo', name:'Статистика соцсетей', role:'Каждое утро: охваты, просмотры и что сработало вчера', color:'#ff6fb5', screen:'chart', room:'analytics', night:'analytics', status:'working',
      tasks:['Собирает статистику за вчера', 'Ищет, что залетело', 'Сравнивает с нормой аккаунта'],
      out:[
        o('you', 'положил статистику за вчера', 'Статистика дня', 'Посмотрите статистику соцсетей за вчера'),
        o('scripts', 'передал, какие темы залетели', 'Что залетело'),
        o('publish', 'подсказал, что перевыпустить', 'Перевыпуск'),
        o('remake', 'показал, что залетело, — в ремейк', 'Залёт дня'),
        o('analytics', 'отдал цифры соцсетей', 'Цифры соцсетей')] },
    billing: { dept:'ceo', name:'Балансы и подписки', role:'Следит за балансами и продлением сервисов офиса', color:'#ffb347', screen:'chart', room:'tech', night:'tech', status:'working',
      tasks:['Проверяет балансы сервисов', 'Сверяет даты продления', 'Считает остаток лимитов'],
      out:[
        o('you', 'предупредил о продлении подписки', 'Продление подписки', 'Продлите подписку до конца недели'),
        o('product', 'проверил ключи сервисов', 'Ключи сервисов'),
        o('orchestrator', 'сообщил: балансы в порядке', 'Балансы')] },
    finance: { dept:'ceo', name:'Финансы', role:'Выручка, расходы, P&L и юнит-экономика', color:'#4fd18b', screen:'chart', room:'ceo', night:'ceo', status:'thinking',
      tasks:['Сводит P&L за неделю', 'Разносит расходы по категориям', 'Считает окупаемость рекламы'],
      out:[
        o('you', 'положил P&L за неделю', 'P&L недели', 'Посмотрите P&L: где теряем деньги'),
        o('billing', 'сверил подписки с расходами', 'Расходы на сервисы'),
        o('adreports', 'взял расход на рекламу', 'Расход на рекламу')],
      works:[['Finance OS', 'https://finance.aicex.club/'], ['Сквозная аналитика', 'https://dashboard.aicex.club/']] },
    briefing: { dept:'ceo', name:'Утренний брифинг', role:'Сводка дня: почта, календарь, задачи', color:'#ffd166', screen:'doc', room:'ceo', night:'ceo', status:'idle', needsInput:true,
      tasks:['Соберёт брифинг утром', 'Разбирает почту и календарь', 'Сводит задачи команды'],
      out:[
        o('you', 'положил брифинг дня', 'Брифинг дня', 'Прочитайте брифинг и подтвердите приоритеты дня'),
        o('orchestrator', 'передал задачи на день', 'Задачи дня')] },
    specs: { dept:'ceo', name:'ТЗ и документы', role:'Пишет ТЗ, планы и гайды', color:'#5ad1ff', screen:'doc', room:'ceo', night:'ceo', status:'working',
      tasks:['Пишет гайд для клиента', 'ТЗ на Telegram-бота Нейроворонки', 'План реализации воронки'],
      out:[
        o('product', 'передал ТЗ на доработку бота', 'ТЗ на бота'),
        o('landings', 'отдал ТЗ на лендинг', 'ТЗ лендинга'),
        o('funnels', 'передал план воронки', 'План воронки')],
      works:[['Нейроворонка — план реализации', ART('Qc9ehZN7mvMrUGin99JbYT')], ['ТЗ: агент Silent Reels', ART('GRJDBxDhoN7ncD8Bp7bCEH')], ['Persona Studio — гайд для клиента', ART('2aVDVGGJfK9uSgSz4kgYyV')]] },
    skills: { dept:'ceo', name:'Скиллы и автоматизации', role:'Создаёт скиллы, плагины и MCP для команды', color:'#3ddc97', screen:'code', room:'tech', night:'tech', status:'working',
      tasks:['Упаковывает пакет скиллов', 'Пишет MCP для дашборда', 'Собирает скилл монтажа'],
      out:[
        o('montage', 'подключил новый скилл монтажа', 'Скилл монтажа'),
        o('product', 'собрал MCP-коннектор', 'MCP-коннектор'),
        o('carousel', 'обновил скилл каруселей', 'Скилл каруселей')],
      works:[['Пакет скиллов по монтажу видео', ART('8Sx4z7NmqWs6CnjieSbEHJ')], ['skills.aicex.club', 'https://skills.aicex.club'], ['Лендинги эксперта: 5 стилей', ART('F5cjiWb2ss8AvaC3uF3CHi')]] },

    // Отдел маркетинга
    slides: { dept:'marketing', name:'Презентации', role:'Слайды вебинаров, эфиров и питчей', color:'#4da3ff', screen:'slides', room:'studio', night:'studio', status:'thinking',
      tasks:['Продумывает структуру вебинара', 'Слайды эфира «Монтаж с Claude»', 'Питч для партнёров'],
      out:[
        o('head', 'показал структуру вебинара', 'Структура вебинара'),
        o('you', 'собрал презентацию эфира', 'Слайды эфира', 'Утвердите слайды эфира на четверг'),
        o('landings', 'отдал блоки для лендинга', 'Блоки слайдов')],
      works:[['Эфир «Монтаж рилсов с Claude»', 'https://marketing.aicex.club/assets/pages/copper/deck/index.html'], ['Лид-магнит «Первые 10 000»', 'https://marketing.aicex.club/assets/pages/presentation-svyazka.html'], ['Урок 2 — блог с 0 до 10 000', 'https://marketing.aicex.club/assets/pages/webinar/index.html'], ['Спринт Чёрный', ART('R56YaWRpHrDHPD8n7ZjUny')]] },
    creatives: { dept:'marketing', name:'Креативы', role:'Рекламные креативы для Meta', color:'#ff7a59', screen:'media', room:'marketing', night:'marketing', status:'working',
      tasks:['Генерирует креативы для теста', 'Баннеры для лид-магнита', 'Пачка из 12 креативов'],
      out:[
        o('metaads', 'передал пачку креативов', '12 креативов'),
        o('you', 'собрал креативы', 'Креативы для Meta Ads', 'Согласуйте креативы для Meta Ads'),
        o('funnels', 'отдал баннеры для бота', 'Баннеры бота')],
      works:[['Баннеры воронки — 6 штук', null]] },
    funnels: { dept:'marketing', name:'Воронки', role:'Бот, прогрев по дням и оффер', color:'#3ddc97', screen:'flow', room:'marketing', night:'marketing', status:'working',
      tasks:['Собирает прогрев в боте', 'Цепочка на 7 дней', 'Оффер для Нейроворонки'],
      out:[
        o('mailings', 'передал прогрев по дням', 'Прогрев на 7 дней'),
        o('chats', 'обновил сценарии бота', 'Сценарии бота'),
        o('head', 'показал схему воронки', 'Схема воронки')],
      works:[['Нейроворонка', ART('6z4UBbZhGNcCpVmJUp487P')], ['Нейроворонка — ТЗ на Telegram-бота', ART('MEienkWZMA9dp3RugXzJRM')], ['NeuroFunnel (EN)', ART('UmhCiWJHjmKATyFKQKCUh3')]] },
    publish: { dept:'marketing', name:'Публикации', role:'Контент-план и выпуск в соцсети', color:'#ffd166', screen:'calendar', room:'marketing', night:'marketing', status:'working', now:'Ставит рилс в публикацию',
      tasks:['Контент-план на ноябрь', 'Ставит рилс в публикацию на 19:00', 'Расписание каруселей'],
      out:[
        o('you', 'собрал контент-план', 'Контент-план на ноябрь', 'Подтвердите контент-план на ноябрь'),
        o('comments', 'выпустил рилс — ловим кодовые слова', 'Рилс в 19:00'),
        o('analytics', 'отдал выпуски недели в аналитику', 'Выпуски недели')],
      works:[['Контент Илья — органика', ART('5LwBz4Y5Yhdxj6pDcTG6Wp')], ['Практикум по ИИ-контенту', ART('AdPDqEVK6EdSsMwdnKMtgk')], ['Трек Юлии: 0 → 10 000', ART('BLULR8V3fsKhF7H7tWKyv9')]] },
    analytics: { dept:'marketing', name:'Аналитика', role:'Охваты, лиды, выручка и ROMI', color:'#5ad1ff', screen:'chart', room:'analytics', night:'analytics', status:'thinking',
      tasks:['Считает ROMI за неделю', 'Сводка по охватам', 'Когорты оплат'],
      out:[
        o('head', 'положил отчёт по ROMI', 'Отчёт по ROMI'),
        o('you', 'собрал сводку недели', 'Сводка недели', 'Посмотрите сводку недели: ROMI 312%'),
        o('audience', 'передал лучшие рилсы недели', 'Топ рилсов')],
      works:[['Сквозная аналитика', ART('UzeN9sagWbM8We1yTWTmGf')]] },
    audience: { dept:'marketing', name:'Анализ аудитории', role:'Аудитория, ниша и конкуренты', color:'#c38bff', screen:'chart', room:'analytics', night:'analytics', status:'working',
      tasks:['Ищет выбросы в нише', 'Разбирает конкурентов', 'Портрет аудитории'],
      out:[
        o('scripts', 'передал темы-выбросы', 'Темы-выбросы'),
        o('creatives', 'отдал боли аудитории', 'Боли аудитории'),
        o('slides', 'передал портрет аудитории', 'Портрет аудитории')],
      works:[['ТЗ на продающие рилсы — разбор', ART('FmuSoMWs8iVphWcC9AYgPL')], ['Трек Юлии: 0 → 10 000', ART('BLULR8V3fsKhF7H7tWKyv9')]] },
    viral: { dept:'marketing', name:'Поиск залётов', role:'План дня: 3 залёта — 1 рилс + 2 карусели или 2 + 1 (@instaoo_bot)', color:'#ff8a3d', screen:'chart', room:'analytics', night:'analytics', status:'working',
      now:'Собирает план контента на день',
      tasks:['Что летит у конкурентов за 3 дня', 'Ваши залёты за всё время — в ремейк', 'Лучшее конкурентов — адаптировать', 'Только от 100 тыс. просмотров, 1000 комментариев и 1000 репостов'],
      out:[
        o('transcriber', 'передал залёт на расшифровку', 'Залёт конкурента'),
        o('remake', 'отдал залёт в ремейк', 'Залёт для ремейка'),
        o('carousel', 'передал карусель-залёт', 'Карусель-залёт'),
        o('scripts', 'передал темы-выбросы', 'Темы-выбросы')],
      works:[['Залётный', 'https://parser.aicex.club/'], ['Reels Cloner', 'https://landings.aicex.club/viral-clone/']] },
    chiefmarketer: { dept:'marketing', name:'Главный маркетолог', role:'Собирает идеи всех агентов контента и каждое утро приносит контент-план на сутки', color:'#ffcf5c', screen:'calendar', room:'marketing', night:'marketing', status:'working',
      now:'Собирает контент-план на сутки',
      tasks:['Собирает залёты дня, конкурентов и статистику', 'Сводит идеи агентов в контент-план', 'Что адаптировать под Илью и почему сработает', 'Отдаёт одобренное в работу с монтажом'],
      out:[
        o('you', 'принёс контент-план на сутки', 'Контент-план на сутки', 'Одобрите пункты контент-плана ✅'),
        o('remake', 'отдал залетевший рилс в ремейк', 'Рилс из плана'),
        o('carousel', 'передал карусель из плана', 'Карусель из плана'),
        o('scripts', 'передал рилс на сценарий', 'Рилс из плана'),
        o('montage', 'отдал рилс на монтаж', 'Рилс на монтаж'),
        o('threads', 'передал ветку из плана', 'Ветка Threads')],
      works:[['План дня · @instaoo_bot', 'https://remake.aicex.club/api/plan']] },
    competitors: { dept:'marketing', name:'Конкуренты', role:'Знает 60 конкурентов по Reels + ИИ и достаёт у них идеи (от 100 тыс. / 1000 / 1000)', color:'#ff4f6d', screen:'chart', room:'analytics', night:'analytics', status:'working',
      now:'Ищет свежие залёты у конкурентов',
      tasks:['Сканирует 60 конкурентов за 30 дней', 'Только от 100 тыс. просмотров, 1000 комментариев и 1000 репостов', 'Разбирает, почему залетело', 'Идеи для рилсов и каруселей Ильи'],
      out:[
        o('you', 'принёс идеи из залётов конкурентов', 'Идеи у конкурентов', 'Посмотрите идеи из залётов конкурентов'),
        o('transcriber', 'передал залёт на расшифровку', 'Залёт конкурента'),
        o('scripts', 'отдал идеи с хуками для сценариев', 'Идеи с хуками'),
        o('carousel', 'передал карусель-залёт конкурента', 'Карусель-залёт'),
        o('volumefactory', 'отдал свежие залёты для сплит-реакций', 'Залёты для реакций'),
        o('chiefmarketer', 'принёс залёты конкурентов в контент-план', 'Идеи конкурентов')],
      works:[['Стратегия @sashasence', ART('JdTYjFBsEU8mLdewMXbDRh')], ['Стратегия @arina_alexx', ART('SSdBoFsfSC3A1TzPsQwmHG')]] },
    humanexpert: { dept:'marketing', name:'Человек + эксперт', role:'Стратегия @sashasence: охватные рилсы живым человеком + лидовые с кодовым словом', color:'#f7a3c8', screen:'calendar', room:'studio', night:'studio', status:'thinking',
      now:'Собирает план недели на два потока',
      tasks:['План недели: 7 рилсов на два потока', 'Хуки по 9 механикам', 'Аудит профиля: сетка-лукбук и закрепы', '«Итоги месяца» голосом Ильи'],
      out:[
        o('you', 'собрал план недели на два потока', 'План недели', 'Посмотрите план недели: охват + лиды'),
        o('scripts', 'отдал лидовые рилсы с кодовыми словами', 'Лидовые рилсы'),
        o('avatar', 'передал тексты для аватара', 'Тексты для аватара'),
        o('publish', 'передал план публикаций на неделю', 'План публикаций'),
        o('funnels', 'отдал новые кодовые слова и подарки', 'Кодовые слова'),
        o('chiefmarketer', 'принёс темы раскрытия личности', 'Темы личности')],
      works:[['Стратегия @sashasence → НЕЙРОЗАПУСК', ART('JdTYjFBsEU8mLdewMXbDRh')]] },
    volumefactory: { dept:'marketing', name:'Конвейер объёма', role:'Стратегия @arina_alexx: 8 единиц в день, сплит-реакции на тренды, тесты вместо гайдов', color:'#7cf0c8', screen:'flow', room:'studio', night:'studio', status:'working',
      now:'Собирает сетку на день',
      tasks:['Сетка на день: 8 единиц', 'Сплит-реакции на свежие залёты', 'Тест-лид-магнит для ChatPlace', 'Пакет на съёмочный день'],
      out:[
        o('you', 'собрал сетку контента на день', 'Сетка на день', 'Посмотрите сетку контента на день'),
        o('avatar', 'отдал пакет роликов для аватара', 'Пакет для аватара'),
        o('montage', 'передал сплит-реакции на монтаж', 'Сплит-реакции'),
        o('carousel', 'передал мем-пост и карусель для репостов', 'Карусель для репостов'),
        o('funnels', 'отдал тест под кодовое слово ТЕСТ', 'Тест-лид-магнит'),
        o('chiefmarketer', 'принёс сетку форматов на день', 'Сетка форматов')],
      works:[['Стратегия @arina_alexx и как её повторить', ART('SSdBoFsfSC3A1TzPsQwmHG')]] },
    scripts: { dept:'marketing', name:'Сценарии', role:'Сценарии рилсов с кодовым словом', color:'#ff5d8f', screen:'doc', room:'studio', night:'studio', status:'working', now:'Пишет продающие рилсы',
      tasks:['Пишет 10 продающих рилсов', 'Сценарий рилса про ИИ-офис', 'Хуки для серии «Claude vs GPT»'],
      out:[
        o('montage', 'передал сценарий рилса', 'Сценарий рилса'),
        o('carousel', 'отдал текст карусели', 'Текст карусели'),
        o('avatar', 'передал текст для аватара', 'Текст для аватара')],
      works:[['Нейроворонка — 10 продающих рилс', ART('MfLyqeAaZGw62HSUwuCCZd')], ['ТЗ на продающие рилсы', ART('FmuSoMWs8iVphWcC9AYgPL')], ['Рилс «Claude vs GPT»', ART('Cft7hmLVrPK9P9RA4A8NqM')]] },
    remake: { dept:'marketing', name:'Ремейк залёта', role:'Залёт → новый сценарий → аватар → монтаж', color:'#b388ff', screen:'video', room:'studio', night:'studio', status:'working',
      tasks:['Делает ремейк топ-рилса', 'Сценарий 2.0 с кодовым словом', 'Ролик двойником HeyGen'],
      out:[
        o('avatar', 'передал сценарий 2.0 для двойника', 'Сценарий 2.0'),
        o('montage', 'отдал ролик аватара на монтаж', 'Ролик аватара'),
        o('you', 'принёс готовый ремейк', 'Ремейк залёта', 'Посмотрите ремейк залетевшего рилса')],
      works:[['Ремейк залёта', 'https://remake.aicex.club'], ['Студия Кадрика', 'https://kadrik.aicex.club/']] },
    montage: { dept:'marketing', name:'Монтаж видео', role:'Рилсы и YouTube кодом, 35+ стилей', color:'#ff9f43', screen:'timeline', room:'studio', night:'studio', status:'working', now:'Монтирует рилс',
      tasks:['Монтирует рилс «ИИ-офис»', 'Субтитры и биты', 'Обложка и переходы'],
      out:[
        o('publish', 'передал готовый рилс', 'Готовый рилс'),
        o('head', 'показал черновой монтаж', 'Черновой монтаж')],
      works:[['Готовые ролики — 7', null], ['Стили монтажа — 17 листов', null], ['Пакет скиллов по монтажу', ART('8Sx4z7NmqWs6CnjieSbEHJ')]] },
    carousel: { dept:'marketing', name:'Карусели', role:'Карусели Instagram в 24 стилях', color:'#ffe08a', screen:'slides', room:'studio', night:'studio', status:'idle', needsInput:true,
      tasks:['Ждёт сценарий', 'Карусель «12 связок»', 'Карусель в стиле «Стикер»'],
      out:[
        o('publish', 'передал карусель на 10 слайдов', 'Карусель'),
        o('leadmagnet', 'отдал слайды в лид-магнит', 'Слайды карусели')],
      works:[['24 стиля каруселей', null], ['Готовая карусель (PDF)', 'https://marketing.aicex.club/assets/pages/karusel-v1.pdf']] },
    landings: { dept:'marketing', name:'Лендинги', role:'Сайты и лендинги на своём домене', color:'#6366f1', screen:'code', room:'marketing', night:'marketing', status:'working', now:'Верстает лендинг',
      tasks:['Верстает лендинг «Медь»', 'Форма оплаты на лендинге', 'Адаптив под телефон'],
      out:[
        o('metaads', 'отдал ссылку на лендинг', 'Лендинг'),
        o('you', 'собрал лендинг', 'Лендинг «Медь»', 'Проверьте лендинг перед запуском рекламы')],
      works:[['Медь — тёмная', 'https://marketing.aicex.club/assets/pages/copper/site/index.html'], ['Медь — светлая', 'https://marketing.aicex.club/assets/pages/copper/site-light/index.html'], ['Нейроворонка A1', 'https://marketing.aicex.club/assets/pages/landing-a1.html']] },
    leadmagnet: { dept:'marketing', name:'Лид-магниты', role:'Подарки за подписку: PDF, уроки, чек-листы', color:'#2fb9a6', screen:'doc', room:'marketing', night:'marketing', status:'thinking', now:'Придумывает подарок',
      tasks:['Придумывает подарок за подписку', 'PDF «Первые 10 000»', 'Чек-лист связок'],
      out:[
        o('funnels', 'передал подарок за подписку', 'Лид-магнит'),
        o('threads', 'выложил приёмник в канал', 'Пост-приёмник'),
        o('chats', 'добавил материал в каталог Директа', 'Новый материал'),
        o('head', 'показал идею лид-магнита', 'Идея лид-магнита')],
      works:[['Лид-магнит «Первые 10 000»', 'https://marketing.aicex.club/assets/pages/presentation-svyazka.html'], ['12 рабочих связок', ART('Xs6q7BfiHsmEdYxSAXt9DU')]] },
    mkcontrol: { dept:'marketing', name:'Контроль маркетинга', role:'Отчёт по отделу и контроль руководителя — владельцу', color:'#c7a4ff', screen:'chart', room:'marketing', night:'marketing', status:'thinking', control:'firuza',
      now:'Собирает отчёт по отделу',
      tasks:['Собирает отчёт по отделу', 'Смотрит, что ждёт руководителя', 'Сверяет сроки, правки и оценки'],
      out:[
        o('you', 'принёс отчёт по отделу', 'Отчёт по отделу', 'Посмотрите отчёт по отделу')] },
    threads: { dept:'marketing', name:'Threads-ветки', role:'3 ветки в день → материал в Telegram-канале', color:'#e8e8e8', screen:'flow', room:'marketing', night:'marketing', status:'working',
      tasks:['Пишет 3 ветки на завтра', 'Ветка «скилл монтажа» с переходом в канал', 'Перевыпуск победителя с новым хуком'],
      out:[
        o('you', 'прислал 3 ветки на апрув', '3 ветки Threads', 'Одобрите ветки Threads на завтра'),
        o('leadmagnet', 'просит приёмник под ветку', 'Задание на приёмник'),
        o('comments', 'ветка вышла — ловим комментарии', 'Ветка в 13:00'),
        o('analytics', 'принёс цифры веток за 48 часов', 'Шеры, клики, подписки')],
      works:[['Каталог бесплатных материалов', ART('5dj56wNJrKph3AYLbiibKH')], ['Код воронки Threads → Telegram', 'https://github.com/kleber2009-alt/ai-command-center/tree/claude/optimistic-newton-qysfiz/apps/threads-growth']] },
    avatar: { dept:'marketing', name:'Видео с аватаром', role:'Ролики с ИИ-двойником без съёмки', color:'#e0559c', screen:'video', room:'studio', night:'studio', status:'idle', needsInput:true,
      tasks:['Ждёт текст', 'Ролик с аватаром', 'Озвучка клоном голоса'],
      out:[
        o('publish', 'передал ролик с аватаром', 'Ролик с аватаром')],
      works:[['Persona Studio 2.0', ART('D1kTgCx8mQCTV3utcJdxFq')], ['Ролики с аватаром — 2', null]] },

    // Отдел продаж
    launch: { dept:'sales', name:'Практикумы и запуски', role:'Стратегия запуска, гипотезы и прогрев', color:'#ff5d6c', screen:'calendar', room:'marketing', night:'marketing', status:'working',
      tasks:['Ведёт прогрев к практикуму', 'Гипотезы по регистрациям', 'План сторис по дням'],
      out:[
        o('you', 'принёс стратегию запуска', 'Стратегия практикума', 'Утвердите стратегию практикума'),
        o('scripts', 'заказал рилсы прогрева', 'Рилсы прогрева'),
        o('landings', 'заказал лендинг практикума', 'Лендинг практикума'),
        o('mailings', 'передал напоминания о практикуме', 'Напоминания')] },
    chats: { dept:'sales', name:'Переписки', role:'Ведёт переписки с клиентами', color:'#5ad1ff', screen:'chat', room:'sales', night:'sales', status:'working',
      tasks:['Отвечает в директ', 'Квалифицирует лидов из Direct', 'Догоняет молчунов'],
      out:[
        o('closer', 'передал 5 тёплых лидов', '5 тёплых лидов'),
        o('threads', 'отдал боли из Директа для веток', 'Частые запросы Директа'),
        o('head', 'отдал сводку переписок', 'Сводка переписок')],
      works:[['Нейроворонка — ТЗ на Telegram-бота', ART('MEienkWZMA9dp3RugXzJRM')]] },
    comments: { dept:'sales', name:'Ответы на комментарии', role:'Отвечает на кодовые слова под постами', color:'#ffd166', screen:'chat', room:'sales', night:'sales', status:'working',
      tasks:['Разбирает комментарии под рилсом', 'Ловит кодовое слово «ОФИС»', 'Отвечает на вопросы под постом'],
      out:[
        o('chats', 'передал 12 заявок из комментариев', 'Заявки из комментариев'),
        o('analytics', 'отдал статистику кодовых слов', 'Кодовые слова')] },
    consult: { dept:'sales', name:'ИИ-консультации', role:'Отвечает на вопросы по базе знаний', color:'#c38bff', screen:'chat', room:'sales', night:'sales', status:'thinking',
      tasks:['Учит новые ответы', 'Отвечает по базе знаний', 'Разбирает сложный вопрос'],
      out:[
        o('chats', 'передал ответы по базе знаний', 'Ответы по базе'),
        o('head', 'показал вопросы без ответа', 'Вопросы без ответа')] },
    mailings: { dept:'sales', name:'Рассылки', role:'Рассылки по базе в боте', color:'#ff7a59', screen:'chat', room:'sales', night:'sales', status:'idle', needsInput:true,
      tasks:['Ждёт запуск', 'Рассылка по базе бота', 'Письмо дожима'],
      out:[
        o('closer', 'передал откликнувшихся', 'Отклики на рассылку'),
        o('you', 'подготовил рассылку', 'Рассылка по базе', 'Одобрите рассылку по базе 4 200 человек')] },
    closer: { dept:'sales', name:'Закрытие сделок', role:'Доводит тёплых лидов до оплаты', color:'#3ddc97', screen:'chat', room:'sales', night:'sales', status:'working',
      tasks:['Ведёт тёплых лидов', 'Дожимает до оплаты', 'Сообщения после оплаты'],
      out:[
        o('analytics', 'передал оплаты дня', 'Оплаты дня'),
        o('head', 'закрыл сделку и принёс отчёт', 'Отчёт по сделкам')],
      works:[['Сообщения перед и после оплаты', null]] },
    salescontrol: { dept:'sales', name:'Контроль продаж', role:'Отчёт по отделу и контроль руководителя — владельцу', color:'#7ee0b5', screen:'chart', room:'sales', night:'sales', status:'thinking', control:'bogdan',
      now:'Собирает отчёт по отделу',
      tasks:['Собирает отчёт по отделу', 'Смотрит, что ждёт руководителя', 'Сверяет сроки, правки и оценки'],
      out:[
        o('you', 'принёс отчёт по отделу', 'Отчёт по отделу', 'Посмотрите отчёт по отделу')] },
    academy: { dept:'sales', name:'Академия и внедрение', role:'Треки обучения и офис агентов для клиентов', color:'#6ee7ff', screen:'slides', room:'ceo', night:'ceo', status:'thinking',
      tasks:['Собирает трек «Свой ИИ-офис»', 'Урок по связке', 'Внедрение офиса клиенту'],
      out:[
        o('slides', 'заказал слайды урока', 'Слайды урока'),
        o('closer', 'передал программу для продажи', 'Программа трека'),
        o('you', 'собрал трек для учеников', 'Трек обучения', 'Посмотрите трек «Свой ИИ-офис»')],
      works:[['Академия «Свой ИИ-офис»', 'https://hq.aicex.club/?game'], ['Пак скиллов', 'https://skills.aicex.club']] },

    // Реклама Meta
    metaads: { dept:'traffic', name:'Рекламные кампании', role:'Запускает и ведёт кампании в Meta', color:'#ff7a59', screen:'ads', room:'ads', night:'ads', status:'working',
      tasks:['Следит за ценой лида', 'Запускает тест креативов', 'Масштабирует связку'],
      out:[
        o('adreports', 'передал расход и лиды', 'Расход и лиды'),
        o('you', 'подготовил запуск кампании', 'Кампания на 30 000 ₽', 'Согласуйте запуск кампании на 30 000 ₽')] },
    adscontrol: { dept:'traffic', name:'Контроль рекламы', role:'Отчёт по отделу и контроль руководителя — владельцу', color:'#ffb08a', screen:'chart', room:'ads', night:'ads', status:'thinking', control:'nurken',
      now:'Собирает отчёт по отделу',
      tasks:['Собирает отчёт по отделу', 'Смотрит, что ждёт руководителя', 'Сверяет сроки, правки и оценки'],
      out:[
        o('you', 'принёс отчёт по отделу', 'Отчёт по отделу', 'Посмотрите отчёт по отделу')] },
    adreports: { dept:'traffic', name:'Отчёты по рекламе', role:'Расходы, лиды и цена лида по дням', color:'#5ad1ff', screen:'chart', room:'analytics', night:'analytics', status:'thinking',
      tasks:['Готовит отчёт за неделю', 'Цена лида по дням', 'Сводка по связкам'],
      out:[
        o('head', 'положил отчёт по рекламе', 'Отчёт по рекламе'),
        o('analytics', 'передал цену лида', 'Цена лида')],
      works:[['Сквозная аналитика', ART('UzeN9sagWbM8We1yTWTmGf')]] },

    // Офис Нейроворонки (третий стиль офиса, ?theme=neuro; кабинет — neuro/): своя команда под план проекта «Нейроворонка — план
    // реализации» (assistant/neuro-plan.md, на сайт не выкладывается): 7 блоков системы, 9 добавленных элементов, продукт и обязательства. Шесть контуров (contour), комнаты
    // здания (night) — те же, что в «Главном офисе», переименованы (office.config.js → neuro.rooms). dept:'neuro' — в главном офисе их нет.
    // base — наставники в главном офисе: от них агент наследует скиллы и знания (agent-content.js, каталог диспетчера).
    // Штаб и запуск
    shtab: { dept:'neuro', contour:'hq', base:["analytics", "briefing"], name:'Штаб и оператор воронки', role:'Ведёт воронку каждый день: экран дня, находки → задачи, сроки', color:'#7cf0c0', screen:'chart', night:'ceo', status:'thinking',
      tasks:["Собирает экран дня кампании", "Ищет самый слабый этап воронки", "Раздаёт находки контурам"],
      out:[
        o('you', 'положил экран дня', 'Экран дня', 'Посмотрите экран дня Нейроворонки'),
        o('nfanalyst', 'попросил цифры этапов', 'Запрос цифр'),
        o('nfroadmap', 'сверил сроки с дорожной картой', 'Сроки')],
      works:[['Кабинет Нейроворонки', 'https://hq2.aicex.club/neuro/']] },
    nfroadmap: { dept:'neuro', contour:'hq', base:["specs", "launch"], name:'Дорожная карта запуска', role:'8 недель до отлаженной системы: блоки, сроки, тестовая неделя', color:'#ffd166', screen:'calendar', night:'ceo', status:'working',
      tasks:["Сверяет готовность блоков", "Тестовая неделя: покупка и выдача доступа", "Чек-лист старта продаж 10 ноября"],
      out:[
        o('you', 'собрал статус блоков', 'Статус блоков', 'Посмотрите, что мешает старту продаж'),
        o('shtab', 'передал сроки блоков', 'Сроки')] },
    nfqa: { dept:'neuro', contour:'hq', base:["qa"], name:'Контроль качества кампании', role:'Чек-лист и утверждение сценариев и роликов до публикации', color:'#9be15d', screen:'doc', night:'ceo', status:'working',
      tasks:["Проверяет сценарий по чек-листу", "Смотрит ролик до публикации", "Маркировка ИИ на месте?"],
      out:[
        o('nfscripts', 'вернул сценарий с замечаниями', 'Замечания'),
        o('you', 'подготовил ролики на утверждение', 'Ролики на утверждение', 'Утвердите ролики недели')] },
    nflegal: { dept:'neuro', contour:'hq', base:["specs"], name:'Оферта и юридический контур', role:'Оферта, 152-ФЗ, маркировка ИИ и рекламы', color:'#c7a4ff', screen:'doc', night:'ceo', status:'working',
      tasks:["Пишет оферту с графиком уроков", "Согласие на обработку данных в боте", "Маркировка ИИ-контента"],
      out:[
        o('nflanding', 'передал оферту для лендинга', 'Оферта'),
        o('nfbot', 'отдал текст согласия для бота', 'Согласие 152-ФЗ'),
        o('you', 'собрал оферту', 'Оферта', 'Утвердите оферту')] },
    nfliaison: { dept:'neuro', contour:'hq', base:["briefing"], name:'Связь с главным офисом', role:'Отчёт главному офису и запросы ресурсов у его отделов', color:'#ffd166', screen:'doc', night:'tech', status:'working',
      tasks:["Отчёт недели главному офису", "Запрос монтажа у контент-студии", "Решения главного офиса — Штабу"],
      out:[
        o('you', 'положил отчёт для главного офиса', 'Отчёт главному офису', 'Прочитайте отчёт недели Нейроворонки'),
        o('shtab', 'передал решения главного офиса', 'Решения')] },
    // Стратегия и база знаний
    nfkb: { dept:'neuro', contour:'strategy', base:["audience", "market"], name:'База знаний', role:'Карты смыслов ЦА: боли, желания, триггеры, возражения, хуки', color:'#5ad1ff', screen:'doc', night:'meet', status:'working',
      tasks:["Собирает карту смыслов ЦА", "Библиотека хуков, приводящих кодовые слова", "Обновляет базу по цифрам недели"],
      out:[
        o('nfscripts', 'передал карту смыслов', 'Карта смыслов'),
        o('nfresearch', 'отдал библиотеку хуков', 'Хуки'),
        o('nfmethod', 'передал смыслы для уроков', 'Смыслы ЦА')] },
    nfoffer: { dept:'neuro', contour:'strategy', base:["market", "funnels"], name:'Оффер, цена и тарифы', role:'Оффер, тарифы (уроки / уроки + поддержка), лестница в Мастер-группу', color:'#ff9f43', screen:'doc', night:'meet', status:'thinking',
      tasks:["Утверждает оффер и цену", "Тарифы: уроки / уроки + поддержка", "Лестница до Мастер-группы"],
      out:[
        o('nflanding', 'передал оффер и тарифы', 'Оффер'),
        o('nfupsell', 'отдал лестницу продуктов', 'Лестница'),
        o('you', 'собрал оффер и тарифы', 'Оффер и тарифы', 'Утвердите оффер, цену и тарифы')] },
    brandkeeper: { dept:'neuro', contour:'strategy', base:["audience"], name:'Хранитель бренда', role:'Голос бренда и маркировка ИИ — сверяет с ними весь контент', color:'#d9b8ff', screen:'doc', night:'meet', status:'working',
      tasks:["Бренд-книга Нейроворонки", "Сверяет сценарий с голосом", "Живые вставки Ильи в VSL"],
      out:[
        o('nfscripts', 'вернул правки по голосу', 'Правки'),
        o('nflanding', 'передал формулировки оффера', 'Формулировки')] },
    nfvoice: { dept:'neuro', contour:'strategy', base:["chats", "audience"], name:'Голос клиента', role:'Боли, возражения и слова клиентов из переписок и бота', color:'#c38bff', screen:'chat', night:'meet', status:'working',
      tasks:["Разбирает переписки и бота", "Топ возражений", "Слова клиентов для хуков"],
      out:[
        o('nffollow', 'отдал ответы на возражения для дожима', 'Возражения'),
        o('nfkb', 'передал слова клиентов в базу', 'Слова клиентов')] },
    cases: { dept:'neuro', contour:'strategy', base:["scripts"], name:'Кейсы', role:'Кейсы «было — стало» — главный довод, и кейс самой воронки', color:'#ffcf6e', screen:'doc', night:'meet', status:'working',
      tasks:["Кейс самой воронки: кодовое слово → оплата", "Кейсы учеников после потока", "Отзывы для дожима"],
      out:[
        o('nffollow', 'передал кейсы для дожима', 'Кейсы'),
        o('nfscripts', 'отдал кейс для рилса', 'Кейс')] },
    // Контент-завод
    nfresearch: { dept:'neuro', contour:'content', base:["viral", "audience", "transcriber"], name:'Ресёрч трендов и конкурентов', role:'Тренды, залёты конкурентов и идеи для рилсов', color:'#ff8a3d', screen:'chart', night:'marketing', status:'working',
      tasks:["Ищет залёты в нише", "Расшифровывает референсы", "Идеи недели под кодовые слова"],
      out:[
        o('nfscripts', 'передал идеи недели', 'Идеи'),
        o('nfkb', 'отдал рабочие хуки', 'Хуки')] },
    nfscripts: { dept:'neuro', contour:'content', base:["scripts", "remake"], name:'Сценарии рилсов и каруселей', role:'Сценарии под ЦА, текст для аватара, подписи с кодовым словом', color:'#ff5d8f', screen:'doc', night:'marketing', status:'working',
      tasks:["Неделя сценариев за один цикл", "Текст для аватара", "Подписи с кодовым словом"],
      out:[
        o('nfavatar', 'передал текст для аватара', 'Текст'),
        o('nfcarousel', 'отдал текст карусели', 'Карусель'),
        o('nfqa', 'отдал на проверку', 'Сценарии')] },
    nfpublish: { dept:'neuro', contour:'content', base:["publish", "threads"], name:'Публикации и метки', role:'Контент-план, выход по дням, метка nf-… и кодовое слово на каждой единице', color:'#ffd166', screen:'calendar', night:'marketing', status:'working',
      tasks:["Контент-план на неделю", "Метки nf-… до выхода", "Маркировка ИИ в подписи"],
      out:[
        o('nftracking', 'передал метки публикаций', 'Метки'),
        o('nfwords', 'отдал кодовые слова недели', 'Кодовые слова')] },
    nfavatar: { dept:'neuro', contour:'content', base:["avatar"], name:'Аватар HeyGen', role:'Лицо и голос Ильи: ролики двойником, живые вставки', color:'#e0559c', screen:'video', night:'studio', status:'working',
      tasks:["Ролик двойником по тексту", "Голос-клон", "Где нужна живая вставка"],
      out:[
        o('nfvideo', 'передал ролик аватара в монтаж', 'Ролик аватара')] },
    nfvideo: { dept:'neuro', contour:'content', base:["montage", "remake"], name:'Монтаж рилсов и VSL', role:'Монтаж рилсов и VSL скиллами монтажа', color:'#ff9f43', screen:'timeline', night:'studio', status:'working',
      tasks:["Монтаж рилсов недели", "Монтаж VSL", "Субтитры и обложки"],
      out:[
        o('nfqa', 'сдал ролики на проверку', 'Ролики'),
        o('nfbot', 'отдал готовый VSL', 'VSL')] },
    nfcarousel: { dept:'neuro', contour:'content', base:["carousel"], name:'Карусели', role:'Карусели Instagram с кодовым словом', color:'#ffe08a', screen:'slides', night:'studio', status:'working',
      tasks:["Карусели недели", "Карусель по кейсу", "Обложки 4:5"],
      out:[
        o('nfqa', 'сдал карусели на проверку', 'Карусели')] },
    // Воронка и продажи
    nfwords: { dept:'neuro', contour:'funnels', base:["comments", "chats"], name:'Кодовые слова и автоответы', role:'Кодовые слова и автоответы в Директ только на API Meta', color:'#ffd166', screen:'chat', night:'sales', status:'working',
      tasks:["Подбирает кодовые слова под темы", "Автоответ за минуту", "Проверка: только официальный API"],
      out:[
        o('nfbot', 'передал переходы в бота', 'Переходы'),
        o('nftracking', 'отдал метки слов', 'Метки слов')] },
    nfbot: { dept:'neuro', contour:'funnels', base:["funnels", "chats"], name:'Бот и VSL', role:'Telegram-бот: старт, VSL, путь до ссылки на оплату', color:'#3ddc97', screen:'flow', night:'sales', status:'working',
      tasks:["Сценарий VSL", "Цепочка сообщений бота", "Путь до оплаты без команды"],
      out:[
        o('nfvideo', 'передал сценарий VSL в монтаж', 'Сценарий VSL'),
        o('nffollow', 'отдал события бота', 'События')] },
    nffollow: { dept:'neuro', contour:'funnels', base:["mailings", "closer"], name:'Дожим и сегменты', role:'Дожим 3–7 дней и теги по шагам в боте', color:'#5ad1ff', screen:'chat', night:'sales', status:'working',
      tasks:["Дожим 3–7 дней", "Теги: пришёл, досмотрел, кликнул, купил", "Сообщение каждому сегменту"],
      out:[
        o('nftracking', 'передал теги сегментов', 'Теги'),
        o('head', 'показал серию дожима', 'Серия дожима')] },
    nflanding: { dept:'neuro', contour:'funnels', base:["landings", "leadmagnet"], name:'Лендинг', role:'Лендинг: структура, тексты, дизайн, отзывы, FAQ', color:'#6366f1', screen:'code', night:'sales', status:'working',
      tasks:["Лендинг уроков", "Блоки отзывов и FAQ", "Utm-метки на кнопках"],
      out:[
        o('nfpay', 'подключил оплату на лендинг', 'Кнопки оплаты')] },
    nfpay: { dept:'neuro', contour:'funnels', base:["product"], name:'Оплата и доступ', role:'Две платёжки, чеки 54-ФЗ, автовыдача доступа', color:'#4fd18b', screen:'code', night:'tech', status:'working',
      tasks:["Российская платёжка с чеками 54-ФЗ", "Зарубежная платёжка", "Автовыдача доступа после оплаты"],
      out:[
        o('nfplatform', 'передал оплаты для выдачи доступа', 'Оплаты'),
        o('nftracking', 'отдал события оплат', 'Оплаты')] },
    // Продукт и ученики
    nfmethod: { dept:'neuro', contour:'product', base:["academy", "specs"], name:'Методист уроков', role:'Программа 8 уроков, сценарии уроков, шаблоны и скиллы для учеников', color:'#6ee7ff', screen:'doc', night:'analytics', status:'working',
      tasks:["Сценарий урока", "Шаблоны и бонусы", "График выхода уроков"],
      out:[
        o('nfslides', 'передал структуру урока', 'Структура урока'),
        o('nflessons', 'отдал сценарий урока на запись', 'Сценарий урока')] },
    nfslides: { dept:'neuro', contour:'product', base:["slides"], name:'Презентации уроков', role:'Слайды уроков и эфиров', color:'#4da3ff', screen:'slides', night:'analytics', status:'working',
      tasks:["Слайды урока", "Слайды эфира", "Шаблоны в стиле курса"],
      out:[
        o('nflessons', 'передал слайды на запись', 'Слайды')] },
    nflessons: { dept:'neuro', contour:'product', base:["avatar", "montage"], name:'Запись уроков', role:'Запись уроков аватаром или живым Ильёй, монтаж', color:'#e0559c', screen:'video', night:'analytics', status:'working',
      tasks:["Урок аватаром по сценарию", "Живые вставки Ильи", "Монтаж урока"],
      out:[
        o('nfplatform', 'загрузил урок на платформу', 'Урок')] },
    nfplatform: { dept:'neuro', contour:'product', base:["product", "academy"], name:'Платформа уроков', role:'Где живут уроки, доступ по расписанию', color:'#38c3d6', screen:'code', night:'tech', status:'working',
      tasks:["Выбор платформы: канал/бот или GetCourse", "Открытие уроков по расписанию", "Доступ после оплаты"],
      out:[
        o('nfprogress', 'передал данные прохождения', 'Прохождение')] },
    nfprogress: { dept:'neuro', contour:'product', base:["academy", "analytics"], name:'Успеваемость учеников', role:'Прохождение уроков, домашки, кто отстаёт', color:'#9be15d', screen:'chart', night:'analytics', status:'working',
      tasks:["Кто прошёл урок", "Кто отстаёт — напомнить", "Отчёт успеваемости потока"],
      out:[
        o('nfsupport', 'передал, кому нужна помощь', 'Отстающие'),
        o('cases', 'отдал лучших учеников для кейсов', 'Кандидаты в кейсы')] },
    nfsupport: { dept:'neuro', contour:'product', base:["consult", "chats"], name:'Поддержка учеников', role:'Ответ по оплате и доступу в течение рабочего дня', color:'#c38bff', screen:'chat', night:'analytics', status:'idle', needsInput:true,
      tasks:["Вопросы по доступу и оплате", "База ответов", "Сбор обратной связи"],
      out:[
        o('nfprogress', 'передал обратную связь', 'Обратная связь')] },
    nfupsell: { dept:'neuro', contour:'product', base:["closer", "launch"], name:'Апсейл в Мастер-группу', role:'Переход из уроков в старший продукт', color:'#ff5d6c', screen:'chat', night:'analytics', status:'working',
      tasks:["Переход в конце курса", "Предложение в боте", "Кандидаты из лучших учеников"],
      out:[
        o('head', 'передал заявки в Мастер-группу', 'Заявки')] },
    // Метрики и аналитика
    nfanalyst: { dept:'neuro', contour:'analytics', base:["analytics", "socialstats"], name:'Метрики воронки', role:'Конверсия каждого этапа и формула выручки', color:'#5ad1ff', screen:'chart', night:'ads', status:'working',
      tasks:["Сводка по этапам за неделю", "Самый слабый этап", "Гипотезы на улучшение"],
      out:[
        o('shtab', 'передал цифры этапов', 'Цифры'),
        o('nfkb', 'вернул выводы недели в базу знаний', 'Выводы')] },
    nftracking: { dept:'neuro', contour:'analytics', base:["analytics", "adreports"], name:'Сквозная аналитика и метки', role:'Метка на каждое кодовое слово и событие в боте → доход по слову', color:'#7ee0b5', screen:'chart', night:'ads', status:'working',
      tasks:["Метки слов и рилсов", "События бота в кабинет", "Доход по каждому кодовому слову"],
      out:[
        o('nfanalyst', 'передал доход по словам', 'Доход по словам')] },
    nfeconomics: { dept:'neuro', contour:'analytics', base:["finance", "billing"], name:'Экономика и инструменты', role:'Окупаемость воронки и стоимость инструментов', color:'#4fd18b', screen:'chart', night:'ads', status:'working',
      tasks:["Стоимость инструментов", "Окупаемость воронки", "Выручка на поток"],
      out:[
        o('you', 'собрал экономику воронки', 'Экономика', 'Посмотрите окупаемость Нейроворонки')] },
    nfads: { dept:'neuro', contour:'analytics', base:["metaads", "creatives", "adreports"], name:'Платный трафик', role:'Реклама Meta на рилсы и бота, если пойдёт платный трафик', color:'#ffb08a', screen:'ads', night:'ads', status:'working',
      tasks:["Тест связок", "Креативы из рилсов-победителей", "Маркировка рекламы"],
      out:[
        o('nftracking', 'передал расход и подписки', 'Расход')] },

    // Переговорная легенд
    hormozi: { dept:'council', name:'Алекс Хормози', role:'Оффер и ценность', color:'#ffd479', screen:'doc', night:'meet', status:'working',
      tasks:['Ждёт приглашения в разговор', 'Разбирает задачу своим методом', 'Спорит с советом'],
      out:[
        o('funnels', 'отдал усиленный оффер', 'Оффер'),
        o('you', 'разобрал ваш оффер', 'Разбор оффера', 'Посмотрите разбор оффера')] },
    garyvee: { dept:'council', name:'Гэри Вайнерчук', role:'Контент и внимание', color:'#ff7a59', screen:'media', night:'meet', status:'working',
      tasks:['Ждёт приглашения в разговор', 'Разбирает задачу своим методом', 'Спорит с советом'],
      out:[
        o('scripts', 'подсказал форматы для рилсов', 'Форматы контента'),
        o('publish', 'отдал план нарезки', 'План нарезки')] },
    godin: { dept:'council', name:'Сет Годин', role:'Бренд и позиционирование', color:'#c38bff', screen:'doc', night:'meet', status:'working',
      tasks:['Ждёт приглашения в разговор', 'Разбирает задачу своим методом', 'Спорит с советом'],
      out:[
        o('landings', 'отдал позиционирование для первого экрана', 'Позиционирование'),
        o('you', 'сформулировал позиционирование', 'Позиционирование', 'Утвердите позиционирование')] },
    brunson: { dept:'council', name:'Рассел Брансон', role:'Воронки и лестница ценности', color:'#3ddc97', screen:'flow', night:'meet', status:'working',
      tasks:['Ждёт приглашения в разговор', 'Разбирает задачу своим методом', 'Спорит с советом'],
      out:[
        o('funnels', 'нарисовал лестницу ценности', 'Лестница ценности'),
        o('slides', 'отдал структуру вебинара', 'Структура вебинара')] },
    walker: { dept:'council', name:'Джефф Уокер', role:'Запуски', color:'#5ad1ff', screen:'calendar', night:'meet', status:'working',
      tasks:['Ждёт приглашения в разговор', 'Разбирает задачу своим методом', 'Спорит с советом'],
      out:[
        o('launch', 'отдал план запуска по дням', 'План запуска'),
        o('mailings', 'передал письма предзапуска', 'Письма предзапуска')] },
    kennedy: { dept:'council', name:'Дэн Кеннеди', role:'Прямой отклик и тексты', color:'#ff5d8f', screen:'doc', night:'meet', status:'working',
      tasks:['Ждёт приглашения в разговор', 'Разбирает задачу своим методом', 'Спорит с советом'],
      out:[
        o('landings', 'переписал тексты лендинга', 'Тексты лендинга'),
        o('mailings', 'переписал письмо дожима', 'Письмо дожима')] },
    cardone: { dept:'council', name:'Грант Кардон', role:'Продажи и масштаб 10X', color:'#ff9f43', screen:'chat', night:'meet', status:'working',
      tasks:['Ждёт приглашения в разговор', 'Разбирает задачу своим методом', 'Спорит с советом'],
      out:[
        o('closer', 'отдал скрипт дожима', 'Скрипт дожима'),
        o('chats', 'передал ответы на возражения', 'Ответы на возражения')] },
    branson: { dept:'council', name:'Ричард Брэнсон', role:'Стратегия и план на 90 дней', color:'#4da3ff', screen:'chart', night:'meet', status:'working',
      tasks:['Ждёт приглашения в разговор', 'Разбирает задачу своим методом', 'Спорит с советом'],
      out:[
        o('you', 'принёс план на 90 дней', 'План на 90 дней', 'Утвердите план на 90 дней'),
        o('product', 'отдал приоритеты продуктов', 'Приоритеты')] },
    legends: { dept:'council', name:'Совет легенд', role:'Все восемь советников разбирают задачу вместе', color:'#ffe08a', status:'idle', now:'Совет собирается по вашей задаче', figure:false, },
  };
  const ids = Object.keys(list);
  window.OFFICE_AGENTS = {
    list,
    ids,
    // агенты отдела в порядке мест
    of:dept => ids.filter(id => list[id].dept === dept && list[id].figure !== false),
    // офис Нейроворонки: агенты контура
    ofContour:c => ids.filter(id => list[id].dept === 'neuro' && list[id].contour === c && list[id].figure !== false),
    // изменения из админ-панели владельца (сервер: DATA_DIR/office-patch.json → /api/assistant/office/patch.js, сразу после
    // этого файла; тот же патч накладывает assistant/office.mjs для диспетчера). Новые агенты — added; правки имени, роли,
    // цвета, отдела — agents; «в отпуске» (vacation) и удалённые (removed) уходят из офиса и каталога диспетчера, но остаются
    // в away — история задач и досье их помнят. hiddenTasks — задачи, скрытые от гостей.
    away:{},
    patch:null,
    apply(p) {
      if (!p || this.patch) return;
      this.patch = p;
      for (const [id, a] of Object.entries(p.added || {})) {
        list[id] = { screen:'doc', status:'working', tasks:['Ждёт первую задачу'], out:[], works:[], ...a, added:true };
        if (!ids.includes(id)) ids.push(id);
      }
      for (const [id, e] of Object.entries(p.agents || {})) {
        const a = list[id]; if (!a) continue;
        if (e.dept && e.dept !== a.dept) { delete a.room; delete a.night; }   // другой отдел — комната этого отдела
        for (const k of ['name', 'role', 'color', 'dept']) if (e[k]) a[k] = e[k];
      }
      for (const id of [...(p.vacation || []), ...(p.removed || [])]) {
        if (!list[id]) continue;
        this.away[id] = { ...list[id], away:(p.removed || []).includes(id) ? 'removed' : 'vacation' };
        delete list[id];
        const i = ids.indexOf(id); if (i >= 0) ids.splice(i, 1);
      }
    },
  };
})();
