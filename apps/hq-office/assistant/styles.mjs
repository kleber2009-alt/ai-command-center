/* Стили креативов и аватары по умолчанию — выбор человека в «Кабинете» (account/index.html → «Стили и аватары»).

   CATS — разделы: рилсы и монтаж, карусели, презентации, сайты. У каждого стиля превью (картинка с сайта офиса или
   «макет» — цвета для нарисованной карточки), скилл и описание для агента. Плюс скиллы исполнителя того же вида
   (`extra(serverSkills)`), чтобы в кабинете был весь список.
   prefs: DATA_DIR/prefs.json { <uid>: { styles:{ video, carousel, slides, landing }, avatars:[{id,name,preview,voice}], bag:[…] } }.
   Офис (desk.mjs) берёт стиль по умолчанию вместо вопроса «в каком стиле?», аватар — по кругу в случайном порядке. */
import fs from 'node:fs';
import path from 'node:path';

const mock = (bg, ink, acc, font = 'sans') => ({ bg, ink, acc, font });
const KADRIK = 'стиль Студии Кадрика (Creator Pack): найди скилл стиля в ~/.claude/skills по названию';

const MONTAZH = [
  ['palii', 'Палий', 'лайм, светлый сплит'], ['sticker', 'Стикер', 'слова на наклейках'], ['journal', 'Журнал', 'антиква, ч/б'],
  ['neon', 'Неон', 'тёмный, капс, свечение'], ['cream', 'Крем', 'мягкий, округлый шрифт'], ['apple', 'Apple', 'белый, субтитры в пилюле'],
  ['tech', 'Тех-обзор', 'слово на плашке'], ['arena', 'Арена', 'бумага, пиксельные агенты'], ['kobalt', 'Кобальт', 'синие студии, караоке'],
  ['uimotion', 'UI-моушн', 'стекло, тумблеры, 3D'], ['scheme', 'Схема', 'неоновая схема'], ['razbor', 'Разбор', 'сетка, окно запроса'],
  ['montazhka', 'Монтажка', 'фиолет, зерно, UI монтажки'], ['promo', 'Промо-история', 'iOS-интерфейс, 3D-эмодзи'], ['dvoinik', 'Двойник', 'антиква за спиной, команды'],
  ['shemaava', 'Схема + аватар', 'растущая схема, лайм'], ['duel', 'Дуэль', 'две версии, VS, раунды'], ['dueljournal', 'Дуэль-журнал', 'крем, антиква, две панели'],
  ['pixel', 'Пиксель', 'обычный vs мой промпт'], ['bluecaps', 'Синий капс', 'перебивки, B-roll, мемы'], ['promostory', 'Промо без лица', 'промо 12 с без лица'],
  ['pulse', 'Пульс', 'промо продукта, коралл на тёмном'], ['vibecode', 'Вайбкод', 'графит, караоке, UI-экраны'], ['aura', 'Аура', 'главы, цветное свечение, 3D'],
  ['gloss', 'Глянец', 'Apple-стиль, плитки, лицо снизу'], ['hud', 'HUD', 'HUD-шапка, хром за головой, стекло'],
];
const KARUSEL = [
  ['palii', 'Палий', 'лайм, жирный гротеск'], ['sticker', 'Стикер', 'слова на наклейках'], ['journal', 'Журнал', 'антиква, курсив, ч/б'],
  ['neon', 'Неон', 'тёмный, капс, свечение'], ['cream', 'Крем', 'мягкий, округлый'], ['apple', 'Apple', 'белый, синий акцент'],
  ['tech', 'Тех-обзор', 'жёлтый капс со свечением'], ['arena', 'Арена', 'бумага, пиксельные агенты'], ['kobalt', 'Кобальт', 'синие студии, 3D'],
  ['uimotion', 'UI-моушн', 'стекло, тумблеры, 3D-игрушки'], ['scheme', 'Схема', 'неоновая схема'], ['razbor', 'Разбор', 'сетка, окно запроса'],
  ['montazhka', 'Монтажка', 'фиолет, зерно, UI монтажки'], ['promo', 'Промо-история', 'iOS-интерфейс, эмодзи'], ['dvoinik', 'Двойник', 'антиква за спиной, лайм'],
  ['youtube', 'YouTube · ЭМ', 'окно macOS, зелёная цифра'], ['bluecaps', 'Синий капс', 'синий узкий капс, скрины'], ['duel', 'Дуэль', 'две версии, VS, раунды'],
  ['dueljournal', 'Дуэль-журнал', 'крем, антиква, две панели'], ['pixel', 'Пиксель', 'обычный vs мой промпт'], ['shemaava', 'Схема + аватар', 'лаймовая схема-орбита, лицо'],
  ['pulse', 'Пульс', 'промо, коралл на коричневом'], ['vibecode', 'Вайбкод', 'рамка Figma, UI-карточки'], ['aura', 'Аура', 'главы со свечением'],
];

