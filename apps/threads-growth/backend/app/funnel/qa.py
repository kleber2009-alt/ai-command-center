"""QA-чек-лист ветки (§13 скилла) — формальная часть, без сети и LLM.

Смысловые пункты («тема понятна вне ниши», «нет чужих формулировок», «нет обещаний
вылечить») проверяет агент-редактор (agents.review_thread). Здесь — то, что
проверяется кодом: длины, числа, место мид-ролла, ссылки, [уточнить], громкость.

hard-проверки блокируют ✅ и публикацию (Threads отклонит пост >500 символов,
а «[уточнить]» нельзя выпускать в ленту); остальные — подсказки в карточке.

Проверка:  python -m app.funnel.qa
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass

LINK = "{link}"   # подписка на канал (своя ссылка-приглашение на ветку)
POST = "{post}"   # пост-приёмник с материалом (у закрытого канала открывается после подписки)
MAX_POST = 500
MAX_HOOK_WORDS = 15
CLARIFY = "[уточнить]"
# Ссылка-приглашение t.me/+XXXXXXXXXXXXXXXX ≈ 30 символов; берём с запасом,
# пока реальной ссылки ещё нет.
LINK_PLACEHOLDER_LEN = 40
FORBIDDEN_CTA = (
    "подписывайтесь",
    "подпишитесь на канал",
    "ссылка в профиле",
    "больше полезного в канале",
)
CONTINUE_MARKERS = ("продолж", "👇", "↓")
_EMOJI = re.compile("[\U0001F300-\U0001FAFF\U00002600-\U000027BF]")


@dataclass
class Check:
    name: str
    ok: bool
    note: str = ""
    hard: bool = False


def render_posts(hook: str, body: list[str], link: str | None, placeholder: str | None = None,
                 post: str | None = None) -> list[str]:
    """Полный текст ветки: пост 1 = хук, дальше тело; {link} → ссылка-подписка, {post} → пост с материалом.
    Без ссылки — placeholder (для показа) или строка длиной типичной ссылки (для проверки длин)."""
    sub = link or placeholder or ("x" * LINK_PLACEHOLDER_LEN)
    psub = post or placeholder or ("x" * LINK_PLACEHOLDER_LEN)
    return [p.replace(LINK, sub).replace(POST, psub) for p in [hook, *body]]


def first_line(text: str) -> str:
    for line in (text or "").splitlines():
        if line.strip():
            return line.strip()
    return ""


def count_words(text: str) -> int:
    return len(re.findall(r"[\w’'-]+", text or ""))


def count_numbers(text: str) -> int:
    """Числовые якоря: «30–80К» = два числа, «35 минут» = одно."""
    return len(re.findall(r"\d+(?:[.,]\d+)?", text or ""))


def caps_words(line: str) -> int:
    """Слова капсом длиннее 3 букв (аббревиатуры ИИ/GPT/TG не считаем)."""
    return sum(1 for w in re.findall(r"[A-Za-zА-Яа-яЁё]+", line or "") if len(w) > 3 and w.isupper())


def link_positions(posts: list[str]) -> list[int]:
    """Номера постов (1..N), где стоит ссылка."""
    return [i for i, p in enumerate(posts, start=1) if LINK in p]


def run_checks(hook: str, body: list[str], *, link: str | None, voice_level: int,
               has_receiver: bool, link_live: bool | None = None, post: str | None = None) -> list[Check]:
    raw = [hook, *body]
    full = render_posts(hook, body, link, post=post)
    n = len(raw)
    checks: list[Check] = []

    too_long = [f"{i}/{n}: {len(p)}" for i, p in enumerate(full, start=1) if len(p) > MAX_POST]
    checks.append(Check("Каждый пост ≤500 символов", not too_long,
                        "длиннее: " + ", ".join(too_long) if too_long else "", hard=True))

    unclear = [f"{i}/{n}" for i, p in enumerate(raw, start=1) if CLARIFY in p]
    checks.append(Check("Цифры подтверждены (нет «[уточнить]»)", not unclear,
                        "ответьте на вопросы, посты " + ", ".join(unclear) if unclear else "", hard=True))

    checks.append(Check("4–10 постов", 4 <= n <= 10, f"сейчас {n}", hard=True))

    fl = first_line(hook)
    wc = count_words(fl)
    checks.append(Check("Первая строка ≤15 слов", wc <= MAX_HOOK_WORDS, f"{wc} слов" if wc > MAX_HOOK_WORDS else ""))
    nums = count_numbers(hook)
    checks.append(Check("В хуке ≥2 числа", nums >= 2, f"чисел: {nums}" if nums < 2 else ""))

    positions = link_positions(raw)
    final_ok = bool(positions) and positions[-1] == n
    checks.append(Check("Финал с переходом в TG", final_ok, "" if final_ok else "в последнем посте нет {link}", hard=True))
    checks.append(Check("Ссылок 1–3", 1 <= len(positions) <= 3, f"сейчас {len(positions)}"))
    if 1 in positions:
        checks.append(Check("Ссылка не в хуке", False, "переходы — в середине и в финале (§6.1)"))

    mids = [p for p in positions if p != n]
    if n >= 6:
        if not mids:
            checks.append(Check("Мид-ролл на 60–75%", False, "нет ссылки в середине ветки"))
        else:
            mid = mids[0]
            # (mid-1)/(n-1): у шаблона A мид-ролл на 7/9 → 0.75.
            ratio = (mid - 1) / (n - 1)
            checks.append(Check("Мид-ролл на 60–75%", 0.5 <= ratio <= 0.8, f"пост {mid}/{n}"))
            mid_text = raw[mid - 1]
            after = mid_text[mid_text.find(LINK) + len(LINK):].lower()
            nxt = raw[mid].lower() if mid < n else ""
            cont = any(m in after for m in CONTINUE_MARKERS) or any(nxt.lstrip().startswith(m) for m in CONTINUE_MARKERS)
            checks.append(Check("После мид-ролла «продолжаем»", cont, "" if cont else "добавьте «продолжаем»"))

    lowered = " ".join(raw).lower()
    bad = [c for c in FORBIDDEN_CTA if c in lowered]
    checks.append(Check("Без пустых призывов", not bad, ", ".join(bad)))

    emoji_heavy = [f"{i}/{n}" for i, p in enumerate(raw, start=1) if len(_EMOJI.findall(p)) > 2]
    checks.append(Check("Эмодзи ≤2 на пост", not emoji_heavy, ", ".join(emoji_heavy)))

    caps = caps_words(fl)
    long_words = sum(1 for w in re.findall(r"[A-Za-zА-Яа-яЁё]+", fl) if len(w) > 3) or 1
    if voice_level >= 4:
        vol_ok, note = caps / long_words >= 0.6, "первая строка должна быть капсом"
    elif voice_level == 3:
        vol_ok, note = caps <= 4, f"капсом {caps} слов, нужно 2–4"
    else:
        vol_ok, note = caps == 0, f"капсом {caps} слов, на громкости {voice_level} без капса"
    checks.append(Check(f"Громкость {voice_level}/5", vol_ok, "" if vol_ok else note))

    checks.append(Check("Приёмник в канале есть", has_receiver, "" if has_receiver else "нужен приёмник"))
    if any(POST in p for p in raw) and not post:
        checks.append(Check("Есть пост для {post}", False, "ветка ссылается на материал, а приёмник не выбран",
                            hard=True))
    if link_live is None:
        checks.append(Check("Ссылка живая", True, "не проверялась"))
    else:
        checks.append(Check("Ссылка живая", link_live, "" if link_live else "t.me не открывает ссылку"))
    return checks


def summarize(checks: list[Check]) -> dict:
    return {
        "passed": all(c.ok for c in checks if c.hard),
        "checks": [asdict(c) for c in checks],
    }


def blocking(qa: dict) -> list[str]:
    """Что мешает одобрить / опубликовать ветку."""
    return [f"{c['name']}: {c['note']}".rstrip(": ") for c in (qa or {}).get("checks", [])
            if c.get("hard") and not c.get("ok")]


def _selftest() -> None:
    hook = ("ЗА 35 МИНУТ ИИ ПОКАЗАЛ ТО, ЧТО Я НЕ ВИДЕЛ 4 ГОДА\n"
            "Попросил разобрать мои переписки — и полчаса сидел молча.\nВот промпт ↓")
    body = [
        "Вставляете в ChatGPT или Claude: «Ты психолог…»",
        "Правило сессии: один вопрос за раз.",
        "Принципы: это не слабость, а защитный механизм.",
        "ЭТАП 1–2: вопросы.",
        "ЭТАП 3–4: самый сложный этап.",
        "План на неделю после сессии собрал здесь — {link}\nи это ещё не всё, продолжаем промпт:",
        "Правила диалога.",
        "Не потому что вы слабые. Работает в связке с этим промптом: {link}",
    ]
    checks = run_checks(hook, body, link="https://t.me/+AbCdEfGhIjKlMnOp", voice_level=4,
                        has_receiver=True, link_live=True)
    by = {c.name: c for c in checks}
    assert by["Каждый пост ≤500 символов"].ok
    assert by["В хуке ≥2 числа"].ok, by["В хуке ≥2 числа"].note
    assert by["Первая строка ≤15 слов"].ok
    assert by["Мид-ролл на 60–75%"].ok, by["Мид-ролл на 60–75%"].note
    assert by["После мид-ролла «продолжаем»"].ok
    assert by["Финал с переходом в TG"].ok
    assert by["Громкость 4/5"].ok
    assert summarize(checks)["passed"]

    # Громкость 3: капс только на 2–4 словах.
    loud = "Я РЕАЛЬНО ОФИГЕЛА, КОГДА НЕЙРОСЕТЬ ПОКАЗАЛА МНЕ ЭТО ЗА 35 МИНУТ\n2 промпта ниже"
    vol3 = {c.name: c for c in run_checks(loud, body, link=None, voice_level=3, has_receiver=True)}
    assert not vol3["Громкость 3/5"].ok
    calm = "За 35 минут ИИ показал то, что я НЕ ВИДЕЛ 4 года\nПромпт ниже"
    vol3 = {c.name: c for c in run_checks(calm, body, link=None, voice_level=3, has_receiver=True)}
    assert vol3["Громкость 3/5"].ok

    bad = run_checks("Привет\nкак дела", ["x" * 520, "Подписывайтесь! [уточнить]"],
                     link=None, voice_level=3, has_receiver=False)
    s = summarize(bad)
    assert not s["passed"]
    names = {b.split(":")[0] for b in blocking(s)}
    assert {"Каждый пост ≤500 символов", "Цифры подтверждены (нет «[уточнить]»)", "4–10 постов",
            "Финал с переходом в TG"} <= names, names
    assert render_posts("h {link}", ["b {link}"], "L") == ["h L", "b L"]
    assert render_posts("h", ["подпишись {link} и забирай {post}"], "L", post="P") == ["h", "подпишись L и забирай P"]
    nopost = summarize(run_checks(hook, [*body[:-1], body[-1] + " {post}"], link="L", voice_level=4,
                                  has_receiver=False))
    assert any("{post}" in b for b in blocking(nopost))
    assert count_numbers("стилист 30–80К за 35 минут") == 3
    print("qa selftest OK")


if __name__ == "__main__":
    _selftest()
