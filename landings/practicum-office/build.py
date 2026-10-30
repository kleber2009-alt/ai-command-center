#!/usr/bin/env python3
"""Builds five versions of the practicum landing (v1..v5/index.html).

Shared copy (program, bonuses, author, FAQ, footer) lives here once; each version has its own
palette, fonts and unique sections. Facts and numbers come from the live page aicex.club/practicum;
office materials are real works of the agents from hq2.aicex.club / marketing.aicex.club (assets/).

    python3 landings/practicum-office/build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
A = '../assets/'

ARROW = ('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" '
         'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>')
CTA_TEXT = 'Принять участие бесплатно'


def cta(text=CTA_TEXT, note='Записи не будет — только для тех, кто придёт в эфир'):
    n = f'<span class="cta-note">{note}</span>' if note else ''
    return f'<div class="cta-row"><a class="btn" data-reg href="#popup:practicum">{text}{ARROW}</a>{n}</div>'


def img(src, alt, cls='', cap=''):
    c = f'<figcaption>{cap}</figcaption>' if cap else ''
    return (f'<figure class="{cls}"><div class="shot"><img src="{A}{src}" alt="{alt}" loading="lazy"></div>{c}</figure>')


REELS = [
    ('reel-dvoinik', 'Двойник: рилс с ИИ-аватаром без съёмки'),
    ('reel-claude-vs-gpt', 'Claude vs GPT: от сценария до ролика'),
    ('reel-avatar-reel', 'Рилс с ИИ-аватаром'),
    ('reel-glass', 'Стиль «Стеклянная объяснялка»'),
    ('reel-silent', 'Silent Reels: хук поверх клипа'),
]


def reels(items=REELS):
    out = []
    for f, t in items:
        out.append(f'<div class="reel" aria-label="{t}"><video src="{A}{f}.mp4" poster="{A}{f}.jpg" '
                   f'preload="none" playsinline loop></video><span class="play">{t}</span></div>')
    return '<div class="reels">' + ''.join(out) + '</div>'


# Marketing team from apps/hq-office (office.config.js + agent-content.js)
AGENTS = [
    ('audience', 'Анализ аудитории', 'Находит залетевшие ролики в нише и у конкурентов', 'parser.jpg'),
    ('scripts', 'Сценарии', 'Пишет сценарии рилсов с кодовым словом', 'reel-claude-vs-gpt.jpg'),
    ('montage', 'Монтаж видео', 'Монтирует рилсы и YouTube кодом, 35+ стилей', 'montage-kobalt.jpg'),
    ('avatar', 'Видео с аватаром', 'Ролики с ИИ-двойником без съёмки', 'reel-dvoinik.jpg'),
    ('carousel', 'Карусели', 'Карусели для Instagram в 24 стилях', 'carousel-palii.jpg'),
    ('creatives', 'Креативы', 'Рекламные креативы и баннеры для Meta', 'funnel-welcome.jpg'),
    ('threads', 'Threads-ветки', 'Три ветки в день и трафик в Telegram-канал', 'marketing.jpg'),
    ('publish', 'Публикации', 'Контент-план и выход роликов в соцсети', 'miniapp-creator.jpg'),
    ('funnels', 'Воронки', 'Бот, прогрев по дням и оффер', 'funnel-day3.jpg'),
    ('leadmagnet', 'Лид-магниты', 'Подарки за подписку: гайды, уроки, чек-листы', 'deck-svyazka.jpg'),
    ('slides', 'Презентации', 'Слайды вебинаров, эфиров и питчей', 'deck-practicum.jpg'),
    ('landings', 'Лендинги', 'Сайты и лендинги на своём домене', 'landing-a3.jpg'),
    ('analytics', 'Аналитика', 'Охваты, лиды, выручка и ROMI в одном дашборде', 'analytics.jpg'),
]
COLORS = ['#c38bff', '#ff5d8f', '#ff9f43', '#e0559c', '#ffd23f', '#ff7a59', '#9aa4b2',
          '#e2b93b', '#3ddc97', '#2fb9a6', '#4da3ff', '#6366f1', '#5ad1ff']

# Real tasks of the office with dates (apps/hq-office/tasks.js)
LEDGER = [
    ('2026-10-28', 'Контент', 'Разбор 20 публикаций блога и 3 карусели по темам-победителям', 'Анализ аудитории, Аналитика, Карусели, Сценарии'),
    ('2026-10-28', 'Трафик', 'Threads на автопилоте: ветки по утрам в Telegram-бот', 'Threads-ветки, Публикации, Сценарии'),
    ('2026-10-28', 'Продажи', 'ИИ в Директе советует бесплатные материалы: каталог из 48 постов', 'Консультации, Переписки, Лид-магниты'),
    ('2026-10-27', 'Видео', 'Creator Pack: 48 скиллов монтажа — одно видео, любой стиль', 'Монтаж видео, Скиллы'),
    ('2026-10-23', 'Видео', 'Silent Reels: рилс из любого клипа — без лица и голоса', 'Монтаж видео, Сценарии, Публикации'),
    ('2026-10-22', 'Аналитика', 'Сквозная аналитика вебинарной воронки: Meta Ads × оплаты', 'Аналитика, Отчёты по рекламе'),
    ('2026-10-19', 'Презентации', '«Спринт Чёрный», эфир «Монтаж рилсов с Claude», урок 2', 'Презентации'),
    ('2026-10-17', 'Презентации', 'Слайды первого дня этого практикума', 'Презентации'),
    ('2026-10-15', 'Карусели', 'Карусели Instagram: 24 стиля и готовая карусель', 'Карусели'),
    ('2026-10-10', 'Воронка', 'Нейроворонка: бот, прогрев, лид-магниты «Воронка», «Клон», «Поток»', 'Воронки, Лид-магниты, Креативы'),
    ('2026-10-10', 'Сайты', 'Лендинги Нейроворонки: 5 стилей и «Медь»', 'Лендинги'),
    ('2026-10-10', 'Сценарии', '10 продающих рилсов по найденному скелету', 'Сценарии, Анализ аудитории'),
    ('2026-10-10', 'Видео', 'Рилс «Claude vs GPT» — от сценария до готового ролика', 'Сценарии, Монтаж видео, Публикации'),
    ('2026-10-06', 'Стратегия', 'Контент-стратегия: органика блога и трек «0 → 10 000 подписчиков»', 'Публикации, Анализ аудитории'),
    ('2026-09-24', 'Лид-магнит', '«12 рабочих связок» и презентация «Первые 10 000»', 'Лид-магниты'),
]

STATS = [('≈300 000', 'аудитория в соцсетях без бюджета'), ('≈46 000', 'заявок на продукты без рекламы'),
         ('≈11 000', 'клиентов'), ('≈84 млн ₽', 'выручка за 1,5 года')]


def stats(items=STATS):
    return '<div class="stats">' + ''.join(f'<div class="stat"><b>{b}</b><span>{s}</span></div>' for b, s in items) + '</div>'


def program(title='Программа практикума'):
    return f'''
<section class="sec" id="program"><div class="wrap stack">
  <div class="head"><span class="eyebrow">2 вечера · по 2 часа</span><h2 class="h2">{title}</h2></div>
  <div class="days">
    <article class="day"><span class="day-tag">День 1 · 4 ноября · 18:00 МСК</span>
      <h3>AI-контент и мой ИИ-офис изнутри</h3>
      <ul>
        <li class="office">Экскурсия по моему ИИ-офису: 3 человека и команда агентов, которые ведут маркетинг</li>
        <li>Как агенты пишут сценарии, монтируют рилсы и собирают карусели</li>
        <li>5 форматов AI-контента, которые сейчас дают от 10 000 подписчиков ежемесячно</li>
        <li>Как система контента с ИИ сэкономила мне $54 000 и принесла $1 000 000</li>
        <li>Практика: автомонтаж с Claude собирает готовый ролик с нуля за 10 минут</li>
      </ul></article>
    <article class="day"><span class="day-tag">День 2 · 5 ноября · 18:00 МСК</span>
      <h3>От трафика к клиентам и деньгам</h3>
      <ul>
        <li class="office">Как устроены маркетинг и продажи внутри моего ИИ-офиса</li>
        <li>Где агенты берут трафик: залёты конкурентов, Threads, реклама в Meta</li>
        <li>Воронки и прогревы от агентов: лид-магнит → бот → прогрев по дням → оффер</li>
        <li>Презентации и лендинги, которые агенты собирают за вечер</li>
        <li>Как я с нуля набрал 300 000 подписчиков и заработал 84 млн ₽: полный разбор аккаунта</li>
        <li>Как AI сам отвечает в Direct, квалифицирует и ведёт человека к покупке</li>
        <li>ТОП-5 связок по заработку на AI-контенте</li>
      </ul></article>
  </div>
  {cta()}
</div></section>'''


def bonuses(cls='alt'):
    return f'''
<section class="sec {cls}"><div class="wrap stack">
  <div class="head"><span class="eyebrow">Тем, кто будет в эфире</span><h2 class="h2">Бонусы участникам</h2></div>
  <div class="bonuses">
    <div class="bonus"><small>Бонус 1</small><h3>Скилл по монтажу для Claude</h3><p>Тот же, которым работает агент монтажа в офисе. Монтирует Reels за 5 минут: паузы, хуки, субтитры, музыка.</p></div>
    <div class="bonus"><small>Бонус 2</small><h3>Урок «Первая 1000 подписчиков»</h3><p>Пошаговый план, как набрать первую аудиторию с нуля.</p></div>
    <div class="bonus"><small>Бонус 3</small><h3>Конспект практикума</h3><p>Все связки, сервисы и промпты из двух дней в одном файле.</p></div>
  </div>
</div></section>'''


def author(cls=''):
    return f'''
<section class="sec {cls}"><div class="wrap author">
  <div class="author-photo"><img src="{A}ilya-stage.webp" alt="Илья Палий на сцене" loading="lazy"></div>
  <div class="stack">
    <div class="head"><span class="eyebrow">Ведущий практикума</span>
      <h2 class="h2">Илья Палий — эксперт по нейросетям и ИИ-маркетолог</h2></div>
    <ul class="facts">
      <li><b>300 000</b><span>подписчиков в Instagram* без вложений в рекламу</span></li>
      <li><b>33 300</b><span>подписчиков в Telegram без вложений в трафик</span></li>
      <li><b>11 000+</b><span>учеников, 87% из них уже заработали первые деньги на ИИ, а кто-то вышел на доход 1 млн+</span></li>
      <li><b>2</b><span>выступления на международных конференциях: Майами и Нью-Йорк</span></li>
    </ul>
    <p class="legal-note">* деятельность организации Meta Platforms Inc., её продуктов Instagram и Facebook запрещена в Российской Федерации</p>
  </div>
</div></section>'''


def final(title='Запишись на практикум прямо сейчас', sub='И я покажу свой ИИ-офис вживую: агентов, их работы и как они приводят клиентов.', cls='alt'):
    return f'''
<section class="sec {cls}" id="reg"><div class="wrap">
  <div class="final">
    <span class="eyebrow">Открытый 2-дневный практикум · 4–5 ноября · 18:00 МСК</span>
    <h2 class="h2">{title}</h2>
    <p class="lead">{sub}</p>
    <div class="price"><s>270 $</s><b>Бесплатно</b></div>
    <div class="stack" style="gap:10px">
      <span class="muted" style="font-size:14px">До начала эфира</span>
      <div class="count" data-countdown><div><b>00</b><span>дней</span></div><div><b>00</b><span>часов</span></div><div><b>00</b><span>минут</span></div><div><b>00</b><span>секунд</span></div></div>
    </div>
    {cta(note='Регистрация займёт 30 секунд. Количество мест в эфире ограничено, записи не будет')}
  </div>
</div></section>'''


FAQ = [
    ('Что за ИИ-офис и смогу ли я собрать такой же?',
     'Это команда ИИ-агентов на Claude. У каждого свои скиллы и задачи: сценарии, монтаж, карусели, воронки, презентации, лендинги, ответы в Direct. Руководят ими три человека. На практикуме покажу офис изнутри и с каких агентов начать свой: первый агент собирается на обычном ноутбуке.'),
    ('У меня нет времени на длинные эфиры',
     '4 и 5 ноября, по 2 часа вечером, в 18:00 по Москве. А вся система, которую я покажу, как раз про то, как тратить на контент 15 минут в день вместо часов.'),
    ('Я не технарь, смогу ли я повторить?',
     'Да. 80% нейросетей работают в браузере, мощный компьютер не нужен — хватит обычного ноутбука или даже телефона. Весь процесс показываю пошагово, достаточно повторить.'),
    ('Нейросети недоступны в моей стране',
     'На практикуме покажу, как зарегистрироваться в нужных сервисах из любой страны — это займёт не больше 5 минут.'),
    ('У меня нет блога и подписчиков',
     'Система подходит и тем, кто начинает с нуля: на втором дне разберём, как набрать первую аудиторию и где искать первых клиентов.'),
    ('Я не хочу снимать себя на камеру',
     'Покажу связку с ИИ-аватаром и роликами без съёмок: Claude и Higgsfield собирают контент без вашего участия в кадре. В офисе этим занимается отдельный агент.'),
    ('Часть нейросетей на английском',
     'В браузере есть встроенный переводчик, а интерфейсы интуитивные. Всё показываю пошагово.'),
    ('Будет ли запись?', 'Нет. Практикум идёт только в прямом эфире, поэтому смотреть можно только вживую.'),
]


def faq(cls=''):
    items = ''.join(f'<details><summary>{q}</summary><p>{a}</p></details>' for q, a in FAQ)
    return f'''
<section class="sec {cls}"><div class="wrap stack">
  <div class="head"><h2 class="h2">Ответы на частые вопросы</h2></div>
  <div class="faq">{items}</div>
</div></section>'''


FOOT = f'''
<footer class="foot"><div class="wrap">
  <p>Индивидуальный предприниматель Палий Сергей Ремович · ИНН 930300909030 · ОГРНИП 324930100015659</p>
  <p>Email: ilia.info.paliy@gmail.com</p>
  <p>* деятельность организации Meta Platforms Inc., ее продуктов Instagram и Facebook запрещена в Российской Федерации</p>
  <p>Результаты зависят от действий участника и не гарантируются.</p>
  <p><a href="#">Договор оферты</a> · <a href="#">Политика конфиденциальности</a></p>
</div></footer>
<div class="sticky"><a class="btn" data-reg href="#popup:practicum">{CTA_TEXT}{ARROW}</a></div>'''


def page(title, desc, fonts, css, body, scheme='dark'):
    return f'''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta name="color-scheme" content="{scheme}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}">
<link rel="stylesheet" href="../shared.css">
<style>{css}</style>
</head>
<body>
{body}
{FOOT}
<script src="../shared.js"></script>
</body>
</html>
'''


TITLE = 'Практикум по набору подписчиков, клиентов и продаж с помощью AI'
DESC = ('Бесплатный 2-дневный практикум Ильи Палия 4–5 ноября: покажу свой ИИ-офис, где маркетинговая команда '
        'из агентов приводит трафик, пишет сценарии, собирает воронки, креативы и презентации')

PILL = '<span class="pill"><i></i>4–5 ноября · 18:00 МСК · только в прямом эфире</span>'


# ───────────────────────── V1 · Золото · «ИИ-офис изнутри» ─────────────────────────
V1_CSS = '''
/* Layout: editorial gold — hero with portrait, org chart, alternating function rows */
:root { color-scheme: dark;
  --bg:#13120e; --bg2:#1a1813; --card:#1e1c16; --fg:#f2ead8; --muted:#a59c86; --line:rgba(226,190,120,.17);
  --acc:#d8b26a; --acc-fg:#18140a; --display:"Playfair Display", Georgia, serif; --body:Manrope, system-ui, sans-serif;
  --h-weight:600; --radius:16px; --btn-radius:999px; }
.h1 { font-size: clamp(38px, 6vw, 76px); line-height: 1.02; }
.h1 em, .h2 em { font-style: italic; color: var(--acc); }
.hero { padding-block: clamp(28px, 5vw, 64px) 0; overflow: hidden;
  background: radial-gradient(60% 70% at 78% 40%, rgba(216,178,106,.20), transparent 70%), var(--bg); }
.hero-grid { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 24px; align-items: end; }
.hero-copy { display: grid; gap: 26px; padding-bottom: clamp(32px, 6vw, 80px); }
.hero-photo img { width: 100%; max-width: 520px; margin-left: auto; filter: drop-shadow(0 30px 60px rgba(0,0,0,.5)); }
.office-strip { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
.faces { display: flex; }
.faces img { width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--bg); margin-left: -10px; object-fit: cover; }
.faces img:first-child { margin-left: 0; }
.office-strip span { font-size: 14px; color: var(--muted); max-width: 34ch; line-height: 1.4; }
.org { display: grid; gap: 18px; }
.org-top { display: flex; align-items: center; gap: 16px; padding: 18px 22px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); width: fit-content; max-width: 100%; }
.org-top b { font: 600 20px/1.2 var(--display); }
.org-depts { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.dept { border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: 22px; display: grid; gap: 14px; align-content: start; }
.dept.main { border-color: var(--acc); }
.dept header { display: flex; gap: 14px; align-items: center; }
.dept header img { width: 54px; height: 54px; border-radius: 50%; object-fit: cover; }
.dept h3 { font-size: 20px; }
.dept small { color: var(--muted); font-size: 13px; }
.dept .n { font: 600 34px/1 var(--display); color: var(--acc); }
.fn { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: clamp(22px, 4vw, 56px); align-items: center;
  padding-block: clamp(28px, 4vw, 44px); border-top: 1px solid var(--line); }
.fn:nth-child(even) { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); }
.fn:nth-child(even) .fn-text { order: 2; }
.fn-text { display: grid; gap: 14px; align-content: start; }
.fn-text h3 { font-size: clamp(24px, 2.8vw, 34px); }
.fn-text .k { font: 600 13px/1 var(--body); color: var(--acc); letter-spacing: .1em; text-transform: uppercase; }
.fn-media { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.fn-media.one { grid-template-columns: 1fr; }
.fn-media.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.pays { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: start; }
.pays img { border-radius: 12px; border: 1px solid var(--line); }
@media (max-width: 860px) {
  .hero-grid, .fn, .fn:nth-child(even) { grid-template-columns: 1fr; }
  .fn:nth-child(even) .fn-text { order: 0; }
  .hero-photo img { max-width: 360px; margin: 0 auto; }
  .pays { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
'''


def v1():
    fns = [
        ('Трафик', 'Находит, что уже залетело, и приводит людей',
         'Агент анализа аудитории ищет выбросы в нише: ролики конкурентов, которые набрали в разы больше обычного. '
         'Агент Threads пишет три ветки в день и ведёт людей в Telegram. Реклама в Meta — отдельный отдел с отчётами по цене лида.',
         ['Анализ аудитории', 'Threads-ветки', 'Реклама Meta'],
         f'<div class="fn-media crop">{img("parser.jpg", "Парсер залётных роликов", cap="Парсер «Залётный»: залетевшие рилсы ниши")}{img("analytics.jpg", "Сквозная аналитика", cap="Сквозная аналитика: от клика до оплаты")}</div>'),
        ('Сценарии и креативы', 'Пишет сценарии и монтирует ролики без съёмок',
         'Сценарист берёт скелет залетевшего ролика и пишет новый с кодовым словом. Монтаж работает кодом в 35+ стилях, '
         'аватар озвучивает текст моим голосом, карусели собираются в 24 стилях.',
         ['Сценарии', 'Монтаж видео', 'Видео с аватаром', 'Карусели', 'Креативы'],
         f'<div class="fn-media one">{img("carousel-kobalt.jpg", "Карусель в стиле Кобальт", cap="Карусель «Кобальт» — собрал агент каруселей")}</div>'
         f'<div class="fn-media" style="margin-top:12px">{img("montage-scheme.jpg", "Раскадровка монтажа: неоновая схема")}{img("carousel-palii.jpg", "Карусель в стиле Палий")}</div>'),
        ('Воронки и прогревы', 'Ведёт человека от подписки до оффера',
         'Лид-магнит → бот → прогрев по дням → мост к офферу → напоминание. Каждое сообщение и баннер воронки «Нейроворонка» '
         'сделали агенты воронок и лид-магнитов.',
         ['Воронки', 'Лид-магниты', 'Креативы'],
         f'<div class="fn-media three">{img("funnel-welcome.jpg", "Приветствие в боте")}{img("funnel-day3.jpg", "Прогрев, день 3")}{img("funnel-bridge.jpg", "Мост к офферу")}'
         f'{img("funnel-lesson1.jpg", "Урок 1")}{img("funnel-offer.jpg", "Оффер")}{img("funnel-remind.jpg", "Напоминание")}</div>'),
        ('Презентации и лендинги', 'Готовит вебинары и сайты за вечер',
         'Слайды эфиров, уроков и питчей в едином бренде. Лендинги в пяти стилях, сразу на своём домене. '
         'Слайды первого дня этого практикума тоже собрал агент презентаций.',
         ['Презентации', 'Лендинги'],
         f'<div class="fn-media">{img("deck-practicum.jpg", "Слайды практикума", cap="Практикум, день 1 — живые слайды")}{img("deck-copper.jpg", "Эфир Монтаж рилсов с Claude", cap="Эфир «Монтаж рилсов с Claude»")}'
         f'{img("landing-a1.jpg", "Лендинг Золото")}{img("landing-a3.jpg", "Лендинг Неон")}</div>'),
        ('Клиенты', 'Отвечает в Direct и доводит до оплаты',
         'Отдел продаж — пять агентов под руководством Богдана: отвечают на кодовые слова в комментариях, ведут переписку, '
         'консультируют по базе знаний и доводят тёплых лидов до оплаты.',
         ['Ответы на комментарии', 'Переписки', 'ИИ-консультации', 'Закрытие сделок'],
         f'<div class="pays">{"".join(f"<img src=\"{A}pay-{i}.webp\" alt=\"Оплата ученика\" loading=\"lazy\" data-zoom>" for i in (1, 2, 3, 4))}</div>'),
    ]
    rows = ''.join(f'''<div class="fn"><div class="fn-text"><span class="k">{k}</span><h3>{h}</h3><p class="muted">{p}</p>
      <div class="chips">{''.join(f'<span class="chip">{c}</span>' for c in chips)}</div></div><div>{media}</div></div>''' for k, h, p, chips, media in fns)
    body = f'''
<header class="hero" data-hero><div class="wrap hero-grid">
  <div class="hero-copy">
    {PILL}
    <h1 class="h1">Мой маркетинг ведёт <em>ИИ-офис.</em> На практикуме я открою его двери</h1>
    <p class="lead">Команда ИИ-агентов приводит трафик, пишет сценарии, монтирует креативы, собирает воронки, прогревы и презентации и приводит клиентов. За 2 вечера покажу, как это устроено, и как за 15 минут в день делать контент, который продаёт.</p>
    {cta()}
    <div class="office-strip"><div class="faces"><img src="{A}firuza.jpg" alt="Фируза"><img src="{A}bogdan.jpg" alt="Богдан"><img src="{A}nurken.jpg" alt="Нуркен"></div>
      <span>3 человека и команда агентов вместо большого отдела маркетинга</span></div>
  </div>
  <div class="hero-photo"><img src="{A}ilya-hero.webp" alt="Илья Палий" fetchpriority="high"></div>
</div></header>

<section class="sec alt"><div class="wrap stack">
  {stats()}
</div></section>

<section class="sec"><div class="wrap stack">
  <div class="head"><span class="eyebrow">Как устроен офис</span><h2 class="h2">Три человека. Под каждым — <em>свои ИИ-агенты</em></h2>
    <p class="lead">Я задаю стратегию. Руководители ставят задачи агентам, проверяют результат и отдают дальше по цепочке. Офис живой: его можно открыть и посмотреть, кто над чем работает.</p></div>
  <div class="org">
    <div class="org-top"><img src="{A}ilya-hero.webp" alt="" style="width:54px;height:54px;border-radius:50%;object-fit:cover;object-position:50% 15%;background:var(--bg2)"><div><b>Илья</b><br><small class="muted">Основатель: стратегия, продукт, 5 агентов</small></div></div>
    <div class="org-depts">
      <div class="dept main"><header><img src="{A}firuza.jpg" alt="Фируза"><div><h3>Отдел маркетинга</h3><small>Фируза, руководитель</small></div></header><span class="n">13 агентов</span>
        <p class="muted">Трафик, сценарии, монтаж, карусели, креативы, воронки, прогревы, презентации, лендинги, аналитика</p></div>
      <div class="dept"><header><img src="{A}bogdan.jpg" alt="Богдан"><div><h3>Отдел продаж</h3><small>Богдан, РОП</small></div></header><span class="n">5 агентов</span>
        <p class="muted">Комментарии, переписки в Direct, консультации, рассылки, закрытие сделок</p></div>
      <div class="dept"><header><img src="{A}nurken.jpg" alt="Нуркен"><div><h3>Реклама Meta</h3><small>Нуркен, таргетолог</small></div></header><span class="n">2 агента</span>
        <p class="muted">Рекламные кампании и ежедневные отчёты по цене лида</p></div>
    </div>
    {img("office-hq2.jpg", "Живой 3D-офис агентов", cap="hq2.aicex.club — живой офис: агенты передают друг другу материалы, справа история реальных задач с доказательствами")}
  </div>
</div></section>

<section class="sec alt"><div class="wrap">
  <div class="head" style="margin-bottom:12px"><span class="eyebrow">Маркетинговая команда</span><h2 class="h2">Что делают агенты — <em>на реальных работах</em></h2>
    <p class="lead">Всё ниже сделали агенты моего офиса. На практикуме покажу каждый этап вживую.</p></div>
  {rows}
</div></section>

<section class="sec"><div class="wrap stack">
  <div class="head"><span class="eyebrow">Готовые ролики</span><h2 class="h2">Рилсы, которые <em>смонтировали агенты</em></h2>
    <p class="lead">Нажмите на ролик, чтобы посмотреть со звуком.</p></div>
  {reels()}
  {cta()}
</div></section>
{program()}
{bonuses()}
{author()}
{final()}
{faq()}
'''
    return page(TITLE, DESC, 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,600&family=Manrope:wght@400;500;600;700&display=swap', V1_CSS, body)


# ───────────────────────── V2 · Светлый · «Знакомьтесь, команда» ─────────────────────────
V2_CSS = '''
/* Layout: friendly roster — hero with team badge, 13 agent cards, tabbed works */
:root { color-scheme: light;
  --bg:#f5f5f0; --bg2:#ebece4; --card:#ffffff; --fg:#141712; --muted:#5b6157; --line:#d9dbd0;
  --acc:#1a9a52; --acc-fg:#ffffff; --display:Onest, "Arial", sans-serif; --body:Manrope, system-ui, sans-serif;
  --h-case:uppercase; --h-weight:800; --h-track:-.01em; --h-lh:1.0; --radius:20px; --btn-radius:14px; }
.h1 { font-size: clamp(36px, 6.4vw, 82px); line-height: .98; }
.h1 mark, .h2 mark { background: none; color: var(--acc); }
.hero { padding-block: clamp(24px, 4vw, 56px) clamp(40px, 6vw, 80px); }
.hero-grid { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: clamp(24px, 4vw, 56px); align-items: center; }
.hero-copy { display: grid; gap: 24px; }
.badge { background: var(--card); border: 1px solid var(--line); border-radius: 28px; padding: 22px; display: grid; gap: 16px;
  box-shadow: 0 30px 60px -40px rgba(20,23,18,.35); }
.badge-head { display: flex; align-items: center; gap: 14px; }
.badge-head img { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; }
.badge-head b { font: 800 18px/1.1 var(--display); text-transform: uppercase; }
.dots { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
.dot { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; padding: 7px 9px; border-radius: 10px; background: var(--bg); min-width: 0; }
.dot i { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.dot span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge .live { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.badge .live::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--acc); animation: pulse 1.6s infinite; }
@keyframes pulse { 50% { opacity: .3; } }
.roster { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; }
.roster .join { grid-column: span 2; background: var(--fg); color: var(--bg); border-radius: var(--radius); padding: 24px; display: grid; gap: 14px; align-content: center; }
.roster .join h3 { font-size: 24px; }
.roster .join p { color: color-mix(in srgb, var(--bg) 75%, transparent); font-size: 15px; }
@media (max-width: 1060px) { .roster { grid-template-columns: repeat(3, minmax(0, 1fr)); } .roster .join { grid-column: span 2; } }
@media (max-width: 640px) { .roster { grid-template-columns: repeat(2, minmax(0, 1fr)); } .roster .join { grid-column: 1 / -1; } .roster .agent .body { padding: 14px; } .roster .agent .role { font-size: 14px; } }
.agent { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; display: grid; grid-template-rows: auto 1fr; }
.agent .pic { aspect-ratio: 16 / 10; overflow: hidden; background: var(--bg2); }
.agent .pic img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.agent .body { padding: 18px; display: grid; gap: 8px; align-content: start; }
.agent .role { display: flex; align-items: center; gap: 8px; font: 800 17px/1.1 var(--display); text-transform: uppercase; }
.agent .role i { width: 12px; height: 12px; border-radius: 4px; flex: none; }
.agent p { font-size: 14.5px; color: var(--muted); line-height: 1.45; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.tabs button { font: 700 14px/1 var(--body); padding: 12px 18px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer; }
.tabs button[aria-selected="true"] { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.pane-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.pane-grid.wide { grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
.pane-grid.wide .shot img { aspect-ratio: auto; }
.others { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.other { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 22px; display: grid; gap: 12px; }
.other header { display: flex; gap: 12px; align-items: center; }
.other img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
.other h3 { font-size: 18px; }
.stat { background: var(--card); }
.sec.alt .stat { background: var(--card); }
@media (max-width: 860px) { .hero-grid { grid-template-columns: 1fr; } }
@media (max-width: 420px) { .pane-grid.wide { grid-template-columns: 1fr; } }
'''


def v2():
    dots = ''.join(f'<span class="dot"><i style="background:{COLORS[i]}"></i><span>{a[1]}</span></span>' for i, a in enumerate(AGENTS))
    cards = ''.join(f'''<article class="agent"><div class="pic"><img src="{A}{pic}" alt="Работа агента «{name}»" loading="lazy" data-zoom></div>
      <div class="body"><span class="role"><i style="background:{COLORS[i]}"></i>{name}</span><p>{desc}</p></div></article>'''
                    for i, (_, name, desc, pic) in enumerate(AGENTS))
    tab = lambda key, label, sel: f'<button type="button" data-tab="{key}" aria-selected="{str(sel).lower()}">{label}</button>'
    shots = lambda files, wide=False: f'<div class="pane-grid{" wide" if wide else " crop"}">' + ''.join(img(f, t) for f, t in files) + '</div>'
    body = f'''
<header class="hero" data-hero><div class="wrap hero-grid">
  <div class="hero-copy">
    {PILL}
    <h1 class="h1">В моём отделе маркетинга <mark>13 сотрудников.</mark> Все — ИИ-агенты</h1>
    <p class="lead">Они приводят трафик, пишут сценарии, монтируют ролики и карусели, делают креативы, воронки, прогревы и презентации и приводят клиентов. Руководит ими один человек. На практикуме познакомлю вас с каждым и покажу, как набирать подписчиков и продажи с помощью AI.</p>
    {cta()}
  </div>
  <aside class="badge" aria-label="Отдел маркетинга">
    <div class="badge-head"><img src="{A}firuza.jpg" alt="Фируза"><div><b>Отдел маркетинга</b><br><small class="muted">Руководитель — Фируза</small></div></div>
    <div class="dots">{dots}</div>
    <span class="live">Офис работает прямо сейчас: hq2.aicex.club</span>
  </aside>
</div></header>

<section class="sec alt"><div class="wrap stack">
  <div class="head"><span class="eyebrow">Знакомьтесь</span><h2 class="h2">Маркетинговая команда <mark>моего ИИ-офиса</mark></h2>
    <p class="lead">У каждого агента своя зона ответственности и набор скиллов. На карточках — их настоящие работы.</p></div>
  <div class="roster">{cards}<div class="join"><h3>На практикуме покажу каждого в работе</h3><p>И разберу, с какого агента начать свою команду.</p>{cta(note="")}</div></div>
</div></section>

<section class="sec"><div class="wrap stack" data-tabs>
  <div class="head"><span class="eyebrow">Портфолио команды</span><h2 class="h2">Что команда уже сделала</h2></div>
  <div class="tabs" role="tablist">{tab('video', 'Ролики', True)}{tab('car', 'Карусели', False)}{tab('fun', 'Воронки и прогревы', False)}{tab('deck', 'Презентации', False)}{tab('site', 'Лендинги', False)}</div>
  <div data-pane="video">{reels()}</div>
  <div data-pane="car" hidden>{shots([('carousel-palii.jpg', 'Стиль «Палий»'), ('carousel-kobalt.jpg', 'Стиль «Кобальт»'), ('carousel-neon.jpg', 'Стиль «Неон»'), ('carousel-uimotion.jpg', 'Стиль «UI-моушн»'), ('carousel-journal.jpg', 'Стиль «Журнал»'), ('carousel-razbor.jpg', 'Стиль «Разбор»')], True)}</div>
  <div data-pane="fun" hidden>{shots([('funnel-voronka.jpg', 'Лид-магнит «Воронка»'), ('funnel-welcome.jpg', 'Приветствие'), ('funnel-lesson1.jpg', 'Урок 1'), ('funnel-day3.jpg', 'Прогрев: день 3'), ('funnel-bridge.jpg', 'Мост к офферу'), ('funnel-offer.jpg', 'Оффер'), ('funnel-remind.jpg', 'Напоминание'), ('funnel-paid.jpg', 'После оплаты')])}</div>
  <div data-pane="deck" hidden>{shots([('deck-practicum.jpg', 'Практикум, день 1'), ('deck-copper.jpg', 'Эфир «Монтаж рилсов с Claude»'), ('deck-svyazka.jpg', 'Лид-магнит «Первые 10 000»'), ('deck-webinar.jpg', 'Урок 2: блог с 0 до 10 000')], True)}</div>
  <div data-pane="site" hidden>{shots([(f'landing-a{i}.jpg', f'Лендинг, вариант A{i}') for i in range(1, 6)] + [('reels-bot.jpg', 'reels.aicex.club — бот монтажа')], True)}</div>
  {cta()}
</div></section>

<section class="sec alt"><div class="wrap stack">
  <div class="head"><span class="eyebrow">Кто ещё в офисе</span><h2 class="h2">Маркетинг приводит людей. <mark>Дальше их ведут продажи</mark></h2></div>
  <div class="others">
    <div class="other"><header><img src="{A}bogdan.jpg" alt="Богдан"><div><h3>Отдел продаж</h3><small class="muted">Богдан, РОП · 5 агентов</small></div></header>
      <p class="muted">Отвечают на кодовые слова в комментариях, ведут переписку в Direct, консультируют по базе знаний и доводят до оплаты.</p></div>
    <div class="other"><header><img src="{A}nurken.jpg" alt="Нуркен"><div><h3>Реклама Meta</h3><small class="muted">Нуркен, таргетолог · 2 агента</small></div></header>
      <p class="muted">Запускают кампании и каждый день считают расходы, лиды и цену лида.</p></div>
  </div>
  {stats()}
</div></section>
{program()}
{bonuses()}
{author()}
{final(sub='Познакомлю вас с командой агентов вживую и покажу, с какого агента начать свой офис.')}
{faq()}
'''
    return page(TITLE, DESC, 'https://fonts.googleapis.com/css2?family=Onest:wght@600;700;800;900&family=Manrope:wght@400;500;600;700;800&display=swap', V2_CSS, body, 'light')


# ───────────────────────── V3 · Неон · «Конвейер от идеи до оплаты» ─────────────────────────
V3_CSS = '''
/* Layout: tech pipeline — hero with live office frame, 7 numbered stations on a vertical rail */
:root { color-scheme: dark;
  --bg:#05060a; --bg2:#0a0c13; --card:#0d111c; --fg:#edf0ff; --muted:#8a92b2; --line:rgba(110,135,255,.18);
  --acc:#4b74ff; --acc-fg:#ffffff; --glow:rgba(75,116,255,.45); --display:Unbounded, "Arial Black", sans-serif; --body:Manrope, system-ui, sans-serif;
  --h-weight:700; --h-lh:1.12; --h-track:-.01em; --radius:14px; --btn-radius:12px; }
.h1 { font-size: clamp(30px, 5vw, 62px); }
.h2 { font-size: clamp(26px, 3.8vw, 44px); }
.h1 span, .h2 span { color: var(--acc); text-shadow: 0 0 28px var(--glow); }
.hero { padding-block: clamp(28px, 5vw, 72px); background:
  linear-gradient(var(--line) 1px, transparent 1px) 0 0/56px 56px, linear-gradient(90deg, var(--line) 1px, transparent 1px) 0 0/56px 56px, var(--bg);
  mask-image: none; }
.hero-grid { display: grid; grid-template-columns: minmax(0, 6fr) minmax(0, 6fr); gap: clamp(24px, 4vw, 56px); align-items: center; }
.hero-copy { display: grid; gap: 24px; }
.screen { border: 1px solid var(--line); border-radius: 18px; padding: 10px; background: var(--card);
  box-shadow: 0 0 0 1px rgba(75,116,255,.15), 0 40px 120px -40px var(--glow); }
.screen-bar { display: flex; align-items: center; gap: 6px; padding: 4px 6px 10px; font: 600 12px/1 var(--body); color: var(--muted); }
.screen-bar i { width: 9px; height: 9px; border-radius: 50%; background: #2a3152; }
.screen-bar i:first-child { background: var(--acc); }
.screen-bar span { margin-left: auto; }
.screen img { border-radius: 10px; width: 100%; cursor: zoom-in; }
.rail { display: grid; gap: 0; position: relative; }
.st { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 0 20px; position: relative; padding-bottom: clamp(36px, 5vw, 56px); }
.st::before { content: ""; position: absolute; left: 31px; top: 64px; bottom: 0; width: 2px; background: linear-gradient(var(--acc), var(--line)); }
.st:last-child::before { display: none; }
.num { width: 64px; height: 64px; border-radius: 16px; display: grid; place-items: center; font: 700 22px/1 var(--display);
  background: var(--card); border: 1px solid var(--acc); color: var(--fg); box-shadow: 0 0 30px -8px var(--glow); }
.st-body { display: grid; gap: 14px; min-width: 0; padding-top: 6px; }
.st-body h3 { font-size: clamp(19px, 2.2vw, 25px); }
.st-media { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.st-media.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.st-media.one { grid-template-columns: minmax(0, 1fr); max-width: 680px; }
.st .reels { grid-auto-columns: minmax(170px, 210px); }
.who { font: 600 12px/1.3 var(--body); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.who b { color: var(--acc); font-weight: 700; }
.pays { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: start; max-width: 760px; }
.pays img { border-radius: 12px; border: 1px solid var(--line); cursor: zoom-in; }
.callout { border: 1px solid var(--acc); border-radius: var(--radius); padding: clamp(22px, 4vw, 40px); background: radial-gradient(80% 120% at 0% 0%, rgba(75,116,255,.18), transparent 60%), var(--card);
  display: grid; gap: 18px; }
@media (max-width: 860px) { .hero-grid { grid-template-columns: 1fr; } .pays { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .st { grid-template-columns: 44px minmax(0, 1fr); gap: 0 14px; } .num { width: 44px; height: 44px; font-size: 16px; border-radius: 12px; } .st::before { left: 21px; top: 44px; } .st-media, .st-media.two { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
'''


def v3():
    stations = [
        ('Находит, что уже залетело', 'Анализ аудитории', 'Парсер собирает залетевшие ролики ниши и конкурентов: те, что набрали в разы больше обычного. Это сырьё для сценариев.',
         f'<div class="st-media two crop">{img("parser.jpg", "Парсер «Залётный»", cap="Парсер «Залётный»")}{img("marketing.jpg", "Витрина отдела маркетинга", cap="marketing.aicex.club — витрина работ отдела")}</div>'),
        ('Пишет сценарий', 'Сценарии', 'Берёт скелет залёта и пишет новый сценарий с хуком и кодовым словом. За один заход — 10 продающих рилсов.', ''),
        ('Монтирует ролик', 'Монтаж видео · Видео с аватаром', 'Монтаж кодом в 35+ стилях: хук, пословные субтитры, вставки, музыка. Если не хочется сниматься — ролик озвучивает ИИ-двойник.',
         reels()),
        ('Делает карусели и креативы', 'Карусели · Креативы', 'Карусели в 24 стилях и рекламные креативы под Meta: обложка-хук, пункты и призыв написать кодовое слово.',
         f'<div class="st-media two">{img("carousel-neon.jpg", "Карусель Неон")}{img("carousel-uimotion.jpg", "Карусель UI-моушн")}</div>'),
        ('Ведёт трафик', 'Threads-ветки · Публикации · Реклама Meta', 'Три ветки в Threads каждый день, выход роликов по контент-плану и рекламные кампании с отчётами по цене лида. Люди приходят в Telegram и бота.',
         f'<div class="st-media one crop">{img("analytics.jpg", "Сквозная аналитика", cap="Сквозная аналитика: от клика до оплаты")}</div>'),
        ('Прогревает в воронке', 'Воронки · Лид-магниты · Презентации · Лендинги', 'Лид-магнит → бот → прогрев по дням → вебинар → лендинг с оффером. Слайды и сайты агенты собирают за вечер.',
         f'<div class="st-media crop">{img("funnel-voronka.jpg", "Лид-магнит Воронка")}{img("funnel-day3.jpg", "Прогрев, день 3")}{img("funnel-offer.jpg", "Оффер")}{img("deck-practicum.jpg", "Слайды практикума")}{img("landing-a3.jpg", "Лендинг в стиле Неон")}{img("deck-svyazka.jpg", "Презентация Первые 10 000")}</div>'),
        ('Доводит до оплаты', 'Отдел продаж: 5 агентов', 'Отвечает на кодовые слова в комментариях, ведёт переписку в Direct, консультирует по базе знаний и закрывает сделку.',
         f'<div class="pays">{"".join(f"<img src=\"{A}pay-{i}.webp\" alt=\"Оплата ученика\" loading=\"lazy\" data-zoom>" for i in (1, 2, 3, 4))}</div>'),
    ]
    rail = ''.join(f'''<div class="st"><span class="num">{i:02d}</span><div class="st-body"><span class="who">Агент: <b>{who}</b></span><h3>{h}</h3><p class="muted">{p}</p>{m}</div></div>'''
                   for i, (h, who, p, m) in enumerate(stations, 1))
    body = f'''
<header class="hero" data-hero><div class="wrap hero-grid">
  <div class="hero-copy">
    {PILL}
    <h1 class="h1">От ролика до оплаты — <span>конвейер из ИИ-агентов</span></h1>
    <p class="lead">Мой ИИ-офис сам находит темы, пишет сценарии, монтирует креативы, ведёт трафик, прогревает в воронке и доводит до покупки. На практикуме разберу его по шагам и покажу, как за 15 минут в день делать контент, который приводит подписчиков, заявки и продажи.</p>
    {cta()}
  </div>
  <div class="screen"><div class="screen-bar"><i></i><i></i><i></i><span>hq2.aicex.club · офис онлайн</span></div>
    <img src="{A}office-hq2.jpg" alt="Живой 3D-офис агентов" data-zoom></div>
</div></header>

<section class="sec alt"><div class="wrap">{stats()}</div></section>

<section class="sec"><div class="wrap stack">
  <div class="head"><span class="eyebrow">Как работает маркетинговая команда</span><h2 class="h2">7 станций. <span>На каждой — агент</span></h2>
    <p class="lead">Агент сдаёт работу следующему, человек проверяет только ключевые точки. Всё на скриншотах — настоящие работы офиса.</p></div>
  <div class="rail">{rail}</div>
  <div class="callout"><h3 class="h2" style="font-size:clamp(22px,3vw,34px)">Этот конвейер я покажу <span>вживую</span> на практикуме</h3>
    <p class="muted">Откроем офис, посмотрим, кто над чем работает, и соберём ролик с нуля за 10 минут прямо в эфире.</p>{cta()}</div>
</div></section>
{program()}
{bonuses()}
{author()}
{final(sub='Разберу конвейер агентов по шагам: от залетевшего ролика до оплаты в Direct.')}
{faq()}
'''
    return page(TITLE, DESC, 'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap', V3_CSS, body)


# ───────────────────────── V4 · Постер · «Штат маркетинга vs агенты» ─────────────────────────
V4_CSS = '''
/* Layout: poster — giant condensed headlines, paper sections, role-by-role table, wall of works */
:root { color-scheme: dark;
  --bg:#0b0b0a; --bg2:#151513; --card:#171715; --fg:#f4f2ea; --muted:#a6a398; --line:rgba(244,242,234,.16);
  --acc:#c8ff2e; --acc-fg:#0b0b0a; --display:Oswald, Impact, "Arial Narrow", sans-serif; --body:Montserrat, system-ui, sans-serif;
  --h-case:uppercase; --h-weight:700; --h-lh:1.14; --h-track:-.005em; --radius:6px; --btn-radius:4px; }
.paper { --bg:#ebe8de; --bg2:#ebe8de; --card:#f6f4ec; --fg:#0b0b0a; --muted:#55534b; --line:rgba(11,11,10,.16); --acc:#0b0b0a; --acc-fg:#c8ff2e;
  background: var(--bg); color: var(--fg); }
.h1 { font-size: clamp(50px, 9vw, 124px); }
.h2 { font-size: clamp(40px, 7vw, 92px); }
.hl { background: linear-gradient(transparent 18%, var(--acc) 18%, var(--acc) 86%, transparent 86%); color: var(--acc-fg); padding: 0 .1em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.hero { padding-block: clamp(28px, 5vw, 64px) 0; overflow: hidden; }
.hero-grid { display: grid; grid-template-columns: minmax(0, 8fr) minmax(0, 4fr); gap: 16px; align-items: end; }
.hero-copy { display: grid; gap: 26px; padding-bottom: clamp(32px, 6vw, 72px); }
.hero-photo img { width: 100%; max-width: 420px; margin-left: auto; filter: grayscale(.15) contrast(1.05); }
.btn { text-transform: uppercase; letter-spacing: .04em; }
.tbl-wrap { overflow-x: auto; border: 2px solid var(--fg); }
.tbl { width: 100%; border-collapse: collapse; min-width: 720px; font-size: 15px; }
.tbl th { text-align: left; font: 600 17px/1.1 var(--display); text-transform: uppercase; letter-spacing: .02em; padding: 16px; background: var(--fg); color: var(--bg); }
.tbl td { padding: 14px 16px; border-top: 1px solid var(--line); vertical-align: top; line-height: 1.45; }
.tbl td:first-child { color: var(--muted); text-decoration: line-through; text-decoration-thickness: 2px; white-space: nowrap; }
.tbl td:nth-child(2) { font-weight: 700; white-space: nowrap; }
.tbl tr:hover td { background: var(--card); }
.big { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0; border-top: 2px solid var(--fg); }
.big div { padding: 26px 0 0; display: grid; gap: 8px; }
.big b { font: 700 clamp(64px, 10vw, 128px)/.9 var(--display); color: var(--acc); }
.big span { font-weight: 600; max-width: 26ch; }
.wall { columns: 4 220px; column-gap: 12px; }
.wall figure { break-inside: avoid; margin-bottom: 12px; }
.wall .reel { margin-bottom: 12px; break-inside: avoid; }
.stat b { font-size: clamp(36px, 4.6vw, 58px); }
@media (max-width: 760px) { .hero-grid { grid-template-columns: 1fr; } .hero-photo img { max-width: 300px; margin: 0 auto; } }
'''


def v4():
    rows = [
        ('Аналитик', 'Аналитика', 'Сводит рекламу, продажи и контент в один дашборд: ROMI, воронка от клика до оплаты'),
        ('Ресёрчер', 'Анализ аудитории', 'Находит залетевшие ролики ниши и конкурентов'),
        ('Сценарист', 'Сценарии', '10 продающих рилсов по найденному скелету за один заход'),
        ('Монтажёр', 'Монтаж видео', 'Монтирует кодом в 35+ стилях: хук, субтитры, вставки, музыка'),
        ('Оператор и спикер', 'Видео с аватаром', 'Ролики с ИИ-двойником моим голосом, без съёмки'),
        ('Дизайнер каруселей', 'Карусели', 'Карусели для Instagram в 24 стилях'),
        ('Дизайнер креативов', 'Креативы', 'Баннеры и видео-креативы для рекламы'),
        ('SMM-менеджер', 'Публикации', 'Контент-план и выход роликов в соцсети'),
        ('Копирайтер Threads', 'Threads-ветки', 'Три ветки в день и трафик в Telegram-канал'),
        ('Маркетолог воронок', 'Воронки', 'Бот, прогрев по дням, мост к офферу, напоминания'),
        ('Методолог', 'Лид-магниты', 'Гайды, уроки и презентации-подарки за подписку'),
        ('Дизайнер презентаций', 'Презентации', 'Слайды вебинаров, эфиров и этого практикума'),
        ('Веб-дизайнер', 'Лендинги', 'Лендинги в пяти стилях сразу на своём домене'),
        ('Менеджер в Direct', 'Отдел продаж', 'Пять агентов: комментарии, переписки, консультации, закрытие сделок'),
    ]
    tr = ''.join(f'<tr><td>{a}</td><td>{b}</td><td>{c}</td></tr>' for a, b, c in rows)
    wall_items = [img('carousel-palii.jpg', 'Карусель Палий'), reels(REELS[0:1]).replace('<div class="reels">', '').removesuffix('</div>'),
                  img('funnel-voronka.jpg', 'Лид-магнит Воронка'), img('landing-a4.jpg', 'Лендинг Постер'), img('deck-copper.jpg', 'Презентация Медь'),
                  reels(REELS[1:2]).replace('<div class="reels">', '').removesuffix('</div>'), img('montage-scheme.jpg', 'Монтаж Схема'),
                  img('funnel-offer.jpg', 'Оффер'), img('carousel-dvoinik.jpg', 'Карусель Двойник'), img('miniapp-montazh.jpg', 'Мини-апп монтажа'),
                  reels(REELS[3:4]).replace('<div class="reels">', '').removesuffix('</div>'), img('deck-svyazka.jpg', 'Презентация Первые 10 000'),
                  img('funnel-bridge.jpg', 'Мост к офферу'), img('landing-a2.jpg', 'Лендинг Светлый'), img('analytics.jpg', 'Аналитика'),
                  img('carousel-scheme.jpg', 'Карусель Схема')]
    body = f'''
<header class="hero" data-hero><div class="wrap hero-grid">
  <div class="hero-copy">
    {PILL}
    <h1 class="h1">Отдел маркетинга на 14 должностей. <span class="hl">В штате — 3 человека</span></h1>
    <p class="lead">Трафик, сценарии, монтаж, креативы, воронки, прогревы, презентации и клиенты — всё это у меня делают ИИ-агенты, а люди ими руководят. На практикуме покажу, как это работает, и как набирать подписчиков и продажи с помощью AI за 15 минут в день.</p>
    {cta()}
  </div>
  <div class="hero-photo"><img src="{A}ilya-hero.webp" alt="Илья Палий" fetchpriority="high"></div>
</div></header>

<section class="sec paper"><div class="wrap stack">
  <div class="head"><span class="eyebrow" style="color:var(--fg)">Штатное расписание</span><h2 class="h2">Кого заменили <span class="hl">агенты</span></h2>
    <p class="lead">Слева — кого обычно нанимают в отдел маркетинга и продаж. В середине — агент моего офиса. Справа — что он делает каждый день.</p></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Обычно нанимают</th><th>У меня работает</th><th>Что делает</th></tr></thead><tbody>{tr}</tbody></table></div>
  {cta(note='')}
</div></section>

<section class="sec"><div class="wrap stack">
  <div class="big">
    <div><b>$54 000</b><span>сэкономила мне система контента с ИИ</span></div>
    <div><b>$1 000 000</b><span>принесла эта же система</span></div>
  </div>
  {stats()}
</div></section>

<section class="sec paper"><div class="wrap stack">
  <div class="head"><span class="eyebrow" style="color:var(--fg)">Работы офиса</span><h2 class="h2">Это сделали <span class="hl">не люди</span></h2>
    <p class="lead">Ролики, карусели, воронки, лендинги, презентации — всё из истории задач моего офиса. Ролики включаются по нажатию.</p></div>
  <div class="wall">{''.join(wall_items)}</div>
</div></section>
{program('Что покажу за 2 вечера')}
{bonuses()}
{author()}
{final(title='Приходи посмотреть на офис без штата', sub='Покажу всех агентов вживую и разберу, кого из них подключить первым.')}
{faq()}
'''
    return page(TITLE, DESC, 'https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Montserrat:wght@400;500;600;700;800&display=swap', V4_CSS, body)


# ───────────────────────── V5 · Изумруд · «Отчёт офиса» ─────────────────────────
V5_CSS = '''
/* Layout: fintech report — revenue ledger hero, task journal table with dates, proof grid */
:root { color-scheme: dark;
  --bg:#060a08; --bg2:#0a110d; --card:#0d1612; --fg:#e7f2ec; --muted:#86a094; --line:rgba(90,220,160,.15);
  --acc:#34d399; --acc-fg:#03130b; --display:"Inter Tight", "Arial Narrow", sans-serif; --body:Manrope, system-ui, sans-serif;
  --h-weight:700; --h-track:-.025em; --h-lh:1.02; --radius:14px; --btn-radius:10px; }
.h1 { font-size: clamp(38px, 6vw, 78px); }
.h1 span, .h2 span { color: var(--acc); }
.hero { padding-block: clamp(28px, 5vw, 64px); background: radial-gradient(50% 80% at 85% 20%, rgba(52,211,153,.14), transparent 70%), var(--bg); }
.hero-grid { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: clamp(24px, 4vw, 56px); align-items: center; }
.hero-copy { display: grid; gap: 24px; }
.ledger { border: 1px solid var(--line); border-radius: 18px; background: var(--card); padding: 22px; display: grid; gap: 18px; font-variant-numeric: tabular-nums; }
.ledger-top { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--muted); }
.ledger .sum { font: 700 clamp(32px, 3.8vw, 48px)/1 var(--display); letter-spacing: -.03em; white-space: nowrap; }
.ledger .sum small { display: block; font-size: 14px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--acc); margin-top: 8px; }
.ledger dl { margin: 0; display: grid; gap: 0; }
.ledger dl div { display: flex; justify-content: space-between; gap: 12px; padding: 11px 0; border-top: 1px solid var(--line); font-size: 15px; }
.ledger dt { color: var(--muted); }
.ledger dd { margin: 0; font-weight: 700; }
.bar { height: 6px; border-radius: 6px; background: var(--line); overflow: hidden; }
.bar i { display: block; height: 100%; width: 0; background: var(--acc); animation: fill 1.6s .2s ease-out forwards; }
@keyframes fill { to { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .bar i { width: 100%; } }
.journal-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); }
.journal { width: 100%; border-collapse: collapse; min-width: 760px; font-size: 14.5px; font-variant-numeric: tabular-nums; }
.journal th { text-align: left; font: 600 12px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); padding: 16px; border-bottom: 1px solid var(--line); }
.journal td { padding: 14px 16px; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.45; }
.journal tr:last-child td { border-bottom: 0; }
.journal td:first-child { color: var(--muted); white-space: nowrap; }
.tag { display: inline-block; font: 700 11px/1 var(--body); letter-spacing: .06em; text-transform: uppercase; padding: 6px 8px; border-radius: 6px;
  background: rgba(52,211,153,.12); color: var(--acc); white-space: nowrap; }
.journal .ag { color: var(--muted); font-size: 13px; }
.proof { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; }
.proof > * { grid-column: span 3; }
.proof .w6 { grid-column: span 6; }
.proof .w4 { grid-column: span 4; }
.proof img[data-zoom] { border-radius: 12px; border: 1px solid var(--line); cursor: zoom-in; width: 100%; }
.reach { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; background: #fff; border-radius: 12px; padding: 12px; }
@media (max-width: 860px) { .hero-grid { grid-template-columns: 1fr; } .proof > *, .proof .w6, .proof .w4 { grid-column: span 6; } }
@media (max-width: 520px) { .proof > *, .proof .w6, .proof .w4 { grid-column: span 12; } }
'''


def v5():
    jr = ''.join(f'<tr><td>{d[8:10]}.{d[5:7]}.{d[:4]}</td><td><span class="tag">{k}</span></td><td>{t}</td><td class="ag">{a}</td></tr>' for d, k, t, a in LEDGER)
    body = f'''
<header class="hero" data-hero><div class="wrap hero-grid">
  <div class="hero-copy">
    {PILL}
    <h1 class="h1">84 млн ₽ без рекламы. <span>Маркетинг ведёт мой ИИ-офис</span></h1>
    <p class="lead">Команда ИИ-агентов приводит трафик, пишет сценарии, делает креативы, воронки, прогревы и презентации и доводит людей до оплаты. На практикуме покажу отчёт офиса изнутри: какие агенты что делают и сколько это приносит.</p>
    {cta()}
  </div>
  <div class="ledger" aria-label="Результаты системы AI-контента за 1,5 года">
    <div class="ledger-top"><span>Система AI-контента</span><span>за 1,5 года</span></div>
    <div class="sum">84 526 514 ₽<small>выручка</small></div>
    <div class="bar"><i></i></div>
    <dl>
      <div><dt>Принятых платежей</dt><dd>11 243</dd></div>
      <div><dt>Клиентов</dt><dd>≈11 000</dd></div>
      <div><dt>Заявок без рекламы</dt><dd>≈46 000</dd></div>
      <div><dt>Аудитория без бюджета</dt><dd>≈300 000</dd></div>
    </dl>
  </div>
</div></header>

<section class="sec alt"><div class="wrap stack">
  <div class="head"><span class="eyebrow">Журнал задач офиса</span><h2 class="h2">Что агенты сделали <span>за последние недели</span></h2>
    <p class="lead">Выписка из истории реальных задач на hq2.aicex.club. У каждой задачи в офисе есть дата и доказательство: ссылка на работу, сайт или код.</p></div>
  <div class="journal-wrap"><table class="journal"><thead><tr><th>Дата</th><th>Направление</th><th>Задача</th><th>Агенты</th></tr></thead><tbody>{jr}</tbody></table></div>
  {cta()}
</div></section>

<section class="sec"><div class="wrap stack">
  <div class="head"><span class="eyebrow">Работы маркетинговой команды</span><h2 class="h2">Креативы, воронки, презентации — <span>от агентов</span></h2></div>
  <div class="proof crop">
    <div class="w6">{img("office-hq2.jpg", "Живой офис", cap="Живой офис агентов: hq2.aicex.club")}</div>
    <div class="w6">{img("analytics.jpg", "Сквозная аналитика", cap="Сквозная аналитика: реклама × оплаты")}</div>
    {img("funnel-voronka.jpg", "Лид-магнит", cap="Лид-магнит «Воронка»")}
    {img("funnel-welcome.jpg", "Бот", cap="Прогрев в боте")}
    {img("funnel-offer.jpg", "Оффер", cap="Оффер")}
    {img("funnel-remind.jpg", "Напоминание", cap="Напоминание")}
    <div class="w4">{img("deck-practicum.jpg", "Слайды практикума", cap="Слайды практикума")}</div>
    <div class="w4">{img("landing-a5.jpg", "Лендинг Изумруд", cap="Лендинг «Изумруд»")}</div>
    <div class="w4">{img("deck-copper.jpg", "Эфир", cap="Эфир «Монтаж рилсов с Claude»")}</div>
    <div class="w6">{img("carousel-kobalt.jpg", "Карусель", cap="Карусель «Кобальт»")}</div>
    <div class="w6">{img("carousel-razbor.jpg", "Карусель", cap="Карусель «Разбор»")}</div>
  </div>
  {reels()}
</div></section>

<section class="sec alt"><div class="wrap stack">
  <div class="head"><span class="eyebrow">Куда это приводит</span><h2 class="h2">Охваты, заявки и <span>оплаты учеников</span></h2>
    <p class="lead">Один ролик даёт миллионы просмотров без рекламы. Дальше агенты продаж отвечают в Direct и доводят до покупки.</p></div>
  <div class="proof">
    <div class="w6"><div class="reach"><img src="{A}stat-views.webp" alt="12,4 млн просмотров" data-zoom><img src="{A}stat-actions.webp" alt="765 тысяч взаимодействий" data-zoom></div></div>
    <img src="{A}reel-1.webp" alt="Ролик в Instagram" loading="lazy" data-zoom>
    <img src="{A}reel-2.webp" alt="Ролик в Instagram" loading="lazy" data-zoom>
    <img src="{A}pay-1.webp" alt="Оплата ученика" loading="lazy" data-zoom>
    <img src="{A}pay-2.webp" alt="Оплата ученика" loading="lazy" data-zoom>
    <img src="{A}pay-3.webp" alt="Оплата ученика" loading="lazy" data-zoom>
    <img src="{A}pay-4.webp" alt="Оплата ученика" loading="lazy" data-zoom>
  </div>
</div></section>
{program()}
{bonuses('')}
{author('alt')}
{final(sub='Открою отчёт своего ИИ-офиса: агенты, их работы, заявки и продажи.', cls='')}
{faq('alt')}
'''
    return page(TITLE, DESC, 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700;800&family=Manrope:wght@400;500;600;700&display=swap', V5_CSS, body)


if __name__ == '__main__':
    for n, fn in enumerate([v1, v2, v3, v4, v5], 1):
        d = ROOT / f'v{n}'
        d.mkdir(exist_ok=True)
        (d / 'index.html').write_text(fn(), encoding='utf-8')
        print(f'v{n}/index.html')