// Creator Pack reels of «Студия Кадрика» (pack/public/skills.json, kind reels) — every one is its own skill on the runner
const CREATOR = [
  ['personal-short-form-reels', 'Личный рилс', 'B-roll, слово-субтитры', 'personal-short-form'], ['visual-essay-reel', 'Видеоэссе', 'вырез, стена доказательств'],
  ['cutout-backdrop-reel', 'Вырез на фоне', 'картинка на каждую мысль'], ['cutout-grid-reel', 'Вырез в сетке 2×2', '4 картинки, ты в центре'],
  ['image-cluster-reel', 'Облако картинок', 'метафоры над головой'], ['depth-ui-reel', 'Интерфейсы за спиной', 'UI за головой, весь кадр'],
  ['ranking-format', 'Тир-лист', 'таблица S–F'], ['split-reel', 'Сплит-рилс', 'лицо сверху, схемы снизу'],
  ['broll-stacked-text-edit', 'B-roll + стопка текста', 'B-roll, субтитры, стопки'], ['fitted-stacked-captions', 'Плотные субтитры', 'большое слово + мелкие вокруг'],
  ['tiktok-style-edit', 'TikTok-стиль', 'без пауз, субтитры с обводкой'], ['big-type-stack', 'Крупный текст за спиной', 'хук огромными буквами за головой'],
  ['cinematic-type-reel', 'Кинотитры', 'кадр меняется каждые 1–3 с'], ['yap-and-show', 'Говорю и показываю', 'доказательства над головой'],
  ['natural-story-reel', 'Спокойная история', 'картинки за спиной, твоя комната'], ['top-five-ranking', 'Топ-5', 'доска 1–5, карточки по местам'],
  ['this-versus-that-format', 'То или это', 'две колонки: всегда / никогда'], ['if-then-grid-reel', 'Сетка «если → то»', 'цветная таблица по ячейке'],
  ['rapid-list', 'Быстрый список', 'длинный список, растёт на экране'], ['clone-versus-reel', 'Клон против клона', 'ты дважды в кадре, X vs Y'],
  ['dual-role-dialogue', 'Диалог с собой', 'новичок и эксперт, 2 записи'], ['origin-story-reel', 'История пути', 'фото по годам, дроп музыки'],
  ['vlog-editor', 'Влог', 'клипы дня или поездки по порядку'],
  // long videos and clips of Kadrik's «YouTube» and «Клипы» tabs
  ['educational-youtube-editor', 'Обучающее YouTube-видео', 'длинное 16:9, визуал по смыслу'], ['split-screen-document-plus-animations', 'Документ + ты', 'урок с документом на экране', 'split-screen-document'],
  ['tips-breakdown-youtube', 'Разбор советов', 'видео-список, глава на пункт'], ['soft-teacher', 'Урок у доски', 'доска, печатные главы'],
  ['screen-camera-tutorial', 'Экран + камера', 'туториал в раскладках Tella'], ['ear-to-ear-captions', 'Субтитры у ушей', 'горизонтальное видео, слова по бокам от головы'],
  ['youtube-clips', 'Клипы из YouTube', 'лучшие моменты длинного видео → шортсы'], ['coaching-call-clips', 'Клипы из созвона', 'коучинг, Q&A, Zoom → клипы'],
];
// skills behind the Kadrik styles above (skill:'' there) — so they are not listed a second time as bare skill cards
const KADRIK_SKILLS = ['montazh-rils', 'montazh-rils-kobalt', 'montazh-rils-scheme', 'montazh-rils-arena', 'montazh-rils-uimotion',
  'montazh-rils-gloss', 'montazh-rils-hud', 'montazh-rils-vibecode', 'montazh-rils-aura', 'promo-pulse'];

