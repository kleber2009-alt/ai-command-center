/* Работы агентов для hq2 — то, чего нет в копиях с hq.aicex.club (agent-content.js, dept-content.js),
   поэтому эти файлы можно и дальше обновлять копированием.

   Вкладка досье «Готовые работы» и вкладка панели «Работы» собираются сами: витрина из досье
   (results, artifacts) + всё, что есть у агента в истории задач (tasks.js, tasks.auto.js) —
   видео, картинки, живые страницы, документы Claude, сайты, код на GitHub, файлы.
   Здесь только добавки:

   previews — превью для ссылки: адрес сайта или страницы → картинка. Сняты с живых публичных
              страниц (works/sites, works/pages); закрытые страницы и артефакты Claude не снимаем.
   agents   — дополнительные блоки работ агента в формате results из agent-content.js
              ({ type:'links' | 'gallery' | 'videos' | 'frames', title, items }). Только реальные работы.
   skills   — скиллы агента сверх досье: SK(name, title, desc, say). */
window.OFFICE_WORKS = (() => {
  const MK = 'https://marketing.aicex.club/assets/pages/';
  const SK = (name, title, desc, say) => ({ name, title, desc, say });
  const site = host => [`https://${host}.aicex.club`, `works/sites/${host}.jpg`];
  const page = (p, img) => [MK + p, `works/pages/${img}.jpg`];
  return {
    previews: Object.fromEntries([
      site('transcribe'), site('aihub'), site('persona-train'), site('parser'), site('office'), site('marketing'),
      site('dashboard'), site('hq'), site('hq2'), site('montazh'), site('reels'), site('skills'),
      ['https://hq.aicex.club/?game', 'works/sites/hq.jpg'],
      page('copper/deck/index.html', 'copper-deck'), page('webinar/index.html', 'webinar'),
      page('landing-a1.html', 'landing-a1'), page('landing-a2.html', 'landing-a2'), page('landing-a3.html', 'landing-a3'),
      page('landing-a4.html', 'landing-a4'), page('landing-a5.html', 'landing-a5'),
      page('copper/site/index.html', 'copper-site'), page('copper/site-light/index.html', 'copper-site-light'),
      page('presentation-svyazka.html', 'presentation-svyazka'),
    ]),
    agents: {
      mailings: [{ type:'links', title:'Рассылки практикума', items:[
        { title:'19 рассылок в боте @helperpaliybot', url:'https://t.me/helperpaliybot',
          note:'24–26 октября, ChatPlace: напоминания перед эфирами практикума, приглашения в бота и запись эфира' },
      ] }],
    },
    skills: {
      consult: [
        SK('direct-ai-weekly-review', 'Разбор ИИ в Директе', 'Раз в неделю читает переписки ИИ-менеджера в ChatPlace и готовит отчёт с правками; правки — после «ок» основателя.', 'разбери ИИ в Директе за неделю'),
        SK('direct-materials-catalog', 'Каталог подарков', 'Пересканирует Telegram-канал и обновляет каталог бесплатных материалов и правила обоих агентов ChatPlace.', 'обнови каталог материалов для ИИ в Директе'),
      ],
    },
  };
})();
