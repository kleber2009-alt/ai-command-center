/* AI Growth Office — site content. Source of truth for agents: apps/ai-office/index.html (AGENTS),
   plans: apps/ai-office/pricing.html. Leads go to the same Supabase `leads` table as apps/ai-office/config.js. */
window.SITE = {
  name: 'AI Growth Office',
  leads: {
    send: function (p) {
      var URL = 'https://cslvbnladhfjrdbtnwkm.supabase.co', KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzbHZibmxhZGhmanJkYnRud2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODk2NzYsImV4cCI6MjA5NDE2NTY3Nn0.0VjY3ihxWMjDRBoWpPQiAAKEYRveKKbUHzt4969kATk';
      var row = {
        name: p.name || null, telegram: p.contact || null, email: p.email || null,
        niche: p.niche || null, goal: p.goal || null, main_problem: p.message || null,
        recommended_agents: p.item ? [p.item] : [], source: 'ai_office_noir:' + (p.source || 'form')
      };
      var text = ['*Новая заявка — AI Office (noir)*', '', p.name && '👤 ' + p.name, p.contact && '💬 ' + p.contact, p.email && '📧 ' + p.email,
        p.item && '🤖 ' + p.item, p.niche && '📌 ' + p.niche, p.goal && '🎯 ' + p.goal, p.when && '🕐 ' + p.when, p.message && '📝 ' + p.message, '', 'Форма: ' + p.source + ' · ' + p.page].filter(Boolean).join('\n');
      return Promise.allSettled([
        fetch(URL + '/rest/v1/leads', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY, Prefer: 'return=minimal' }, body: JSON.stringify(row) }),
        fetch('/api/notify-tg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, parse_mode: 'Markdown' }) })
      ]);
    }
  }
};

