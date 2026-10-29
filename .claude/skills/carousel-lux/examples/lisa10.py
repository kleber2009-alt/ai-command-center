#!/usr/bin/env python3
"""Пример: 10 каруселей Лизы Ткачук, адаптированных под @ilia.paliy (дизайн-серия 29.10.2026).
   python3 examples/lisa10.py out/   →   node scripts/render.mjs out/jobs.json"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from lux import *  # noqa: F401,F403

def L1():
    n, tex = 7, "textures/leather.jpg"
    def tool(i, name, kind, img, url, text, crop=""):
        return (bg(tex, "rgba(0,0,0,.42)")
                + f"<div class='abs' style='left:0;right:0;top:92px;text-align:center'>"
                  f"<div class='tag'>{md(kind)}</div>"
                  f"<div class='serif' style='font-style:italic;font-weight:500;font-size:116px;line-height:1.05;margin-top:10px'>{md(name)}</div></div>"
                + window(110, 330, 860, img, url, crop)
                + arrow(470, 830, 120, rot=10)
                + f"<div class='abs glass' style='left:150px;right:150px;top:960px;padding:30px 36px;text-align:center'>"
                  f"<div class='serif' style='font-style:italic;font-size:40px;line-height:1.25'>{md(text)}</div></div>"
                + foot(i, n))
    return "l01-saity", "Эти сайты я бы спрятал", [
        cover("covers/c01.jpg", "Эти сайты", "я бы спрятал", "на них работает мой блог на 300 000 →", size=168),
        tool(2, "HeyGen", "01 · твой цифровой двойник", S / "heygen.jpg", "heygen.com",
             "**Готовый рилс с твоим лицом** — пишешь текст, двойник говорит его в кадре"),
        tool(3, "ElevenLabs", "02 · твой голос", S / "elevenlabs.jpg", "elevenlabs.io",
             "**Озвучка твоим голосом** — без студии, микрофона и дублей"),
        tool(4, "Higgsfield", "03 · кино без съёмочной группы", S / "higgsfield.jpg", "higgsfield.ai",
             "**Кинокадры и видео по описанию** — для обложек, вставок и хуков"),
        tool(5, "Remotion", "04 · монтаж кодом", S / "remotion.jpg", "remotion.dev",
             "**Claude монтирует ролик кодом:** субтитры, зумы и титры — без CapCut"),
        tool(6, "Nano Banana", "05 · обложки без фотосессии", S / "nanobanana.jpg", "gemini.google",
             "**Ты на обложке в любой сцене** — как на этой карусели"),
        cta(7, n, tex, "ДОК", "Пиши в комментариях", "и забирай файл, который соберёт тебе контент-план на месяц, сценарии рилс и карусели",
            "ИИ контент-продюсер", "ФАЙЛ ДЛЯ CLAUDE", proof="С этими сайтами мой блог вырос\nдо *300 000* подписчиков"),
    ], ("Пиши «ДОК» в комментариях — пришлю файл «ИИ контент-продюсер» для Claude: план на месяц, сценарии рилс и карусели под твой блог 🔥\n\n"
        "Эти 5 сайтов работают на мой блог каждый день: HeyGen снимает двойником, ElevenLabs озвучивает моим голосом, "
        "Higgsfield делает кинокадры, Remotion с Claude монтирует, Nano Banana рисует обложки.\n\n"
        "Сохраняй, чтобы не потерять 🤝")


def L2():
    n, tex = 6, "textures/tokyo.jpg"
    def prompt(i, title, rows, res):
        body = "".join(f"<div style='margin-top:26px'><span class='mono' style='font-size:22px;letter-spacing:2px;color:#E0B46A'>{k}</span>"
                       f"<div class='mono' style='font-size:29px;line-height:1.5;color:#EDE7DB;margin-top:6px'>{md(v)}</div></div>" for k, v in rows)
        return (bg(tex, "rgba(0,0,0,.5)")
                + f"<div class='abs' style='left:64px;right:64px;top:96px'>"
                  f"<div class='plaque' style='background:#B8322A;color:#F6F1E7'>Промпт {i-1}</div>"
                  f"<div class='serif' style='font-weight:600;font-size:76px;line-height:1;margin-top:26px'>{md(title)}</div></div>"
                + f"<div class='abs' style='left:64px;right:64px;top:400px;border-radius:26px;background:rgba(18,18,20,.88);border:1.5px solid rgba(255,255,255,.14);"
                  f"box-shadow:0 40px 100px rgba(0,0,0,.6);padding:36px 44px 44px'>"
                  f"<div style='display:flex;gap:10px;align-items:center;margin-bottom:6px'><span style='width:34px;height:34px;border-radius:50%;background:#D97757;display:inline-flex;align-items:center;justify-content:center;font-size:20px'>✳</span>"
                  f"<span class='mono' style='font-size:20px;color:#9b958c'>Claude · новый чат</span></div>{body}</div>"
                + f"<div class='abs' style='left:64px;right:64px;bottom:110px;display:flex;gap:16px;align-items:center'>"
                  f"<span class='it' style='font-size:40px'>Результат:</span><span class='p' style='font-size:28px'>{md(res)}</span></div>"
                + foot(i, n))
    return "l02-brend", "Claude собирает личный бренд", [
        cover("covers/c02.jpg", "Срочно:", "Claude соберёт тебе\nличный бренд", "4 промпта из 30 — сохраняй →", size=150, accent_size=86),
        prompt(2, "Почему выберут\n*именно тебя*", [("РОЛЬ", "Ты стратег личного бренда"),
               ("ЗАДАЧА", "Найди, за что меня выбирают, а не соседа по нише"),
               ("ШАГИ", "Задай 7 вопросов по одному: опыт, клиенты, результаты. Выдели 3 отличия, которые можно доказать"),
               ("ПРАВИЛА", "Без «индивидуального подхода». Каждое отличие — с фактом из моих ответов")],
               "позиционирование в одну фразу и 3 шапки профиля"),
        prompt(3, "Истории,\n*которые продают*", [("РОЛЬ", "Ты интервьюер-биограф"),
               ("ЗАДАЧА", "Достань из моей жизни истории для контента"),
               ("ШАГИ", "Спроси про 5 поворотных моментов: что было до, что я сделал, что стало"),
               ("ПРАВИЛА", "По одному вопросу. Дожимай детали, которые нельзя придумать")],
               "10 историй с готовым хуком для рилс"),
        prompt(4, "Твой\n*голос бренда*", [("РОЛЬ", "Ты редактор"),
               ("ЗАДАЧА", "Опиши, как я говорю"),
               ("ШАГИ", "Я пришлю 3 расшифровки. Выдели мои слова, длину фраз, юмор и запреты"),
               ("ПРАВИЛА", "Только по моим текстам, ничего не додумывай")],
               "гайд голоса и 5 примеров «как я / как не я»"),
        prompt(5, "Шапка,\n*которая продаёт*", [("РОЛЬ", "Ты упаковщик профилей"),
               ("ЗАДАЧА", "Собери шапку Instagram за 3 строки"),
               ("ШАГИ", "Кто я → какой результат даю → что получить прямо сейчас"),
               ("ПРАВИЛА", "Цифры вместо прилагательных. Последняя строка — призыв")],
               "5 вариантов шапки и 3 закрепа"),
        cta(6, n, tex, "БРЕНД", "Пиши в комментариях", "и забирай все 30 промптов: позиционирование, распаковка, голос, контент-план, упаковка и оффер",
            "30 промптов: личный бренд", "ДЛЯ CLAUDE И CHATGPT", photo="covers/c02.jpg"),
    ], ("Пиши «БРЕНД» в комментариях — пришлю 30 промптов «Личный бренд с нуля» для Claude и ChatGPT 🔥\n\n"
        "В карусели 4 из них: почему выберут именно тебя, истории, которые продают, голос бренда и шапка профиля. Копируй прямо со слайда.\n\n"
        "Сохраняй, чтобы не потерять 🤝")


def L3():
    n, tex = 7, "textures/concrete.jpg"
    def rule(i, old, new, visual, light=False):
        dark = not light
        base = (bg(tex, "rgba(0,0,0,.35)") if dark else
                f"<div class='abs' style='inset:0;background:#EDE6D8'></div><img class='bg' src='{f(G / tex)}' style='opacity:.18;mix-blend-mode:multiply'>")
        fg = "#F3EEE4" if dark else "#151311"
        return (base
                + f"<div class='abs' style='left:64px;right:64px;top:92px;color:{fg}'>"
                  f"<div class='osw' style='font-weight:600;font-size:56px;letter-spacing:3px'>СТАРОЕ ПРАВИЛО <span style='color:#C2412D'>✕</span></div>"
                  f"<div class='mono' style='font-size:30px;line-height:1.45;margin-top:14px;opacity:.85'>{md(old)}</div>"
                  f"<div style='display:flex;align-items:baseline;gap:14px;margin-top:40px'><span style='font-size:64px;color:#E0B46A'>✓</span>"
                  f"<span class='serif' style='font-style:italic;font-weight:600;font-size:78px;color:{'#E0B46A' if dark else '#A0702A'}'>Новое правило</span></div></div>"
                + underline(150, 380, 440, "#E0B46A")
                + f"<div class='abs card' style='left:64px;width:600px;top:440px;background:{'#F6F1E7' if dark else '#151311'};color:{'#151311' if dark else '#F3EEE4'};"
                  f"box-shadow:0 30px 80px rgba(0,0,0,.45)'><div class='mono' style='font-size:28px;line-height:1.5'>{md(new)}</div></div>"
                + visual + foot(i, n, light))
    return "l03-pravila", "Правила соцсетей изменились", [
        cover("covers/c03.jpg", "Правила соцсетей", "изменились навсегда", "кто не перестроится — отдаст аудиторию →", size=118, accent_size=92, badge="2026"),
        rule(2, "Пиши контент и снимай **каждый день**",
             "Нейросети пишут сценарий и монтируют, ты тратишь **15 минут** — или отдаёшь съёмку **цифровому двойнику**",
             shot(640, 600, 380, A / "reels.jpg", rot=4) + arrow(520, 760, 130, rot=20)),
        rule(3, "Придумывай идеи **сам**",
             "Бери темы, которые уже собрали миллионы просмотров. **Claude находит их за 5 минут**",
             shot(560, 720, 470, A / "table.jpg", rot=-3) + arrow(470, 880, 120, rot=-10, color="#151311"), light=True),
        rule(4, "Для блога нужна команда: продюсер, сценарист, монтажёр, SMM",
             "**Один человек и пять нейросетей**",
             shot(120, 760, 840, A / "icons3.jpg", rot=0, radius=26)),
        rule(5, "Сначала набери подписчиков, **потом продавай**",
             "Каждый ролик ведёт в Директ, где **ИИ отвечает 24/7** — а ты получаешь заявки",
             shot(640, 620, 380, A / "direct.jpg", rot=3) + arrow(540, 800, 120, rot=15, color="#151311"), light=True),
        (bg(tex, "rgba(0,0,0,.5)")
         + "<div class='abs' style='left:64px;right:64px;top:100px'><div class='tag'>мой блог по новым правилам</div>"
           "<div class='h1' style='margin-top:18px'>Так это работает\n<span class='it'>у меня</span></div></div>".replace("\n", "<br>")
         + shot(64, 420, 600, A / "profile.jpg", rot=-2, radius=14) + shot(420, 640, 600, A / "stats.jpg", rot=3, radius=14)
         + shot(140, 1010, 640, A / "payments.jpg", rot=-1, radius=10)
         + arrow2(700, 470, 200, rot=20, color="#E0B46A") + foot(6, n)),
        cta(7, n, tex, "АНАЛИЗ", "Пиши в комментариях", "и забирай файл «AI-аналитик блога»: Claude найдёт твои сильные темы и хуки и подскажет, что выпускать дальше",
            "AI-аналитик блога", "ФАЙЛ ДЛЯ CLAUDE", photo="covers/c03.jpg"),
    ], ("Пиши «АНАЛИЗ» в комментариях — пришлю файл «AI-аналитик блога» для Claude 🔥\n\n"
        "Старые правила: снимай каждый день, придумывай сам, собирай команду, сначала подписчики. Новые: нейросети пишут и монтируют, "
        "Claude находит темы, один человек и пять нейросетей, а каждый ролик ведёт в Директ, где ИИ отвечает 24/7.\n\n"
        "Так у меня 297 тысяч подписчиков и 11 252 оплаты.\n\nСохраняй, чтобы не потерять 🤝")


def L4():
    n, tex = 6, "textures/smoke.jpg"
    def tool(i, num, name, img, url, text):
        return (bg(tex, "rgba(0,0,0,.25)")
                + f"<div class='abs' style='left:64px;right:64px;top:84px'>"
                  f"<div style='display:flex;align-items:baseline;gap:20px'><span class='serif' style='font-size:150px;line-height:.8;color:#E0B46A;font-weight:500'>{num}</span>"
                  f"<span class='serif' style='font-size:100px;line-height:1;font-weight:600'>{md(name)}</span></div></div>"
                + window(90, 300, 900, img, url)
                + f"<div class='abs' style='left:110px;right:110px;top:920px;padding:30px 40px;border-radius:60px;background:#6B2A12;"
                  f"box-shadow:0 30px 70px rgba(0,0,0,.5);text-align:center'><div class='p' style='font-size:30px;color:#F6F1E7'>{md(text)}</div></div>"
                + foot(i, n))
    return "l04-video", "4 нейросети снимают за тебя", [
        cover("covers/c04.jpg", "4 нейросети,", "которые снимают\nза тебя", "камера больше не нужна →", size=140, accent_size=92),
        tool(2, "1", "HeyGen", S / "heygen.jpg", "heygen.com", "Пишешь текст — **цифровой двойник** говорит его в кадре с твоим лицом и голосом"),
        tool(3, "2", "Kling", S / "kling.jpg", "klingai.com", "Описываешь сцену — **ИИ превращает её в видео**: перебивки, хуки, b-roll"),
        tool(4, "3", "Higgsfield", S / "higgsfield.jpg", "higgsfield.ai", "**Кинематографичные кадры** и эффекты — как будто снимала команда"),
        tool(5, "4", "InVideo", S / "invideo.jpg", "invideo.io", "**ИИ-редактор:** собирает ролик из сценария, футажей и озвучки"),
        cta(6, n, tex, "ГОЛОС", "Пиши в комментариях", "и забирай файл, после которого Claude пишет сценарии для этих нейросетей твоими словами, а не как ИИ",
            "Claude пишет как человек", "ФАЙЛ ДЛЯ CLAUDE", photo="covers/c04.jpg"),
    ], ("Пиши «ГОЛОС» в комментариях — пришлю файл, после которого Claude пишет сценарии твоими словами 🔥\n\n"
        "4 нейросети, которые снимают за тебя: HeyGen — цифровой двойник, Kling — видео по описанию, Higgsfield — кинокадры, InVideo — ИИ-редактор.\n\n"
        "Но двойник говорит то, что ты ему напишешь. Чтобы сценарий звучал как ты — нужен «паспорт голоса».\n\nСохраняй, чтобы не потерять 🤝")


def L5():
    n, tex = 8, "textures/stone.jpg"
    def step(i, k, title, body, visual):
        return (bg(tex, "rgba(0,0,0,.3)")
                + f"<div class='abs' style='left:64px;right:64px;top:92px'><div class='mono' style='font-size:24px;color:#9b958c'>шаг {k}</div>"
                  f"<div class='h2' style='font-size:58px;margin-top:14px'>{md(title)}</div>"
                  f"<div class='p' style='margin-top:20px'>{md(body)}</div></div>" + visual + foot(i, n))
    return "l05-s-nulya", "Блог с нуля в 2026", [
        cover("covers/c05.jpg", "Если бы я начал блог\nс нуля в 2026,", "я бы сделал\nтолько это", size=92, accent_size=88),
        (bg(tex, "rgba(0,0,0,.3)") + clip(450, 330)
         + "<div class='abs' style='left:64px;right:64px;top:90px'><div class='h2' style='font-size:56px'>Блог, на который тратишь</div>"
           "<div style='position:relative;display:inline-block;margin-top:10px;padding:4px 30px 8px'><span class='serif' style='font-weight:600;font-size:84px;color:#E0B46A'>15 минут в день</span>"
           + oval(0, -10, 600, 130) + "</div></div>"
         + "<div class='abs paper' style='left:110px;right:110px;top:420px;height:760px;padding:120px 60px 40px'>"
           "<div class='mono' style='font-size:24px;letter-spacing:3px;color:#7a6f5f'>БЕЗ:</div>"
           + "".join(f"<div style='display:flex;gap:18px;align-items:center;margin-top:20px'><span style='width:30px;height:30px;border:2.5px solid #151311;border-radius:50%'></span>"
                     f"<span class='serif' style='font-size:52px;font-weight:600'>{t}</span></div>" for t in ["камеры и студии", "долгих съёмок", "команды", "выгорания"])
           + "</div>" + shot(600, 760, 330, A / "reels.jpg", rot=6, radius=16) + foot(2, n)),
        step(3, 1, "Определи нишу,\n*в которой хочешь расти*", "Одна тема — одна боль. Блог «обо всём» не растёт",
             "<div class='abs' style='left:64px;right:64px;top:520px;display:grid;grid-template-columns:1fr 1fr;gap:18px 40px'>"
             + "".join(f"<div style='display:flex;gap:14px;align-items:center'><span style='width:22px;height:22px;border:2px solid #E0B46A;border-radius:50%'></span><span class='p' style='font-size:34px;color:#F3EEE4'>{t}</span></div>"
                       for t in ["психология", "продажи", "нейросети", "маркетинг", "фитнес", "финансы", "недвижимость", "и т. д."])
             + "</div>" + shot(330, 860, 420, A / "profile.jpg", rot=-3, radius=12)),
        step(4, 2, "Найди темы,\n*которые уже залетели*", "Используй этот промпт в Claude:",
             "<div class='abs' style='left:64px;right:64px;top:470px;border-radius:24px;background:#F1EBDF;color:#151311;padding:36px 40px;box-shadow:0 40px 90px rgba(0,0,0,.6)'>"
             "<div class='mono' style='font-size:27px;line-height:1.5'>Вот 20 залетевших роликов в моей нише [вставь ссылки и просмотры]. Сгруппируй темы и предложи 15, которых у меня ещё не было. К каждой — хук на первые 3 секунды.</div></div>"
             + arrow(720, 860, 140, rot=20, color="#E0B46A") + shot(140, 900, 560, A / "table.jpg", rot=-2, radius=14)),
        step(5, 3, "Сценарий — Claude,\n*съёмка — двойник*", "Ролик каждый день без камеры:",
             "<div class='abs' style='left:64px;right:64px;top:470px'>"
             + "".join(f"<div class='glass' style='padding:22px 30px;margin-top:16px;display:flex;gap:20px;align-items:center'><span class='num' style='font-size:52px'>{k}</span>"
                       f"<span class='p' style='font-size:30px;color:#F3EEE4'>{t}</span></div>" for k, t in [("1", "Claude пишет сценарий твоими словами"), ("2", "HeyGen-двойник говорит его в кадре"), ("3", "Claude монтирует: субтитры, зумы, титры")])
             + "</div>" + shot(560, 930, 400, A / "result.jpg", rot=4, radius=14)),
        step(6, 4, "Под каждым роликом —\n*кодовое слово*", "Слово в комментариях → материал в Директ → подписка и заявка",
             shot(110, 560, 520, A / "direct.jpg", rot=-3) + arrow(600, 640, 140, rot=40, color="#E0B46A")
             + "<div class='abs glass' style='left:640px;right:64px;top:820px;padding:26px'><div class='serif' style='font-style:italic;font-size:38px;line-height:1.2'>до <b>1 500</b> диалогов в день — без менеджеров</div></div>"),
        (bg(tex, "rgba(0,0,0,.45)")
         + "<div class='abs' style='left:64px;right:64px;top:100px'><div class='h2' style='font-size:56px'>Мои результаты\n<span class='it' style='font-size:72px'>на этой системе:</span></div></div>".replace("\n", "<br>")
         + "<div class='abs' style='left:64px;right:64px;top:360px'>"
         + "".join(f"<div style='display:flex;gap:18px;align-items:baseline;margin-top:14px'><span style='width:22px;height:22px;border:2px solid #E0B46A;border-radius:50%'></span>"
                   f"<span class='p' style='font-size:36px;color:#F3EEE4'>{md(t)}</span></div>" for t in ["**≈300 000** подписчиков", "**≈46 000** заявок без рекламы", "**86 млн ₽** выручки", "**15 минут** в день на блог"])
         + "</div>" + shot(380, 760, 640, A / "stats.jpg", rot=3, radius=14) + shot(64, 1030, 560, A / "payments.jpg", rot=-2, radius=10) + foot(7, n)),
        cta(8, n, tex, "ЛЕГЕНДЫ", "Хочешь стартовать с нуля\nс планом на 90 дней?", "Пиши слово — пришлю скилл «Команда 8 легенд»: 6 вопросов, и у тебя оффер, контент, воронка и план роста",
            "Команда 8 легенд", "СКИЛЛ ДЛЯ CLAUDE", photo="covers/c05.jpg"),
    ], ("Пиши «ЛЕГЕНДЫ» в комментариях — пришлю скилл «Команда 8 легенд» для Claude: оффер, контент, воронка и план роста на 90 дней 🔥\n\n"
        "Если бы я начинал блог с нуля в 2026, я бы сделал 4 вещи: одна ниша, темы, которые уже залетели, ролик каждый день с ИИ и кодовое слово под каждым роликом.\n\n"
        "На этой системе — около 300 000 подписчиков и 46 000 заявок без рекламы, а на блог уходит 15 минут в день.\n\nСохраняй, чтобы не потерять 🤝")


def L6():
    n, tex = 7, "textures/brush.jpg"
    def vs(i, k, title, bad, good):
        return (bg(tex, "rgba(0,0,0,.2)")
                + f"<div class='abs' style='left:64px;right:64px;top:92px'><div class='tag'>{k}</div><div class='h1' style='margin-top:14px;font-size:90px'>{md(title)}</div></div>"
                + f"<div class='abs card' style='left:64px;right:64px;top:400px;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.18)'>"
                  f"<div class='osw' style='font-size:30px;letter-spacing:4px;color:#C2412D'>✕ ЛИСТАЮТ</div>"
                  f"<div class='serif' style='font-size:50px;line-height:1.15;margin-top:12px;color:rgba(243,238,228,.7)'>{md(bad)}</div></div>"
                + strike(90, 540, 880)
                + f"<div class='abs card' style='left:64px;right:64px;top:760px;background:#F6F1E7;color:#151311;box-shadow:0 40px 90px rgba(0,0,0,.6)'>"
                  f"<div class='osw' style='font-size:30px;letter-spacing:4px;color:#A0702A'>✓ ДОСМАТРИВАЮТ</div>"
                  f"<div class='serif' style='font-size:52px;line-height:1.15;margin-top:12px;font-weight:600'>{md(good)}</div></div>"
                + foot(i, n))
    return "l06-vs", "Слабый рилс VS сильный", [
        cover("covers/c06.jpg", "Слабый рилс", "vs рилс на миллион", "4 отличия — проверь свой последний →", size=150, accent_size=96),
        vs(2, "01 · хук", "Первая фраза", "«Всем привет, сегодня расскажу про…»", "«Я уволил монтажёра — и роликов стало больше»"),
        vs(3, "02 · история", "Внутри", "5 советов списком", "Одна история из твоей недели с деталью, которую нельзя придумать"),
        vs(4, "03 · конкретика", "Слова", "«эффективно», «качественно», «быстро»", "«4 минуты», «1 500 сообщений», «15 минут в день»"),
        vs(5, "04 · финал", "Концовка", "«Подписывайтесь на канал»", "Кодовое слово и понятная выгода за него"),
        (bg(tex, "rgba(0,0,0,.35)")
         + "<div class='abs' style='left:64px;right:64px;top:100px'><div class='h1'>Кто проверяет\n<span class='it'>мои рилс</span></div>"
           "<div class='p' style='margin-top:24px'>Коуч в Claude по методам <b>MrBeast, Pixar, Джобса, Опры и Гэри Ви</b>. Задаёт вопросы по одному и показывает, на какой фразе зритель уйдёт</div></div>".replace("\n", "<br>")
         + shot(110, 600, 860, A / "reels.jpg", rot=-2, radius=18)
         + "<div class='abs chip' style='left:640px;top:1080px'>5–10 млн просмотров в месяц</div>" + foot(6, n)),
        cta(7, n, tex, "КОУЧ", "Пиши в комментариях", "и забирай скилл «Коуч по рилс»: он не пишет за тебя, а вопросами находит историю и собирает из неё ролик",
            "Коуч по рилс", "СКИЛЛ ДЛЯ CLAUDE", photo="covers/c06.jpg"),
    ], ("Пиши «КОУЧ» в комментариях — пришлю скилл «Коуч по рилс» для Claude 🔥\n\n"
        "Слабый рилс начинается с «всем привет», внутри советы списком, общие слова и «подписывайтесь» в конце. "
        "Сильный: результат или конфликт в первой фразе, одна живая история, цифры и кодовое слово с выгодой.\n\n"
        "Эти 4 вещи за меня проверяет коуч по методам MrBeast, Pixar, Джобса, Опры и Гэри Ви.\n\nСохраняй, чтобы не потерять 🤝")


def L7():
    n, tex = 7, "textures/edit.jpg"
    def phrase(i, k, ph, what, visual):
        return (bg(tex, "linear-gradient(180deg,rgba(0,0,0,.82) 0,rgba(0,0,0,.7) 45%,rgba(0,0,0,.35) 100%)")
                + f"<div class='abs' style='left:64px;right:64px;top:96px'><div class='tag'>фраза {k}</div>"
                  f"<div style='margin-top:20px;border-radius:24px;background:rgba(18,18,20,.9);border:1.5px solid rgba(255,255,255,.14);padding:30px 36px;box-shadow:0 40px 90px rgba(0,0,0,.6)'>"
                  f"<div style='display:flex;gap:12px;align-items:center'><span style='width:32px;height:32px;border-radius:50%;background:#D97757;display:inline-flex;align-items:center;justify-content:center'>✳</span>"
                  f"<span class='mono' style='font-size:20px;color:#9b958c'>ты → Claude</span></div>"
                  f"<div class='mono' style='font-size:34px;line-height:1.4;margin-top:14px'>«{md(ph)}»</div></div>"
                  f"<div class='p' style='margin-top:26px'>{md(what)}</div></div>" + visual + foot(i, n))
    return "l07-capcut", "Удали CapCut", [
        cover("covers/c07.jpg", "Удали CapCut:", "5 фраз, которыми\nClaude монтирует", "пока ты пьёшь кофе →", size=150, accent_size=86),
        phrase(2, 1, "Смонтируй рилс из этого видео в моём стиле", "Claude режет дубли и паузы, ставит **субтитры и заголовки**", shot(170, 700, 740, A / "montage.jpg", rot=-2)),
        phrase(3, 2, "Поставь зум и звук на главных словах", "Акценты ровно там, где мысль, — ролик держит внимание", shot(240, 700, 600, A / "result.jpg", rot=2)),
        phrase(4, 3, "Сделай монтаж динамичнее, как в референсе", "Прикладываешь любой залетевший ролик — Claude повторяет ритм", shot(140, 720, 800, A / "reels.jpg", rot=-1)),
        phrase(5, 4, "Нарежь из часового эфира 5 рилс", "Из одной записи — **контент на неделю**", "<div class='abs' style='left:64px;right:64px;top:760px;display:flex;gap:18px'>"
               + "".join(f"<div class='glass' style='flex:1;height:300px;display:flex;align-items:center;justify-content:center'><span class='serif' style='font-size:80px;font-style:italic;color:#E0B46A'>{k}</span></div>" for k in range(1, 6)) + "</div>"),
        phrase(6, 5, "Сделай обложку и подпись с кодовым словом", "Ролик выходит **упакованным** — остаётся нажать «Опубликовать»",
               "<div class='abs chip' style='left:120px;top:800px;font-size:30px;padding:16px 28px'>4 минуты вместо 2–3 дней у монтажёра</div>"
               + arrow2(380, 900, 260, rot=10, color="#E0B46A")),
        cta(7, n, tex, "МОНТАЖ", "Пиши в комментариях", "и забирай сетап, с которым Claude сам монтирует твои рилс",
            "Сетап AI-монтажёра", "ДЛЯ CLAUDE", photo="covers/c07.jpg"),
    ], ("Пиши «МОНТАЖ» в комментариях — пришлю сетап, с которым Claude сам монтирует твои рилс 🔥\n\n"
        "5 фраз, которые заменяют CapCut: смонтируй в моём стиле, поставь зум и звук на главных словах, сделай динамичнее по референсу, "
        "нарежь эфир на рилс и упакуй с обложкой и подписью.\n\nСохраняй, чтобы не потерять 🤝")


def L8():
    n, tex = 7, "textures/walnut.jpg"
    def setting(i, k, name, where, why):
        return (bg(tex, "rgba(0,0,0,.25)")
                + f"<div class='abs paper' style='left:90px;right:90px;top:150px;height:980px;padding:70px 64px;transform:rotate(-1.2deg)'>"
                  f"<div class='mono' style='font-size:24px;letter-spacing:3px;color:#8a7c66'>НАСТРОЙКА {k} / 5</div>"
                  f"<div class='serif' style='font-weight:700;font-size:112px;line-height:1;margin-top:26px'>{md(name)}</div>"
                  f"<div style='height:3px;width:160px;background:#A0702A;margin:30px 0'></div>"
                  f"<div class='mono' style='font-size:24px;color:#8a7c66;letter-spacing:2px'>ГДЕ</div>"
                  f"<div style='font-family:Manrope;font-size:40px;line-height:1.4;margin-top:12px'>{md(where)}</div>"
                  f"<div class='mono' style='font-size:24px;color:#8a7c66;letter-spacing:2px;margin-top:56px'>ЧТО ДАЁТ</div>"
                  f"<div class='serif' style='font-style:italic;font-size:60px;line-height:1.15;margin-top:12px;font-weight:600'>{md(why)}</div></div>"
                + tape(420, 120, 220, -4) + foot(i, n))
    return "l08-nastroiki", "Настройки Claude", [
        cover("covers/c08.jpg", "Настройки Claude,", "которые изменят\nтвой блог", "5 штук — включи сегодня →", size=128, accent_size=88),
        setting(2, 1, "Проекты", "Создай проект «Блог» и загрузи туда свои лучшие сценарии, статистику и оффер",
                "Claude помнит контекст и пишет под твой блог, а не «в целом»"),
        setting(3, 2, "Инструкции проекта", "В проекте → инструкции: кто ты, для кого пишешь, какой формат и какое кодовое слово в конце",
                "Не нужно объяснять заново в каждом чате"),
        setting(4, 3, "Стили", "Настройки → стили → создать стиль по 3 своим текстам",
                "Ответы звучат твоим голосом, а не как нейросеть"),
        setting(5, 4, "Скиллы", "Загрузи готовый скилл: монтаж, карусели, разбор статистики",
                "Claude выполняет задачу по твоей инструкции одной фразой"),
        setting(6, 5, "Коннекторы", "Подключи Google Drive, Notion или почту",
                "Claude сам берёт данные — тебе не нужно копировать"),
        cta(7, n, tex, "ЧЕЛОВЕК", "Пиши в комментариях", "и забирай файл, который настроит Claude под твою манеру речи",
            "Claude пишет как человек", "ФАЙЛ ДЛЯ CLAUDE", photo="covers/c08.jpg"),
    ], ("Пиши «ЧЕЛОВЕК» в комментариях — пришлю файл, который настроит Claude под твою манеру речи 🔥\n\n"
        "5 настроек Claude, которые меняют качество контента: проекты, инструкции проекта, стили, скиллы и коннекторы. "
        "Включи их один раз — и Claude перестанет писать «в целом».\n\nСохраняй, чтобы не потерять 🤝")


def L9():
    n, tex = 6, "textures/marble.jpg"
    def group(i, k, title, items, visual=""):
        rows = "".join(f"<div class='glass' style='padding:34px 36px;margin-top:24px;display:flex;gap:30px;align-items:center'>"
                       f"<img src='{f(A / ic.replace('.png', '.jpg'))}' style='width:120px;height:120px;object-fit:contain;border-radius:22px'>"
                       f"<div><div style='font-family:Manrope;font-weight:800;font-size:42px'>{md(nm)}</div>"
                       f"<div class='p' style='font-size:31px'>{md(t)}</div></div></div>" for ic, nm, t in items)
        return (bg(tex, "rgba(0,0,0,.3)")
                + f"<div class='abs' style='left:64px;right:64px;top:92px'><div class='serif' style='font-size:150px;line-height:.8;color:#E0B46A;font-weight:500'>{k}</div>"
                  f"<div class='h1' style='margin-top:10px'>{md(title)}</div><div style='margin-top:30px'>{rows}</div></div>" + visual + foot(i, n))
    return "l09-otdel", "Если ты не используешь это", [
        cover("covers/c09.jpg", "Если ты не используешь это,", "ты уже отстаёшь\nв 2026", "сохрани, пока не потерял →", size=86, accent_size=82),
        group(2, "01", "Для твоих\n*рилс*", [("claudeicon.png", "Claude", "сценарии по темам, которые залетели"), ("heygenicon.png", "HeyGen", "цифровой двойник в кадре"), ("elevenicon.png", "ElevenLabs", "озвучка твоим голосом")]),
        group(3, "02", "Для каруселей\n*и обложек*", [("banana.png", "Nano Banana", "ты на обложке без фотосессии"), ("claudeicon.png", "Claude Design", "карусели в твоём стиле"), ("claudeicon.png", "Claude + скиллы", "монтаж одной фразой")]),
        group(4, "03", "Для Директа\n*и продаж*", [("claudeicon.png", "ИИ-менеджер", "отвечает каждому 24/7"), ("claudeicon.png", "Кодовое слово", "из комментария — сразу в диалог")],
              shot(240, 900, 600, A / "direct.jpg", rot=-2)),
        (bg(tex, "rgba(0,0,0,.42)")
         + "<div class='abs' style='left:64px;right:64px;top:100px'><div class='h1'>Либо всё это\n<span class='it'>сразу в Claude</span></div>"
           "<div class='p' style='margin-top:24px'>Один файл ставит в Claude <b>отдел маркетинга:</b></div></div>".replace("\n", "<br>")
         + "<div class='abs' style='left:64px;right:64px;top:470px;display:grid;grid-template-columns:1fr 1fr;gap:22px'>"
         + "".join(f"<div class='glass' style='padding:36px;min-height:230px'><div class='num' style='font-size:70px'>{k}</div><div style='font-family:Manrope;font-weight:800;font-size:42px;margin-top:6px'>{a}</div>"
                   f"<div class='p' style='font-size:30px;margin-top:8px'>{b}</div></div>" for k, a, b in [("1", "Аналитик", "что залетело и что повторить"), ("2", "Сценарист", "ролики по залетевшим темам"), ("3", "Редактор", "текст твоим голосом"), ("4", "Упаковщик", "хуки, обложки, подписи")])
         + "</div>" + foot(5, n)),
        cta(6, n, tex, "ОТДЕЛ", "Пиши в комментариях", "и забирай файл, который за 2 минуты ставит в Claude отдел маркетинга",
            "Отдел маркетинга в Claude", "ФАЙЛ ДЛЯ CLAUDE", photo="covers/c09.jpg"),
    ], ("Пиши «ОТДЕЛ» в комментариях — пришлю файл, который за 2 минуты ставит в Claude отдел маркетинга 🔥\n\n"
        "Для рилс — Claude, HeyGen, ElevenLabs. Для каруселей и обложек — Nano Banana и Claude Design. Для Директа — ИИ-менеджер и кодовые слова.\n\n"
        "А можно не собирать по частям: аналитик, сценарист, редактор и упаковщик в одном Claude.\n\nСохраняй, чтобы не потерять 🤝")


def L10():
    n, tex = 7, "textures/steel.jpg"
    def cmds(i, k0, title, items):
        rows = "".join(f"<div style='display:flex;gap:26px;align-items:flex-start;padding:30px 0;border-bottom:1px solid rgba(255,255,255,.12)'>"
                       f"<span class='num' style='font-size:60px;min-width:70px;line-height:1'>{k0+j}</span>"
                       f"<div><span class='mono' style='font-size:34px;background:#E0B46A;color:#111;padding:6px 16px;border-radius:8px'>{md(c)}</span>"
                       f"<div class='p' style='font-size:33px;margin-top:14px'>{md(d)}</div></div></div>" for j, (c, d) in enumerate(items))
        return (bg(tex, "rgba(0,0,0,.4)")
                + f"<div class='abs' style='left:64px;right:64px;top:90px'><div class='tag'>команды {k0}–{k0+len(items)-1}</div>"
                  f"<div class='h1' style='margin-top:12px;font-size:80px'>{md(title)}</div>"
                  f"<div style='margin-top:22px;border-radius:24px;background:rgba(12,12,14,.82);border:1.5px solid rgba(255,255,255,.14);padding:12px 36px'>{rows}</div></div>"
                + foot(i, n))
    return "l10-rezhim-boga", "Режим бога в Claude", [
        cover("covers/c10.jpg", "Режим бога в Claude:", "20 команд\nдля контента", "сохрани и вставляй по одной →", size=104, accent_size=96),
        cmds(2, 1, "Хуки и *темы*", [("/темы", "10 тем, которые залетели в нише за месяц"), ("/хук", "10 хуков разных типов на одну тему"),
                                    ("/первая-фраза", "переписать начало, чтобы не пролистали"), ("/сравни", "какой хук сильнее и почему")]),
        cmds(3, 5, "Сценарии", [("/интервью", "5 вопросов → сценарий из твоих ответов"), ("/сократи", "до 40 секунд без потери смысла"),
                               ("/конкретика", "цифры, названия, время вместо общих слов"), ("/финал", "концовка с кодовым словом и выгодой")]),
        cmds(4, 9, "Карусели *и упаковка*", [("/карусель", "разбить ролик на 8 слайдов"), ("/обложка", "5 вариантов: 2–3 строки и слово-акцент"),
                                            ("/подпись", "слово в первой строке и 2 абзаца"), ("/шапка", "3 строки профиля, которые продают")]),
        cmds(5, 13, "Рост *и продажи*", [("/конкуренты", "что залетает у 5 соседей по нише"), ("/аудитория", "боли и слова твоей аудитории"),
                                        ("/оффер", "предложение, от которого сложно отказаться"), ("/воронка", "путь: просмотр → Директ → заявка")]),
        cmds(6, 17, "Голос *и качество*", [("/мой-голос", "писать как я, по 3 моим текстам"), ("/упрости", "чтобы понял 12-летний"),
                                          ("/критик", "жёсткий разбор: где зритель уйдёт"), ("/план", "контент на неделю: тема, хук, формат, слово")]),
        cta(7, n, tex, "ГОЛОС", "Чтобы все 20 команд\nписали твоим голосом —", "пиши слово и забирай файл: по 3–5 твоим роликам Claude соберёт «паспорт голоса»",
            "Паспорт голоса", "ФАЙЛ ДЛЯ CLAUDE", photo="covers/c10.jpg"),
    ], ("Пиши «ГОЛОС» в комментариях — пришлю файл, по которому Claude соберёт «паспорт голоса» и будет писать как ты 🔥\n\n"
        "20 команд для контента: хуки и темы, сценарии, карусели и упаковка, рост и продажи, голос и качество. "
        "Это не встроенные команды Claude, а короткие запросы — сохрани и вставляй по одной.\n\nСохраняй, чтобы не потерять 🤝")



CAROUSELS = [L1, L2, L3, L4, L5, L6, L7, L8, L9, L10]

if __name__ == "__main__":
    build(CAROUSELS, sys.argv[1] if len(sys.argv) > 1 else "out")
