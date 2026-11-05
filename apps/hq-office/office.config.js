/* Настройки офиса — единственный файл, который отличается у каждого клиента.
   Его собирает мастер настройки (setup.html); руками править не обязательно.

   brand     — название компании (шапка сайта и демо)
   offer     — главный продукт: подставляется в шаблоны задач агентов
   examples  — показывать примеры работ AICEX в досье агентов (false — только свои материалы)
   depts     — отделы по порядку комнат: руководитель; агенты отдела — из реестра agents.js (поле dept)
   agents    — правки карточек агентов: { id: { name, role, task, status } }
   products  — ссылки на продукты компании (досье «Разработка продуктов» и демо офиса)
   materials — свои работы и документы агентов: { id: [{ title, url }] }

   Внешность руководителя в 3D: look — 'm1' | 'm2' | 'm3' | 'f1' (или свои поля skin, hair…).
   photo — путь к фото лица (people/…jpg), model — своя 3D-модель .glb, если есть. */
window.OFFICE_CONFIG = {
  brand: 'AICEX',
  offer: 'Нейроворонка',
  examples: true,
  depts: [
    { id: 'ceo', name: 'Стратегия и продукт',
      head: { id: 'ilia', name: 'Илья', title: 'Основатель — стратегия, видение, продукт', look: 'm3' },
      agents: window.OFFICE_AGENTS.of('ceo') },
    { id: 'marketing', name: 'Отдел маркетинга',
      head: { id: 'firuza', name: 'Фируза', title: 'Руководитель отдела маркетинга', look: 'f1',
              photo: 'people/firuza-face.jpg', model: 'people/firuza.glb' },
      agents: window.OFFICE_AGENTS.of('marketing') },
    { id: 'sales', name: 'Отдел продаж',
      head: { id: 'bogdan', name: 'Богдан', title: 'РОП — руководитель отдела продаж', look: 'm1',
              photo: 'people/bogdan-face.jpg' },
      agents: window.OFFICE_AGENTS.of('sales') },
    { id: 'traffic', name: 'Реклама Meta',
      head: { id: 'nurken', name: 'Нуркен', title: 'Таргетолог — реклама в Meta', look: 'm2',
              photo: 'people/nurken-face.jpg' },
      agents: window.OFFICE_AGENTS.of('traffic') },
  ],
  // Переговорная легенд — ИИ-советники по методам легенд бизнеса (скилл «Команда 8 легенд»):
  // свой стол в переговорной, на собеседование и исправление деталей их зовёт владелец или диспетчер
  council: { id: 'council', name: 'Переговорная легенд', short: 'Легенды',
             agents: window.OFFICE_AGENTS.of('council'), board: 'legends' },
  // Офис Нейроворонки — третий стиль офиса (?theme=neuro): отдельная команда под план проекта (assistant/neuro-plan.md: 7 блоков системы,
  // 9 добавленных элементов, продукт и обязательства, метрики; файл на сайт не выкладывается). Агенты — agents.js (dept:'neuro', contour, base — наставники из главного
  // офиса: их скиллы и знания). Подчиняется главному офису: руководители те же, ваш стол — в Штабе, задачи — через общий рабочий стол,
  // проверка — вами. Работает сам: регламент — assistant/cabinet.mjs (ROUTINES), цифры и план — кабинет neuro/.
  // depts — группы руководителей для 3D (до четырёх, как в главном офисе); rooms — комнаты здания (night.js) под команду.
  neuro: {
    id: 'neuro', name: 'Офис Нейроворонки', brand: 'Нейроворонка', motto: 'КОНТЕНТ · БОТ · ЛЕНДИНГ · ОПЛАТА', cabinet: 'neuro/', plan: 'assistant/neuro-plan.md',
    start: '2026-11-10', end: '2026-11-30',
    contours: [
      { id: 'hq',        name: 'Штаб и запуск',           about: 'Оператор воронки, дорожная карта, контроль качества, оферта и юр. контур, связь с главным офисом' },
      { id: 'strategy',  name: 'Стратегия и база знаний', about: 'Блок 0: карта смыслов ЦА, оффер и тарифы, бренд, голос клиента, кейсы' },
      { id: 'content',   name: 'Контент-завод',           about: 'Блок 1: ресёрч, сценарии, аватар HeyGen, монтаж, карусели, публикации с метками' },
      { id: 'funnels',   name: 'Воронка и продажи',       about: 'Блоки 2–4: кодовые слова, бот и VSL, дожим и сегменты, лендинг, оплата и доступ' },
      { id: 'product',   name: 'Продукт и ученики',       about: 'Блок 5: уроки, презентации, запись, платформа, успеваемость, поддержка, апсейл' },
      { id: 'analytics', name: 'Метрики и аналитика',     about: 'Блок 6: конверсия этапов, сквозные метки, экономика, платный трафик' },
    ],
    depts: [
      { id: 'nf-hq', name: 'Штаб, запуск и продукт', short: 'Штаб', head: 'ceo', contours: ['hq', 'product'] },
      { id: 'nf-content', name: 'Стратегия и контент-завод', short: 'Контент', head: 'marketing', contours: ['strategy', 'content'] },
      { id: 'nf-funnels', name: 'Воронка и продажи', short: 'Воронка', head: 'sales', contours: ['funnels'] },
      { id: 'nf-launch', name: 'Метрики и аналитика', short: 'Метрики', head: 'traffic', contours: ['analytics'] },
    ],
    rooms: {
      ceo:       { name: 'Штаб и запуск', sub: 'Ваш стол · экран дня, дорожная карта, качество, оферта', dept: 'nf-hq' },
      meet:      { name: 'Стратегия и база знаний', sub: 'Карта смыслов, оффер, бренд, кейсы' },
      marketing: { name: 'Контент-завод', sub: 'Ресёрч, сценарии, публикации и метки', dept: 'nf-content' },
      studio:    { name: 'Студия', sub: 'Аватар HeyGen, монтаж, карусели' },
      sales:     { name: 'Воронка и продажи', sub: 'Кодовые слова, бот и VSL, дожим, лендинг', dept: 'nf-funnels' },
      analytics: { name: 'Продукт и ученики', sub: 'Уроки, презентации, успеваемость, поддержка' },
      ads:       { name: 'Метрики и аналитика', sub: 'Конверсии, метки, экономика, трафик', dept: 'nf-launch' },
      tech:      { name: 'Связь и доступы', sub: 'Главный офис, оплата, платформа уроков' },
      hub:       { name: 'Операционный зал кампании', sub: 'Находка → агент → проверка' },
    },
  },
  agents: {
    product: { task: 'Дорабатывает Persona Studio 2.0' },
    market:  { task: 'Собирает игровые концепции' },
    scripts: { task: 'Пишет 10 продающих рилсов' },
    threads: { task: 'Пишет 3 ветки на завтра' },
  },
  products: [
    { title: 'Транскрибация', url: 'https://transcribe.aicex.club', note: 'Расшифровка аудио и видео, Telegram Mini App' },
    { title: 'AI Creative Hub', url: 'https://aihub.aicex.club', note: 'Нейросети в одном месте и единый кошелёк токенов' },
    { title: 'Бот монтажа', url: 'https://reels.aicex.club', note: 'Монтаж рилсов кодом по готовым стилям' },
    { title: 'Мини-апп монтажа', url: 'https://montazh.aicex.club', note: 'Монтаж прямо в Telegram' },
    { title: 'Пак скиллов', url: 'https://skills.aicex.club', note: 'Готовые скиллы для Claude' },
    { title: 'Persona Train', url: 'https://persona-train.aicex.club', note: 'Клон голоса и аватар' },
    { title: 'Парсер «Залётный»', url: 'https://parser.aicex.club', note: 'Находит залетевшие рилсы в нише' },
    { title: 'AI Growth Office', url: 'https://office.aicex.club', note: 'Сайт ИИ-офиса' },
    { title: 'Маркетинг', url: 'https://marketing.aicex.club', note: 'Витрина работ отдела маркетинга' },
  ],
  materials: {
    threads: [{ title: 'Бот воронки Threads: карточки веток в теме «Threads»', url: 'https://t.me/c/3008075559/18787' }],
  },
};
