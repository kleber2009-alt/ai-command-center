/* Настройки офиса — единственный файл, который отличается у каждого клиента.
   Его собирает мастер настройки (setup.html); руками править не обязательно.

   brand     — название компании (шапка сайта и демо)
   offer     — главный продукт: подставляется в шаблоны задач агентов
   examples  — показывать примеры работ AICEX в досье агентов (false — только свои материалы)
   depts     — отделы по порядку комнат: руководитель и id агентов из каталога (agent-content.js)
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
      agents: ['product', 'market', 'briefing', 'specs', 'skills'] },
    { id: 'marketing', name: 'Отдел маркетинга',
      head: { id: 'firuza', name: 'Фируза', title: 'Руководитель отдела маркетинга', look: 'f1',
              photo: 'people/firuza-face.jpg', model: 'people/firuza.glb' },
      agents: ['slides', 'creatives', 'funnels', 'publish', 'analytics', 'audience',
               'scripts', 'montage', 'carousel', 'landings', 'leadmagnet', 'threads', 'avatar'] },
    { id: 'sales', name: 'Отдел продаж',
      head: { id: 'bogdan', name: 'Богдан', title: 'РОП — руководитель отдела продаж', look: 'm1',
              photo: 'people/bogdan-face.jpg' },
      agents: ['chats', 'comments', 'consult', 'mailings', 'closer'] },
    { id: 'traffic', name: 'Реклама Meta',
      head: { id: 'nurken', name: 'Нуркен', title: 'Таргетолог — реклама в Meta', look: 'm2',
              photo: 'people/nurken-face.jpg' },
      agents: ['metaads', 'adreports'] },
  ],
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
