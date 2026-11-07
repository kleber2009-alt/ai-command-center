/* PDF-инструкции к интеграциям личного кабинета (account/): по одной на связку + все вместе.
   node apps/hq-office/account/guides/build.mjs   → apps/hq-office/account/guides/<id>.pdf и vse-integracii.pdf
   Нужен Playwright с Chromium (require('playwright')). Текст правится здесь, id совпадают с CATALOG в assistant/integrations.mjs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const G = [
  { id:'anthropic', name:'Claude (Anthropic)', field:'API-ключ', key:'sk-ant-…',
    gives:'Агенты офиса работают на Claude по вашему ключу: сценарии, разборы, карусели, отчёты.',
    need:['Почта для аккаунта Anthropic', 'Банковская карта для пополнения баланса API'],
    steps:[
      'Откройте <b>console.anthropic.com</b> и войдите (или зарегистрируйтесь по почте).',
      'Пополните баланс: <b>Settings → Billing</b> → добавьте карту и купите кредиты (от $5). Без баланса ключ не работает.',
      'Откройте <b>Settings → API Keys</b> → кнопка <b>Create Key</b>.',
      'Назовите ключ, например «AICEX офис», и нажмите <b>Create</b>.',
      'Скопируйте ключ сразу — он начинается с <b>sk-ant-</b> и показывается один раз.',
    ],
    note:'Подключённый ключ Claude переводит ваши задачи с подписки офиса на ваш баланс API — расход виден в console.anthropic.com → Usage.',
    errors:[['invalid x-api-key', 'ключ скопирован не целиком или удалён — создайте новый'], ['credit balance is too low', 'пополните баланс в Billing']],
    site:'https://console.anthropic.com/settings/keys' },
  { id:'openai', name:'OpenAI', field:'API-ключ', key:'sk-…',
    gives:'Запасная расшифровка речи (Whisper) и генерация картинок в задачах ваших агентов.',
    need:['Аккаунт OpenAI', 'Карта для пополнения баланса API (отдельно от ChatGPT Plus)'],
    steps:[
      'Откройте <b>platform.openai.com</b> и войдите.',
      'Пополните баланс: <b>Settings → Billing</b> → <b>Add payment details</b> → купите кредиты.',
      'Откройте <b>Settings → API keys</b> → <b>Create new secret key</b>.',
      'Имя — «AICEX офис», проект — Default, права — <b>All</b>. Нажмите <b>Create secret key</b>.',
      'Скопируйте ключ (начинается с <b>sk-</b>) — он показывается один раз.',
    ],
    errors:[['Incorrect API key provided', 'ключ скопирован не целиком — создайте новый'], ['You exceeded your current quota', 'нет денег на балансе API — пополните Billing']],
    site:'https://platform.openai.com/api-keys' },
  { id:'elevenlabs', name:'ElevenLabs', field:'API-ключ и ID голоса', key:'sk_…',
    gives:'Расшифровка роликов (Транскрибатор) и озвучка вашим голосом-клоном.',
    need:['Аккаунт ElevenLabs (для клона голоса — платный тариф от Starter)'],
    steps:[
      'Откройте <b>elevenlabs.io</b> и войдите.',
      'Слева внизу — ваш профиль → <b>API Keys</b> (или раздел <b>Developers → API Keys</b>).',
      'Нажмите <b>Create API Key</b>, назовите «AICEX офис». В правах оставьте доступ к Text to Speech, Speech to Text, Voices и User.',
      'Скопируйте ключ (начинается с <b>sk_</b>).',
      'По желанию — ID голоса: <b>Voices → My Voices</b> → ваш голос → меню <b>⋯</b> → <b>Copy voice ID</b>. Вставьте в поле «ID голоса».',
    ],
    errors:[['invalid_api_key', 'ключ скопирован не целиком или удалён'], ['quota_exceeded', 'кончились символы/минуты тарифа — пополните в Subscription']],
    site:'https://elevenlabs.io/app/settings/api-keys' },
  { id:'heygen', name:'HeyGen', field:'API-ключ', key:'длинная строка',
    gives:'Цифровой двойник: ролики аватаром вашим голосом — «Видео с аватаром», «Ремейк залёта», «Рилс под ключ».',
    need:['Аккаунт HeyGen с API-кредитами (раздел API оплачивается отдельно от обычного тарифа)', 'Ваш аватар и голос, созданные в HeyGen'],
    steps:[
      'Откройте <b>app.heygen.com</b> и войдите.',
      'Нажмите на аватар профиля → <b>Settings</b> → раздел <b>API</b> (может называться «Subscriptions & API»).',
      'В блоке <b>API Token</b> нажмите <b>Generate</b> (или <b>Copy</b>, если ключ уже есть).',
      'Проверьте, что на балансе API есть кредиты: там же, <b>API → Credits</b>.',
      'Скопируйте ключ.',
    ],
    note:'Этот ключ получат и задачи агентов, и подключение HeyGen внутри офиса — ролики будут создаваться в вашем аккаунте HeyGen и тратить ваши кредиты.',
    errors:[['Unauthorized / invalid api key', 'ключ скопирован не целиком — скопируйте заново'], ['insufficient credit', 'пополните кредиты API']],
    site:'https://app.heygen.com/settings?nav=API' },
  { id:'apify', name:'Apify', field:'API-токен', key:'apify_api_…',
    gives:'Сбор рилсов, каруселей и цифр конкурентов из Instagram и TikTok: «Конкуренты», «Поиск залётов», «Статистика соцсетей», Транскрибатор.',
    need:['Аккаунт Apify (бесплатно $5 в месяц, для регулярной работы — тариф Starter)'],
    steps:[
      'Откройте <b>console.apify.com</b> и зарегистрируйтесь (можно через Google).',
      'Слева внизу — <b>Settings</b> → вкладка <b>API &amp; Integrations</b>.',
      'В блоке <b>Personal API tokens</b> скопируйте токен <b>Default</b> или нажмите <b>Create new token</b> (имя — «AICEX офис»).',
      'Токен начинается с <b>apify_api_</b>.',
    ],
    errors:[['User was not found or authentication token is not valid', 'токен скопирован не целиком или удалён — скопируйте заново'], ['Monthly usage hard limit exceeded', 'кончились кредиты месяца — поднимите тариф или дождитесь нового месяца']],
    site:'https://console.apify.com/settings/integrations' },
  { id:'deepgram', name:'Deepgram', field:'API-ключ', key:'длинная строка',
    gives:'Быстрая расшифровка речи в Транскрибации.',
    need:['Аккаунт Deepgram (при регистрации дают $200 кредитов)'],
    steps:[
      'Откройте <b>console.deepgram.com</b> и зарегистрируйтесь.',
      'Выберите проект (создаётся сам) → слева <b>API Keys</b>.',
      'Нажмите <b>Create a New API Key</b>: имя «AICEX офис», роль <b>Member</b>, срок — без окончания.',
      'Скопируйте ключ — он показывается один раз.',
    ],
    errors:[['INVALID_AUTH', 'ключ скопирован не целиком или удалён']],
    site:'https://console.deepgram.com' },
  { id:'kie', name:'kie.ai', field:'API-ключ', key:'длинная строка',
    gives:'Генерация картинок и видео (Veo, Kling, Flux и другие) для креативов и каруселей.',
    need:['Аккаунт kie.ai с пополненными кредитами'],
    steps:[
      'Откройте <b>kie.ai</b> и войдите.',
      'Пополните кредиты: раздел <b>Billing</b>.',
      'Откройте страницу <b>API Key</b> (kie.ai/api-key) и скопируйте ключ.',
    ],
    errors:[['401 / invalid key', 'ключ скопирован не целиком'], ['credits insufficient', 'пополните кредиты']],
    site:'https://kie.ai/api-key' },
  { id:'instagram', name:'Instagram', field:'Токен доступа (+ ID аккаунта по желанию)', key:'EAA… или IG…',
    gives:'«Планер публикаций» сам публикует рилсы и карусели в ваш Instagram, «Аналитика контента» берёт цифры постов.',
    need:['Профессиональный аккаунт Instagram (Автор или Бизнес): Настройки → Тип аккаунта и инструменты', 'Аккаунт на developers.facebook.com (тот же вход, что в Facebook)'],
    steps:[
      'Откройте <b>developers.facebook.com</b> → <b>My Apps</b> → <b>Create App</b>.',
      'Сценарий — <b>«Manage messaging &amp; content on Instagram»</b> (Instagram API), тип — <b>Business</b>. Назовите приложение, например «AICEX офис».',
      'В приложении слева: <b>Instagram → API setup with Unified login</b> (в старых приложениях — «API setup with Instagram login»).',
      'В шаге <b>«Сгенерировать маркеры доступа»</b> нажмите <b>Add account</b> и войдите в нужный Instagram.',
      'Разрешите все права, особенно <b>instagram_business_content_publish</b> (публикация) и <b>instagram_business_manage_insights</b> (статистика).',
      'Нажмите <b>«Сгенерировать маркер»</b> напротив аккаунта и скопируйте токен целиком (начинается с <b>EAA</b> или <b>IG</b>).',
      'ID аккаунта (цифры под ником, например 1784…) — по желанию в поле «ID аккаунта Instagram». Без него офис найдёт аккаунт сам.',
    ],
    note:'Токен живёт 60 дней. Токен <b>IG…</b> офис продлевает сам; токен <b>EAA…</b> продлить запросом нельзя — с 50-го дня офис напомнит в Telegram сгенерировать новый той же кнопкой.',
    errors:[['Cannot parse access token', 'скопирован не токен (App ID, App Secret) или токен обрезан — сгенерируйте заново'], ['Session has expired', 'токен просрочен — сгенерируйте новый'], ['(#10) permission', 'при выдаче не отмечено право на публикацию — сгенерируйте с instagram_business_content_publish']],
    site:'https://developers.facebook.com/apps' },
  { id:'threads', name:'Threads', field:'Токен доступа', key:'TH…',
    gives:'«Планер публикаций» сам публикует посты и ветки в ваш Threads, цифры Threads попадают в отчёты.',
    need:['Аккаунт Threads', 'Аккаунт на developers.facebook.com'],
    steps:[
      'На <b>developers.facebook.com</b> → <b>Create App</b> → сценарий <b>«Access the Threads API»</b> (отдельное приложение, не то, что для Instagram).',
      '<b>Use cases → Threads API → Customize → Permissions</b>: добавьте <b>threads_basic</b>, <b>threads_content_publish</b>, <b>threads_manage_insights</b>.',
      '<b>App roles → Roles → Add People → Threads Tester</b> → впишите свой ник в Threads.',
      'Примите приглашение: <b>threads.net</b> → Настройки → Аккаунт → <b>Разрешения для сайтов</b> → <b>Приглашения</b> → Принять. Без этого токен не выдастся.',
      '<b>Use cases → Threads API → Settings → User Token Generator</b> → <b>Generate access token</b> напротив своего аккаунта → войдите и разрешите.',
      'Скопируйте токен — он начинается с <b>TH</b>.',
    ],
    note:'Токен живёт 60 дней — офис продлевает его сам каждую неделю.',
    errors:[['Invalid OAuth access token - Cannot parse access token', 'вставлен не токен Threads (например, токен Instagram) или он обрезан'], ['нет аккаунта в User Token Generator', 'не принято приглашение тестировщика на threads.net']],
    site:'https://developers.facebook.com/apps' },
  { id:'meta-ads', name:'Meta Ads', field:'Токен system user и рекламный кабинет', key:'EAA…',
    gives:'Отчёты по рекламе, расходам и балансу рекламного кабинета.',
    need:['Доступ администратора к Business Manager (business.facebook.com)', 'Приложение Meta (можно то же, что для Instagram)'],
    steps:[
      'Откройте <b>business.facebook.com</b> → <b>Настройки компании</b> → <b>Пользователи → Системные пользователи</b> → <b>Добавить</b> (роль — Администратор).',
      'У системного пользователя: <b>Назначить ресурсы</b> → <b>Рекламные аккаунты</b> → ваш кабинет → право «Просмотр эффективности» (или «Управление кампаниями»).',
      'Нажмите <b>Сгенерировать новый маркер</b> → выберите приложение → права <b>ads_read</b> и <b>business_management</b> → срок действия — <b>Никогда</b>.',
      'Скопируйте токен.',
      'ID кабинета: в Ads Manager в адресе есть <b>act=123…</b> — впишите как <b>act_123…</b> в поле «Рекламный кабинет».',
    ],
    errors:[['(#200) Ad account owner has NOT grant ads_management or ads_read', 'у системного пользователя нет доступа к кабинету — назначьте ресурс'], ['Invalid OAuth access token', 'токен обрезан или удалён — сгенерируйте заново']],
    site:'https://business.facebook.com/settings/system-users' },
  { id:'chatplace', name:'ChatPlace', field:'Токен MCP', key:'длинная строка',
    gives:'Агенты читают ваши цепочки и кодовые слова (Планер сверяет слово перед публикацией), переписки Директа и бота.',
    need:['Аккаунт ChatPlace с подключённым Instagram'],
    steps:[
      'Войдите в кабинет <b>ChatPlace</b>.',
      'Откройте <b>Настройки</b> → раздел <b>API</b> или <b>Интеграции → MCP</b> и создайте токен доступа.',
      'Если такого раздела нет — напишите в поддержку ChatPlace: «нужен токен для MCP-подключения к моему проекту».',
      'Скопируйте токен целиком.',
    ],
    note:'Ключ ChatPlace проверяется в первой задаче агента, а не при сохранении — так устроено подключение MCP. Действия в ChatPlace (изменить цепочку, отправить сообщение) агенты делают только после вашего «Выполнить».',
    errors:[['агент пишет «ChatPlace недоступен»', 'токен неверный или без доступа к проекту — создайте новый']],
    site:'https://chatplace.io' },
  { id:'youtube', name:'YouTube', field:'API-ключ и канал', key:'AIza…',
    gives:'Цифры вашего YouTube-канала в утреннем отчёте «Статистика соцсетей».',
    need:['Аккаунт Google'],
    steps:[
      'Откройте <b>console.cloud.google.com</b> → вверху выберите или создайте проект («AICEX офис»).',
      '<b>APIs &amp; Services → Library</b> → найдите <b>YouTube Data API v3</b> → <b>Enable</b>.',
      '<b>APIs &amp; Services → Credentials</b> → <b>Create credentials → API key</b>.',
      'Откройте ключ → <b>API restrictions</b> → <b>Restrict key</b> → отметьте YouTube Data API v3 → Save.',
      'Скопируйте ключ (начинается с <b>AIza</b>). В поле «Канал» впишите @ник канала или его ID (UC…).',
    ],
    errors:[['API key not valid', 'ключ скопирован не целиком'], ['YouTube Data API v3 has not been used / is disabled', 'не включён API в Library']],
    site:'https://console.cloud.google.com/apis/credentials' },
  { id:'telegram', name:'Telegram-канал', field:'Токен бота и канал', key:'123456:AA…',
    gives:'Подписчики и просмотры вашего Telegram-канала в утреннем отчёте.',
    need:['Telegram', 'Права администратора в канале'],
    steps:[
      'Откройте <b>@BotFather</b> в Telegram → команда <b>/newbot</b>.',
      'Придумайте имя бота и username (должен заканчиваться на <b>bot</b>).',
      'BotFather пришлёт токен вида <b>123456789:AA…</b> — скопируйте его.',
      'Добавьте бота в канал администратором: канал → <b>Управление каналом → Администраторы → Добавить администратора</b> → найдите бота. Достаточно прав по умолчанию.',
      'В поле «Канал» впишите <b>@имя_канала</b>.',
    ],
    errors:[['Unauthorized', 'токен скопирован не целиком или отозван в BotFather'], ['chat not found', 'бот не добавлен в канал или неверное имя канала']],
    site:'https://t.me/BotFather' },
];

const CSS = `@page{size:A4;margin:16mm 16mm 18mm}
*{box-sizing:border-box}body{margin:0;font:11.5pt/1.55 "Inter","Helvetica Neue",Arial,sans-serif;color:#141821}
.hero{background:#0b0d12;color:#fff;border-radius:14px;padding:20px 24px;margin-bottom:18px}
.hero small{color:#7fd3ff;letter-spacing:.12em;text-transform:uppercase;font-size:8.5pt;font-weight:700}
.hero h1{margin:6px 0 6px;font-size:24pt;line-height:1.1}.hero p{margin:0;color:#c9cfdb}
h2{font-size:13pt;margin:18px 0 8px;color:#0b0d12}
.box{border:1px solid #e3e6ed;border-radius:10px;padding:10px 14px;background:#f7f9fc}
ul{margin:4px 0 0;padding-left:18px}
ol.steps{counter-reset:s;list-style:none;padding:0;margin:0}
ol.steps li{counter-increment:s;position:relative;padding:8px 0 8px 40px;border-bottom:1px solid #eef0f4;break-inside:avoid}
ol.steps li::before{content:counter(s);position:absolute;left:0;top:7px;width:26px;height:26px;border-radius:50%;background:#2b5cff;color:#fff;font-weight:700;display:grid;place-items:center;font-size:10.5pt}
.where{border-left:4px solid #3ddc97;background:#effbf5;padding:10px 14px;border-radius:0 10px 10px 0}
.warn{border-left:4px solid #ffb020;background:#fff7e8;padding:10px 14px;border-radius:0 10px 10px 0;margin-top:10px}
table{width:100%;border-collapse:collapse;font-size:10.5pt}td{border-top:1px solid #e3e6ed;padding:6px 8px;vertical-align:top}td:first-child{font-family:Menlo,Consolas,monospace;font-size:9.5pt;width:45%;color:#b4232a}
.foot{margin-top:18px;font-size:9pt;color:#7a8396}
.page{break-after:page}.page:last-child{break-after:auto}
b{color:#0b0d12}`;

const page = g => `<section class="page">
  <div class="hero"><small>Офис AICEX · инструкция по интеграции</small><h1>${g.name}</h1><p>${g.gives}</p></div>
  <h2>Что понадобится</h2><div class="box"><ul>${g.need.map(x => `<li>${x}</li>`).join('')}</ul></div>
  <h2>Где взять ключ</h2><ol class="steps">${g.steps.map(x => `<li>${x}</li>`).join('')}</ol>
  <h2>Куда вставить в офисе</h2>
  <div class="where">1. Откройте <b>hq2.aicex.club/account/</b> (или кнопку «Кабинет» в офисе) и войдите.<br>
  2. В разделе <b>Интеграции</b> найдите карточку <b>${g.name}</b>.<br>
  3. Вставьте в поле «${g.field}» ключ (${g.key}) — без пробелов и кавычек — и нажмите <b>Подключить</b>.<br>
  4. Офис сразу проверит ключ у сервиса: статус <b>«Подключено»</b> — всё готово, ваши задачи работают на этом ключе. <b>«Ключ не работает»</b> — под карточкой будет ответ сервиса, сверьтесь с таблицей ниже.</div>
  ${g.note ? `<div class="warn">${g.note}</div>` : ''}
  <h2>Если не работает</h2><table>${g.errors.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>
  <p class="foot">Ключ хранится на сервере офиса в зашифрованном виде и никому не показывается — в кабинете видны только последние 4 символа. Никогда не пересылайте ключ в чатах.
  Отключить — кнопка «Отключить» в карточке, ключ удалится с сервера. Страница сервиса: ${g.site}</p>
</section>`;

const doc = (title, body) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>${body}</body></html>`;
const cover = `<section class="page"><div class="hero" style="padding:40px 28px"><small>Офис AICEX</small><h1 style="font-size:30pt">Интеграции личного кабинета</h1>
  <p>Как подключить свои сервисы, чтобы агенты офиса работали на ваших ключах: ${G.length} инструкций.</p></div>
  <h2>Как это устроено</h2><div class="box">В личном кабинете (<b>hq2.aicex.club/account/</b>) у каждого — администратора, руководителя и пользователя — свои интеграции.
  Задачи, которые вы ставите агентам, работают на ваших ключах: ваш Apify собирает данные, ваш HeyGen делает ролики, публикации уходят в ваш Instagram и Threads.
  Ключи хранятся на сервере в зашифрованном виде.</div>
  <h2>Содержание</h2><ol class="steps">${G.map(g => `<li><b>${g.name}</b> — ${g.gives}</li>`).join('')}</ol></section>`;

const browser = await chromium.launch();
const pg = await browser.newPage();
const out = async (file, html) => { await pg.setContent(html, { waitUntil:'load' }); await pg.pdf({ path:path.join(HERE, file), format:'A4', printBackground:true, margin:{ top:'16mm', bottom:'18mm', left:'16mm', right:'16mm' } }); };
for (const g of G) await out(`${g.id}.pdf`, doc(`${g.name} — инструкция`, page(g)));
await out('vse-integracii.pdf', doc('Интеграции офиса AICEX', cover + G.map(page).join('')));
await browser.close();
console.log(`${G.length} инструкций + vse-integracii.pdf → ${HERE}`);
