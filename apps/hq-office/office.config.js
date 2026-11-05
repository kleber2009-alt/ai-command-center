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
  // Офис Нейроворонки — третий стиль офиса (?theme=neuro): отдельная команда кампании (agents.js, dept:'neuro') по модели аудита
  // отдела маркетинга 5.11. Подчиняется главному офису: руководители те же, ваш стол — в Штабе, задачи — через общий рабочий стол,
  // проверка — вами. Работает сам: каждое утро Штаб собирает экран дня, находки уходят агентам контуров (assistant/cabinet.mjs).
  // contours — 6 контуров (у каждого своя цифра в кабинете neuro/); depts — группы руководителей для 3D (до четырёх, как в главном офисе);
  // rooms — комнаты здания (та же планировка, что «Главный офис», night.js) под контуры.
  neuro: {
    id: 'neuro', name: 'Офис Нейроворонки', brand: 'Нейроворонка', motto: 'КАМПАНИЯ · МЕТКИ · ОПЛАТЫ', cabinet: 'neuro/',
    contours: [
      { id: 'hq',         name: 'Штаб',              about: 'Цель, экран дня, находки → задачи, связь с главным офисом' },
      { id: 'strategy',   name: 'Стратегия и бренд', about: 'Оффер, бренд-книга, голос клиента, кейсы' },
      { id: 'editorial',  name: 'Редакция',          about: 'Контент-план, сценарии, Threads и посты' },
      { id: 'production', name: 'Производство',      about: 'Рилсы и аватар, карусели и слайды, креативы' },
      { id: 'funnels',    name: 'Воронки',           about: 'Бот и прогрев, Директ, лендинг и лид-магнит' },
      { id: 'launch',     name: 'Запуски и трафик',  about: 'Запуск практикума, рассылки, реклама' },
    ],
    depts: [
      { id: 'nf-hq', name: 'Штаб и стратегия', short: 'Штаб', head: 'ceo', contours: ['hq', 'strategy'] },
      { id: 'nf-content', name: 'Редакция и производство', short: 'Контент', head: 'marketing', contours: ['editorial', 'production'] },
      { id: 'nf-funnels', name: 'Воронки', short: 'Воронки', head: 'sales', contours: ['funnels'] },
      { id: 'nf-launch', name: 'Запуски и трафик', short: 'Запуски', head: 'traffic', contours: ['launch'] },
    ],
    rooms: {
      ceo:       { name: 'Штаб кампании', sub: 'Ваш стол · цель, экран дня, находки', dept: 'nf-hq' },
      meet:      { name: 'Стратегия и бренд', sub: 'Оффер, бренд-книга, кейсы, голос клиента' },
      marketing: { name: 'Редакция', sub: 'Контент-план, сценарии, Threads', dept: 'nf-content' },
      studio:    { name: 'Производство', sub: 'Рилсы, аватар, карусели, креативы' },
      sales:     { name: 'Воронки', sub: 'Бот, Директ, лендинг', dept: 'nf-funnels' },
      ads:       { name: 'Запуски и трафик', sub: 'Запуск, рассылки, реклама', dept: 'nf-launch' },
      analytics: { name: 'Данные и метки', sub: 'Воронка из 8 шагов, метки nf-…' },
      tech:      { name: 'Связь с главным офисом', sub: 'Отчёт главному офису, запросы ресурсов' },
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