(function () {
  var G = ['img/wide.jpg', 'img/top.jpg', 'img/side.jpg', 'img/low.jpg'];
  var TERMS = ['Free — 0 ₽: 1 отдел на выбор, 3 запуска сценариев в месяц', 'Pro — 1 990 ₽/мес: все 3 отдела, 34 агента, безлимит запусков', 'Team — 4 990 ₽/мес: 5 мест, общий контекст команды', 'Возврат 14 дней, если не было запусков'];
  function A(o) {
    o.img = 'img/agent-' + o.id + '.jpg';
    o.gallery = [o.img].concat(G);
    o.meta = [o.group, o.tasks.length + ' задачи', '24/7'];
    o.price = o.role; o.sub = o.group;
    o.loc = 'Отдел «' + o.group + '»'; o.ref = 'Агент · ' + o.code;
    o.nums = [[String(o.tasks.length), 'ключевые задачи'], ['24/7', 'онлайн'], ['~3', 'мин на задачу']];
    o.features = o.tasks.concat(o.extra);
    o.spec = [['Отдел', o.group], ['Роль', o.role], ['Режим', '24/7, без выходных'], ['Время на задачу', '≈ 3 минуты'],
      ['Формат результата', 'PDF · DOCX · Markdown'], ['Работает в паре с', o.pair], ['Память', 'контекст вашего бизнеса'], ['Код', o.code]];
    o.terms = TERMS;
    return o;
  }
  var items = [
    A({ id: 'alisa', code: 'AO-SAL-01', name: 'Алиса', role: 'AI-продажник', group: 'Продажи', tag: 'Хит', tagStyle: 'acc', pair: 'Лео, Хантер',
      tasks: ['Скрипты продаж в Direct', 'Тексты прогрева', 'Дожимные сообщения'], extra: ['Отработка возражений', 'Офферы без давления'],
      about: 'Алиса ведёт переписку так, как её вёл бы ваш лучший менеджер: знает продукт, слышит клиента и не давит. Пишет скрипты для Direct и Telegram, цепочки прогрева и дожимы, разбирает возражения и превращает «я подумаю» в оплату.',
      f: { dept: 'Продажи', goal: ['Больше заявок', 'Выше конверсия'] } }),
    A({ id: 'hunter', code: 'AO-CNT-02', name: 'Хантер', role: 'Мастер хуков', group: 'Контент', tag: 'Хит', tagStyle: 'acc', pair: 'Марк, Алиса',
      tasks: ['Первые 3 секунды Reels', 'Заголовки каруселей', 'A/B-тест хуков'], extra: ['Банк заходов под нишу', 'Обложки, которые кликают'],
      about: 'Хантер отвечает за то, чтобы ваш контент вообще посмотрели. Он пишет первые три секунды Reels, заголовки каруселей и обложки, собирает банк заходов под вашу нишу и проверяет хуки в A/B-тестах.',
      f: { dept: 'Контент', goal: ['Больше охватов'] } }),
    A({ id: 'max', code: 'AO-CEO-00', name: 'Макс', role: 'CEO-агент', group: 'Управление', tag: 'Координатор', tagStyle: 'ghost', pair: 'София, Оскар',
      tasks: ['Ставит стратегические приоритеты', 'Контролирует финансовый результат', 'Собирает отчёты от агентов'], extra: ['Распределяет задачи по отделам', 'Еженедельный отчёт владельцу'],
      about: 'Макс — руководитель офиса. Он принимает вашу цель, раскладывает её на задачи для отделов, следит, чтобы агенты передавали работу друг другу без потерь, и раз в неделю приносит отчёт: что сделано, что дало результат, что дальше.',
      f: { dept: 'Управление', goal: ['Больше заявок', 'Понять цифры'] } }),
    A({ id: 'sofia', code: 'AO-STR-01', name: 'София', role: 'AI-стратег', group: 'Стратегия', tag: 'Новое', pair: 'Макс, Ника',
      tasks: ['Анализ ниши и конкурентов', 'Сегментация аудитории', 'Поиск точек роста'], extra: ['Позиционирование', 'План на 90 дней'],
      about: 'София начинает с вопроса «где деньги». Разбирает нишу и конкурентов, делит аудиторию на сегменты, находит точки роста и собирает план на 90 дней с конкретными цифрами, а не «больше охватов».',
      f: { dept: 'Стратегия', goal: ['Упаковать продукт', 'Понять цифры'] } }),
    A({ id: 'mark', code: 'AO-CNT-01', name: 'Марк', role: 'Контент-продюсер', group: 'Контент', pair: 'Хантер, Трендбот',
      tasks: ['Идеи для Reels', 'Карусели', 'Сценарии'], extra: ['Контент-план на 30 дней', 'Лонгриды для Telegram'],
      about: 'Марк — контент-фабрика офиса. Генерирует идеи для Reels, пишет карусели и сценарии, собирает контент-план на месяц под вашу цель и превращает один экспертный тезис в серию публикаций для разных площадок.',
      f: { dept: 'Контент', goal: ['Больше охватов'] } }),
    A({ id: 'leo', code: 'AO-SAL-02', name: 'Лео', role: 'Архитектор воронок', group: 'Продажи', pair: 'Алиса, Ника',
      tasks: ['Проектирование воронки', 'Автоворонки', 'Оптимизация конверсий'], extra: ['Лид-магниты', 'Карта пути клиента'],
      about: 'Лео строит путь клиента от первого касания до оплаты: лид-магнит, прогрев, точка продажи, дожим. Собирает автоворонки в боте и Директе и ищет шаг, на котором теряется больше всего людей.',
      f: { dept: 'Продажи', goal: ['Больше заявок', 'Выше конверсия'] } }),
    A({ id: 'nika', code: 'AO-ANL-01', name: 'Ника', role: 'AI-аналитик', group: 'Аналитика', pair: 'Лео, София',
      tasks: ['Анализ охватов и ER', 'Подсчёт конверсий', 'Расчёт ROMI'], extra: ['KPI-таблица до/после', 'Отчёт с решениями'],
      about: 'Ника переводит цифры в решения. Считает охваты, вовлечённость, конверсии воронки и ROMI, показывает, какой контент и какие каналы приносят деньги, и что из этого стоит усилить на следующей неделе.',
      f: { dept: 'Аналитика', goal: ['Понять цифры', 'Выше конверсия'] } }),
    A({ id: 'trend', code: 'AO-ANL-02', name: 'Трендбот', role: 'Трендвотчер', group: 'Аналитика', tag: 'Новое', pair: 'Марк, Хантер',
      tasks: ['Мониторинг трендов', 'Анализ конкурентов', 'Вирусные форматы'], extra: ['Подборка залётных роликов', 'Адаптация под нишу'],
      about: 'Трендбот каждый день смотрит, что взрывается в вашей нише и рядом с ней, разбирает залётные ролики конкурентов и приносит Марку и Хантеру форматы, которые стоит адаптировать прямо сейчас.',
      f: { dept: 'Аналитика', goal: ['Больше охватов'] } }),
    A({ id: 'oscar', code: 'AO-PRD-01', name: 'Оскар', role: 'Продуктовый архитектор', group: 'Продукт', pair: 'Макс, Вера',
      tasks: ['Упаковка тарифов', 'Создание офферов', 'Программа курса'], extra: ['Линейка продуктов', 'Ценообразование'],
      about: 'Оскар упаковывает то, что вы умеете, в продукт, который покупают: линейка тарифов, офферы, программа курса или наставничества, цены и аргументы, почему это стоит своих денег.',
      f: { dept: 'Продукт', goal: ['Упаковать продукт'] } }),
    A({ id: 'vera', code: 'AO-QA-01', name: 'Вера', role: 'Контроль качества', group: 'Продукт', pair: 'Оскар, Марк',
      tasks: ['Проверка текстов', 'Аудит офферов', 'Финальная вычитка'], extra: ['Соответствие тону бренда', 'Чек-лист перед публикацией'],
      about: 'Вера — последний взгляд перед публикацией. Вычитывает тексты, проверяет офферы и обещания, следит за тоном бренда и не пропускает того, за что потом бывает неловко.',
      f: { dept: 'Продукт', goal: ['Выше конверсия', 'Упаковать продукт'] } })
  ];
  var ORDER = ['Управление', 'Стратегия', 'Контент', 'Продажи', 'Аналитика', 'Продукт'];
  window.SITE_DATA = {
    detailPage: 'agent.html',
    items: items,
    filters: [
      { key: 'dept', label: 'Отдел', values: ORDER },
      { key: 'goal', label: 'Цель', values: ['Больше охватов', 'Больше заявок', 'Выше конверсия', 'Понять цифры', 'Упаковать продукт'] }
    ],
    sorts: {
      f: { label: 'Рекомендуемые', fn: null },
      dept: { label: 'По отделам', fn: function (a, b) { return ORDER.indexOf(a.group) - ORDER.indexOf(b.group); } },
      az: { label: 'По имени', fn: function (a, b) { return a.name.localeCompare(b.name, 'ru'); } }
    }
  };
})();