export const CATS = [
  { id:'video', name:'Рилсы и монтаж', ask:'В каком стиле смонтировать ролик?', ratio:'9/16', styles:[
    { id:'glass-explainer-reel', label:'Стеклянная объяснялка', skill:'glass-explainer-reel', img:'media/videos/glass-explainer.jpg', about:'крупные планы и панель снизу, сверху бизнес-графика на стеклянных карточках, уведомления, счётчики' },
    { id:'explainer-panel-reel', label:'Панель-объяснялка', skill:'explainer-panel-reel', img:'media/videos/explainer-panel.jpg', about:'та же панель, графика чище: заголовки, нумерованные пункты, схемы — для пошаговых роликов' },
    { id:'business-short-form-reels', label:'Бизнес-рилс', skill:'business-short-form-reels', mock:mock('#0e1116', '#fff', '#7fd3ff'), about:'текстовый хук, ротация «ты на весь экран / сплит / анимация», стеклянные плашки, окна Docs и Notion' },
    { id:'reels-herk', label:'Как у Nate Herk', skill:'reels-herk', mock:mock('#111', '#fff', '#ff7a1a'), about:'сплит, тёмные боксовые титры, логотипы-плитки, 3D-скрины, терминал-карточки' },
    { id:'reels-promo-face', label:'Промо-история с лицом', skill:'reels-promo-face', img:'media/montazh-styles/promo.jpg', about:'кинетический хук, поиск с шайбой, светлый iOS-интерфейс, 3D-эмодзи, кодовое слово' },
    ...MONTAZH.map(([id, label, about]) => ({ id:'kadrik-' + id, label, skill:'', img:`media/montazh-styles/${id}.jpg`, about:`${about}; ${KADRIK} «${label}» (${id})` })),
    { id:'kadrik-youtube', label:'YouTube · длинное', skill:'montazh-dlinnogo-video-youtube', img:'media/montazh-styles/youtube.jpg', about:'16:9, скринкаст в окнах; длинное видео для YouTube в стиле Студии Кадрика' },
    ...CREATOR.map(([skill, label, about, img]) => ({ id:skill, label, skill, img:`media/creator-styles/${img || skill}.jpg`, about:`${about}; стиль Creator Pack «Студии Кадрика», скилл ${skill}` })),
  ] },
  { id:'carousel', name:'Карусели', ask:'В каком стиле сделать карусель?', ratio:'4/5', styles:[
    { id:'carousel-dark', label:'Тёмный @ilia.paliy', skill:'carousel-pro', mock:mock('#0a0a0a', '#f4efe6', '#ff8a3d', 'serif'), about:'основной формат: чёрный фон, тёплое свечение, Jost, оранжевый курсив, капсулы' },
    { id:'carousel-light', label:'Светлый @ilia.paliy', skill:'carousel-pro', mock:mock('#f4f1ea', '#111', '#ff8a3d'), about:'тёмный текст на светлом фоне, белые карточки, капс-обложка' },
    { id:'carousel-photo', label:'Обложка с вашим фото', skill:'carousel-pro', mock:mock('#2a2420', '#fff', '#ff8a3d'), about:'обложка на вашем фото (или образ двойника HeyGen), дальше — тёмный формат' },
    ...KARUSEL.map(([id, label, about]) => ({ id:'kadrik-' + id, label, skill:'', img:`media/karusel-styles/${id}.jpg`, about:`${about}; ${KADRIK} «${label}» (${id})` })),
  ] },
  { id:'slides', name:'Презентации', ask:'В каком стиле сделать презентацию?', ratio:'16/10', styles:[
    { id:'deck-copper', label:'Медь', skill:'', img:'works/pages/copper-deck.jpg', about:'тёмный фон, медное свечение, антиква с курсивом — как эфир «Монтаж рилсов с Claude»' },
    { id:'deck-leadmagnet', label:'Лид-магнит', skill:'', img:'works/pages/presentation-svyazka.jpg', about:'светлый лист, крупный чёрный гротеск, фиолетовый акцент — как «Первые 10 000»' },
    { id:'deck-sky', label:'Небо', skill:'', img:'works/pages/webinar.jpg', about:'небо и облака, стеклянные карточки интерфейса — как урок «Блог с 0 до 10 000»' },
    { id:'theme-ocean', label:'Ocean Depths', skill:'theme-factory', mock:mock('#0b2a3c', '#e6f3f8', '#3fb6d8'), about:'тема theme-factory «Ocean Depths»: глубокий синий, бирюза' },
    { id:'theme-sunset', label:'Sunset Boulevard', skill:'theme-factory', mock:mock('#2b1320', '#fff1e6', '#ff7a59'), about:'тема theme-factory «Sunset Boulevard»: тёплый закат' },
    { id:'theme-forest', label:'Forest Canopy', skill:'theme-factory', mock:mock('#13261b', '#eef5ec', '#6fbf73'), about:'тема theme-factory «Forest Canopy»: лесной зелёный' },
    { id:'theme-minimal', label:'Modern Minimalist', skill:'theme-factory', mock:mock('#f7f7f5', '#141414', '#141414'), about:'тема theme-factory «Modern Minimalist»: белый, чёрный, воздух' },
    { id:'theme-golden', label:'Golden Hour', skill:'theme-factory', mock:mock('#1d160c', '#fbf3df', '#e3b04b', 'serif'), about:'тема theme-factory «Golden Hour»: золото на тёмном' },
    { id:'theme-arctic', label:'Arctic Frost', skill:'theme-factory', mock:mock('#eef4f8', '#14263a', '#4a90c2'), about:'тема theme-factory «Arctic Frost»: холодный светлый' },
    { id:'theme-desert', label:'Desert Rose', skill:'theme-factory', mock:mock('#f3e6dc', '#3b2622', '#c97b6a', 'serif'), about:'тема theme-factory «Desert Rose»: пудровый, терракота' },
    { id:'theme-tech', label:'Tech Innovation', skill:'theme-factory', mock:mock('#0a0f1f', '#e8ecff', '#5b7cff'), about:'тема theme-factory «Tech Innovation»: тёмный, электрик' },
    { id:'theme-botanical', label:'Botanical Garden', skill:'theme-factory', mock:mock('#f1f3e8', '#22301f', '#7a9a4b', 'serif'), about:'тема theme-factory «Botanical Garden»: светлый, оливковый' },
    { id:'theme-galaxy', label:'Midnight Galaxy', skill:'theme-factory', mock:mock('#120c2a', '#efeaff', '#a77bff'), about:'тема theme-factory «Midnight Galaxy»: фиолетовый космос' },
  ] },
  { id:'landing', name:'Сайты и лендинги', ask:'В каком стиле сделать сайт?', ratio:'16/10', styles:[
    { id:'landing-gold', label:'Золото', skill:'landing-gold', img:'works/pages/landing-a1.jpg', about:'чёрный фон, золотой акцент, фото эксперта, бонус и гарантия, таймер' },
    { id:'landing-light', label:'Светлый', skill:'landing-light', img:'works/pages/landing-a2.jpg', about:'светлый фон, чёрный капс, оранжевая кнопка, карточки бонусов' },
    { id:'landing-neon', label:'Неон', skill:'landing-neon', img:'works/pages/landing-a3.jpg', about:'тёмно-синий, белый капс с синим акцентом, свечение' },
    { id:'landing-emerald', label:'Изумруд', skill:'landing-emerald', img:'works/pages/landing-a4.jpg', about:'чёрный с изумрудно-зелёным, капс-заголовок, зелёная кнопка' },
    { id:'landing-poster', label:'Постер', skill:'landing-poster', img:'works/pages/landing-a5.jpg', about:'плакатный капс на тёмно-зелёном, крупное фото со сцены' },
    { id:'site-copper', label:'Медь тёмная', skill:'', img:'works/pages/copper-site.jpg', about:'тёмный, медное свечение, антиква с курсивом' },
    { id:'site-copper-light', label:'Медь светлая', skill:'', img:'works/pages/copper-site-light.jpg', about:'та же «Медь» на светлом фоне' },
  ] },
];
const BY_CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
// skills of the runner of the same kind — to show the whole list in the cabinet and in the style question
const SKILL_RE = { video:/reel|rils|montazh|montage|монтаж|рилс/i, carousel:/carousel|karusel|карусел/i, slides:/deck|slides|pptx|presentation|презентац|theme/i, landing:/landing|лендинг|site|сайт/i };
const SKIP = new Set(['remake-top-reel', 'carousel-pro', 'ilia-carousel-style', 'reels-script', 'montazh-dlinnogo-video-youtube', 'pptx', 'theme-factory', 'web-artifacts-builder']);

export function catalog(serverSkills = []) {
  return CATS.map(c => {
    const have = new Set([...c.styles.map(s => s.skill).filter(Boolean), ...(c.id === 'video' ? KADRIK_SKILLS : [])]), extra = [];
    for (const x of serverSkills) {
      const name = String(x.name || '');
      const hay = c.id === 'video' ? name : name + ' ' + String(x.description || '').slice(0, 120);  // video: by the name only — skills that just mention reels (competitors, strategies) are not montage
      if (!name || have.has(name) || SKIP.has(name) || !SKILL_RE[c.id].test(hay)) continue;
      have.add(name);
      extra.push({ id:'skill-' + name, label:name, skill:name, about:String(x.description || '').replace(/\s+/g, ' ').slice(0, 160), skillOnly:true });
    }
    return { id:c.id, name:c.name, ratio:c.ratio, styles:[...c.styles, ...extra] };
  });
}
export const findStyle = (cat, id, serverSkills = []) => catalog(serverSkills).find(c => c.id === cat)?.styles.find(s => s.id === id) || null;
export const catOf = id => BY_CAT[id] || null;

export function createPrefs(dataDir) {
  const FILE = path.join(dataDir, 'prefs.json');
  let db = {};
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  const save = () => { fs.writeFileSync(FILE + '.tmp', JSON.stringify(db)); fs.renameSync(FILE + '.tmp', FILE); };
  const of = uid => db[uid] ||= { styles:{}, avatars:[], bag:[] };
  return {
    get:uid => ({ styles:{ ...(db[uid]?.styles || {}) }, avatars:[...(db[uid]?.avatars || [])] }),
    setStyle(uid, cat, id, serverSkills = []) {
      if (!BY_CAT[cat]) throw new Error('Нет такого раздела.');
      const p = of(uid);
      if (!id) delete p.styles[cat];
      else { if (!findStyle(cat, id, serverSkills)) throw new Error('Нет такого стиля.'); p.styles[cat] = id; }
      save(); return this.get(uid);
    },
    setAvatars(uid, list) {
      const p = of(uid);
      p.avatars = (Array.isArray(list) ? list : []).slice(0, 40).map(a => ({ id:String(a.id || '').slice(0, 80), name:String(a.name || '').slice(0, 120),
        preview:/^https:\/\//.test(String(a.preview || '')) ? String(a.preview).slice(0, 600) : '', voice:String(a.voice || '').slice(0, 80), group:String(a.group || '').slice(0, 80) })).filter(a => a.id);
      p.bag = []; save(); return this.get(uid);
    },
    // the default style of a category for a person: { label, skill, about } or null
    style(uid, cat, serverSkills = []) { const id = db[uid]?.styles?.[cat]; return id ? findStyle(cat, id, serverSkills) : null; },
    // the next avatar: all chosen ones in a random order, then a new random round — no repeats inside a round
    nextAvatar(uid) {
      const p = db[uid]; if (!p?.avatars?.length) return null;
      const ids = new Set(p.avatars.map(a => a.id));
      p.bag = (p.bag || []).filter(id => ids.has(id));
      if (!p.bag.length) { p.bag = [...ids]; for (let i = p.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p.bag[i], p.bag[j]] = [p.bag[j], p.bag[i]]; } }
      const id = p.bag.shift(); save();
      return p.avatars.find(a => a.id === id) || null;
    },
  };
}
