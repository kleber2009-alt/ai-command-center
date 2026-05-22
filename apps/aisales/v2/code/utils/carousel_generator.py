"""
AI-генератор каруселей для Instagram.

Дано:
- Тема (1 строка)
- Шаблон (pain-solution / case-study / n-mistakes)
- Сегмент (A / B / C / all)
- Контекст из базы знаний (через RAG или mock)

Выход:
- Структурированные данные на 10 слайдов (JSON)
- HTML карусели в дизайн-системе AI Mastery
- Подпись для IG-поста с хэштегами

Запуск:
    cd ~/ai-sales-system/code
    source venv/bin/activate

    # Mock-режим (без Anthropic API)
    python -m utils.carousel_generator \\
        --topic "Как агентство EdTech освободило 18 часов/нед" \\
        --template case-study \\
        --segment A \\
        --mock

    # Боевой режим (нужен ANTHROPIC_API_KEY)
    export ANTHROPIC_API_KEY=sk-ant-...
    python -m utils.carousel_generator \\
        --topic "..." --template pain-solution --segment A
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Literal

ROOT = Path(__file__).resolve().parents[2]
CAROUSELS_DIR = ROOT / "carousels" / "generated"
PROMPTS_DIR = ROOT / "agent-prompts"

Template = Literal["pain-solution", "case-study", "n-mistakes"]
Segment = Literal["A", "B", "C", "all"]

MOCK_MODE = os.getenv("AISALES_MOCK", "0") == "1"

# ============ Templates definitions ============

TEMPLATE_STRUCTURES: dict[Template, list[dict]] = {
    "pain-solution": [
        {"role": "hook",         "label": "01 — HOOK"},
        {"role": "pain_name",    "label": "02 — БОЛЬ"},
        {"role": "pain_amplify", "label": "03 — ПОЧЕМУ ПЛОХО"},
        {"role": "failed_try",   "label": "04 — ЧТО НЕ РАБОТАЕТ"},
        {"role": "why_failed",   "label": "05 — ПОЧЕМУ"},
        {"role": "real_cause",   "label": "06 — НАСТОЯЩАЯ ПРИЧИНА"},
        {"role": "solution_hint","label": "07 — РЕШЕНИЕ (намёк)"},
        {"role": "solution",     "label": "08 — РЕШЕНИЕ"},
        {"role": "proof",        "label": "09 — РЕЗУЛЬТАТ"},
        {"role": "cta",          "label": "10 — CTA"},
    ],
    "case-study": [
        {"role": "hook_number",  "label": "01 — HOOK · ЦИФРА"},
        {"role": "who",          "label": "02 — КТО (анонимно)"},
        {"role": "before",       "label": "03 — БЫЛО"},
        {"role": "tried",        "label": "04 — ЧТО ПРОБОВАЛИ"},
        {"role": "what_we_did",  "label": "05 — ЧТО СДЕЛАЛИ (1 главное)"},
        {"role": "details",      "label": "06 — КАК ИМЕННО"},
        {"role": "result_nums",  "label": "07 — ЦИФРЫ"},
        {"role": "result_break", "label": "08 — РАЗБОР +X"},
        {"role": "quote",        "label": "09 — ЦИТАТА КЛИЕНТА"},
        {"role": "cta",          "label": "10 — CTA"},
    ],
    "n-mistakes": [
        {"role": "hook",         "label": "01 — HOOK"},
        {"role": "mistake_1",    "label": "02 — ОШИБКА 1"},
        {"role": "mistake_2",    "label": "03 — ОШИБКА 2"},
        {"role": "mistake_3",    "label": "04 — ОШИБКА 3"},
        {"role": "mistake_4",    "label": "05 — ОШИБКА 4"},
        {"role": "mistake_5",    "label": "06 — ОШИБКА 5"},
        {"role": "summary",      "label": "07 — SUMMARY"},
        {"role": "meta_rule",    "label": "08 — ГЛАВНОЕ ПРАВИЛО"},
        {"role": "reveal",       "label": "09 — REVEAL / P.S."},
        {"role": "cta",          "label": "10 — CTA"},
    ],
}


# ============ Mock generators ============

def _mock_carousel(template: Template, topic: str, segment: Segment) -> dict:
    """Сгенерировать заглушку карусели для тестов без API."""
    structure = TEMPLATE_STRUCTURES[template]
    if template == "pain-solution":
        slides = [
            {"role": "hook",         "h": "3 часа\nв день.", "accent": "впустую.", "body": f"Столько съедает [TOPIC] у среднего {segment}-клиента.", "kind": "hook"},
            {"role": "pain_name",    "h": "Ручной процесс убивает", "body": "Каждый день одно и то же.", "kind": "step"},
            {"role": "pain_amplify", "h": "И самое обидное:", "num": "73%", "body": "повторяющихся действий, которые ты делаешь руками", "kind": "stat"},
            {"role": "failed_try",   "h": "Ты пробовал:", "body": "✕ нанять SMM-щика\n✕ Buffer / Later\n✕ написать своих джунов\n✕ ChatGPT для текстов", "kind": "step"},
            {"role": "why_failed",   "h": "Каждое решает", "accent": "часть.", "body": "SMM-щик пишет, но не знает стратегию. Buffer публикует, но не пишет.", "kind": "step"},
            {"role": "real_cause",   "h": "Проблема не в инструментах.", "body": "Проблема в системе, которая их связывает. А её обычно нет.", "kind": "reveal"},
            {"role": "solution_hint","h": "Нужен один слой,", "accent": "который:", "body": "→ знает каждого клиента\n→ пишет в его стиле\n→ постит вовремя", "kind": "step"},
            {"role": "solution",     "h": "Автопилот", "accent": "SMM.", "body": "Не «помощник». Полноценная замена SMM-отдела на 10 клиентов.", "kind": "reveal"},
            {"role": "proof",        "h": "За 3 недели — 18 часов в неделю.", "body": "— клиент агентства, май 2026", "kind": "quote"},
            {"role": "cta",          "h": "Хочешь так же?", "body": "Напиши «SMM» в директ.", "kind": "cta"},
        ]
    elif template == "case-study":
        slides = [
            {"role": "hook_number",  "num": "+1.2x", "h": "оборот за", "accent": "3 месяца.", "body": "Без новой команды, без рекламы.", "kind": "stat"},
            {"role": "who",          "h": "Кто это:", "body": "Маркетинговое агентство\n8 человек · 12 клиентов\n1.2 млн ₽/мес · 2.5 года", "kind": "step"},
            {"role": "before",       "h": "Было: стабильно и стагно.", "body": "✕ Лиды плохие\n✕ Воронка теряется\n✕ Менеджер в отпуске = простой", "kind": "step"},
            {"role": "tried",        "h": "Пробовали:", "body": "✕ Junior — терял контекст\n✕ Notion — забывали\n✕ Bitrix — забили", "kind": "step"},
            {"role": "what_we_did",  "h": "Поставили", "accent": "AI-агента.", "body": "Говорит голосом основателя, читает БЗ, работает 24/7 в IG и TG.", "kind": "reveal"},
            {"role": "details",      "h": "Внедрение · 5 дней", "body": "1-2: собрали БЗ\n3: записали голос\n4: подключили webhooks\n5: канареечный запуск", "kind": "step"},
            {"role": "result_nums",  "h": "Результат:", "body": "Оборот +1.2x\nКонверсия 7.8→14.2%\nОтвет 3.5ч→1.2с\n18 часов/нед", "kind": "result"},
            {"role": "result_break", "h": "Откуда", "accent": "+1.2x?", "body": "Скорость ответа в 10000× ↗ удержание + воронка 24/7 + менеджер свободен", "kind": "step"},
            {"role": "quote",        "h": "«За 3 месяца — ни одного «вы AI?» комментария»", "body": "— Алексей, founder · май 2026", "kind": "quote"},
            {"role": "cta",          "h": "Хочешь так же?", "body": "Напиши «КЕЙС» в директ.", "kind": "cta"},
        ]
    else:  # n-mistakes
        slides = [
            {"role": "hook",         "num": "5", "h": "ошибок,", "accent": "которые убивают продажи в IG.", "body": "Делал каждую. Теперь делюсь.", "kind": "stat"},
            {"role": "mistake_1",    "num": "01", "h": "Отвечать", "accent": "быстро.", "body": "Любой ценой. Это выглядит как бот. → задержка 30-90 сек.", "kind": "mistake"},
            {"role": "mistake_2",    "num": "02", "h": "Сразу", "accent": "продавать.", "body": "Клиент только зашёл. → сначала вопрос.", "kind": "mistake"},
            {"role": "mistake_3",    "num": "03", "h": "Каталог", "accent": "в лоб.", "body": "Все продукты сразу. → один за раз.", "kind": "mistake"},
            {"role": "mistake_4",    "num": "04", "h": "Скидка", "accent": "после «дорого».", "body": "Цена обесценена. → скидка только под условие.", "kind": "mistake"},
            {"role": "mistake_5",    "num": "05", "h": "Followup как", "accent": "спам.", "body": "«Не забыл про нас?» → followup = ценность.", "kind": "mistake"},
            {"role": "summary",      "h": "Если коротко:", "body": "01. Не быстрее живого\n02. Не продавай до понимания\n03. Не каталог\n04. Не скидка\n05. Followup = ценность", "kind": "step"},
            {"role": "meta_rule",    "h": "Веди как", "accent": "человек.", "body": "Думай как система.", "kind": "reveal"},
            {"role": "reveal",       "h": "P.S.", "body": "Я не сам это всё отслеживаю. У меня 4 AI-агента в IG и TG.", "kind": "step"},
            {"role": "cta",          "h": "Сохрани. Покажи команде.", "body": "Напиши «5 ошибок» в директ — пришлю PDF.", "kind": "cta"},
        ]

    # Hashtags + caption mock
    caption = (
        f"{slides[0]['h']} — {topic}.\n\n"
        f"Лично проверено. Без воды, без воды на воде.\n\n"
        f"Листай слайды — там разобрал детальнее.\n\n"
        f"Напиши в директ если хочешь обсудить под твою ситуацию."
    )
    hashtags = ["#маркетинг", "#бизнес", "#автоматизация", "#SMM", "#нейросети", "#AIагент", "#продажи", "#smmагентство"]

    return {
        "metadata": {
            "topic": topic,
            "template": template,
            "segment": segment,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "model": "MOCK",
            "tokens_used": 0,
            "cost_usd": 0.0,
        },
        "slides": slides,
        "caption": caption,
        "hashtags": hashtags,
        "voice_consistency_score": 0.0,
    }


# ============ Real Anthropic call ============

PROMPT_TEMPLATE = """\
Ты — генератор контента для AI Sales System. Твоя задача — создать сценарий
карусели для Instagram на 10 слайдов в стиле дизайн-системы AI Mastery.

# ТЕМА
{topic}

# ШАБЛОН: {template}
Структура:
{structure}

# ЦЕЛЕВОЙ СЕГМЕНТ: {segment}
{segment_desc}

# ГОЛОС И СТИЛЬ (из базы знаний)
{voice_context}

# ПРИНЦИПЫ
- 1-2 короткие фразы на слайд, плотно, без воды
- Hook (слайд 01) — 3-5 секунд внимания, в формате "ЗАГВОЗДКА"
- CTA (слайд 10) — конкретное действие («напиши X в директ»)
- Никаких "Дорогие подписчики", "Привет всем", "Сегодня поговорим"
- Цифры — конкретные, не "много" а "73%"
- Эмодзи — максимум 1 на слайд

# ВЫХОД
Верни строго JSON со структурой:
{{
  "slides": [
    {{"role": "hook", "h": "заголовок (главный)", "accent": "акцент-фраза (опц)", "body": "доп.текст 1-3 строки", "num": "цифра если есть", "kind": "hook|step|stat|reveal|quote|cta|mistake|result"}},
    ... (всего 10 слайдов в порядке шаблона)
  ],
  "caption": "подпись под пост в IG (4 блока: hook → problem → solution → cta), 200-280 слов",
  "hashtags": ["#тег1", "#тег2", ... 8-12 штук]
}}

Только JSON. Никакого текста до или после.
"""

SEGMENT_DESCS = {
    "A": "Горячий: ICP 70+, готов покупать. Прямой язык, конкретика, минимум воспитательного тона.",
    "B": "Тёплый: ICP 40-70, в раздумьях. Больше образования, чуть мягче, кейсы важны.",
    "C": "Холодный: ICP < 40. Сильный hook нужен, фокус на боли, не на продукте.",
    "all": "Универсальный: средний баланс между образованием и продажей.",
}


def _real_carousel(template: Template, topic: str, segment: Segment, voice_context: str) -> dict:
    """Реальный вызов Anthropic API. Падает с понятной ошибкой если ключа нет."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY не установлен. "
            "Запусти с --mock для теста или подставь ключ:\n"
            "  export ANTHROPIC_API_KEY=sk-ant-..."
        )

    try:
        from anthropic import Anthropic  # type: ignore
    except ImportError:
        raise RuntimeError("Установи пакет: pip install anthropic")

    client = Anthropic(api_key=api_key)

    structure_str = "\n".join(f"  слайд {i+1}: {s['role']} — {s['label']}"
                              for i, s in enumerate(TEMPLATE_STRUCTURES[template]))

    prompt = PROMPT_TEMPLATE.format(
        topic=topic,
        template=template,
        structure=structure_str,
        segment=segment,
        segment_desc=SEGMENT_DESCS[segment],
        voice_context=voice_context or "(голос ещё не настроен, используй нейтральный прямой тон)",
    )

    response = client.messages.create(
        model="claude-opus-4-7-20260101",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text  # type: ignore

    # Извлекаем JSON (на случай если модель добавила текст вокруг)
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        raise RuntimeError(f"Не удалось извлечь JSON из ответа. Сырой ответ:\n{raw[:500]}")
    data = json.loads(raw[start:end + 1])

    data["metadata"] = {
        "topic": topic,
        "template": template,
        "segment": segment,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "model": response.model,
        "tokens_used": response.usage.input_tokens + response.usage.output_tokens,  # type: ignore
        "cost_usd": _estimate_cost(response),
    }
    data["voice_consistency_score"] = 0.0  # будет посчитан отдельно
    return data


def _estimate_cost(response) -> float:
    """Грубая оценка стоимости Opus 4.7."""
    # $15 / 1M input, $75 / 1M output (Opus pricing, проверяй актуально)
    inp = response.usage.input_tokens / 1_000_000 * 15.0
    out = response.usage.output_tokens / 1_000_000 * 75.0
    return round(inp + out, 6)


# ============ Voice context loader ============

def load_voice_context() -> str:
    """Загрузить голос из agent-prompts/01-ig-manager.md как proxy для voice context.

    В production это будут топ-чанки из RAG.
    """
    p = PROMPTS_DIR / "01-ig-manager.md"
    if not p.exists():
        return ""
    text = p.read_text(encoding="utf-8")
    # Извлекаем секции VOICE + RED LINES + STYLE EXAMPLES
    sections = []
    for marker in ["## VOICE", "## RED LINES", "## STYLE EXAMPLES"]:
        idx = text.find(marker)
        if idx == -1:
            continue
        nxt = text.find("\n## ", idx + 4)
        sections.append(text[idx:nxt if nxt != -1 else len(text)])
    return "\n\n".join(sections)[:3000]  # отсекаем по бюджету токенов


# ============ HTML renderer ============

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Карусель · {topic}</title>
<style>
  *,*::before,*::after {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ background:#080808; padding:24px 0; display:flex; flex-direction:column; align-items:center; gap:24px; font-family:Georgia, serif; }}
  .slide {{ width:1080px; height:1350px; background:#080808; color:#f5f0e8; padding:80px 70px; position:relative; display:flex; flex-direction:column; border:1px solid #1a1a1a; overflow:hidden; }}
  .slide-num {{ position:absolute; top:40px; right:60px; font-family:'SF Mono',monospace; font-size:14px; color:#3a3a3a; letter-spacing:0.18em; font-weight:700; }}
  .slide-num .of {{ color:#5a5550; }}
  .brand {{ position:absolute; bottom:40px; left:60px; font-family:'SF Mono',monospace; font-size:13px; color:#5a5550; letter-spacing:0.18em; font-weight:700; text-transform:uppercase; }}
  .brand .a {{ color:#c8f060; }}
  .swipe {{ position:absolute; bottom:40px; right:60px; font-family:'SF Mono',monospace; font-size:13px; color:#c8f060; letter-spacing:0.18em; font-weight:700; text-transform:uppercase; }}
  .center {{ flex:1; display:flex; flex-direction:column; justify-content:center; }}
  .h {{ font-family:Georgia, serif; font-size:88px; line-height:1.05; letter-spacing:-0.02em; }}
  .h .a {{ color:#c8f060; font-style:italic; }}
  .body-text {{ font-family:Georgia, serif; font-size:30px; line-height:1.5; color:#d8d2c6; margin-top:30px; white-space:pre-line; }}
  .num-mega {{ font-family:Georgia, serif; font-size:240px; line-height:1; letter-spacing:-0.04em; color:#c8f060; font-style:italic; margin:30px 0; }}
  .step-num {{ font-family:'SF Mono',monospace; font-size:18px; color:#c8f060; letter-spacing:0.2em; font-weight:700; margin-bottom:18px; text-transform:uppercase; }}
  .quote {{ font-family:Georgia, serif; font-size:48px; line-height:1.25; font-style:italic; color:#d8d2c6; border-left:6px solid #c8f060; padding-left:36px; }}
  .cta-circle {{ width:280px; height:280px; border:3px solid #c8f060; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-direction:column; margin:30px auto 0; }}
  .cta-circle .arr {{ font-size:80px; color:#c8f060; line-height:1; }}
  .cta-circle .txt {{ font-family:'SF Mono',monospace; font-size:14px; color:#c8f060; letter-spacing:0.2em; margin-top:14px; font-weight:700; }}
</style>
</head>
<body>
{slides_html}
<div style="max-width:1080px; padding:40px 70px; color:#b8b3a8; font-family:Georgia,serif; font-size:18px; line-height:1.6;">
  <div style="font-family:'SF Mono',monospace; font-size:11px; color:#c8f060; letter-spacing:0.18em; text-transform:uppercase; margin-bottom:14px;">PRO POST · ПОДПИСЬ</div>
  <pre style="white-space:pre-wrap; font-family:Georgia,serif; font-size:17px; line-height:1.7; color:#f5f0e8;">{caption}</pre>
  <div style="margin-top:24px; color:#60c8f0; font-family:'SF Mono',monospace; font-size:14px;">{hashtags}</div>
  <div style="margin-top:30px; padding-top:18px; border-top:1px solid #2a2a2a; font-family:'SF Mono',monospace; font-size:10px; color:#5a5550; letter-spacing:0.12em;">
    META · {model} · ${cost} · {tokens} tokens · {template} · segment {segment}
  </div>
</div>
</body>
</html>"""


def render_slide(idx: int, total: int, slide: dict) -> str:
    n = f"{idx + 1:02d}"
    kind = slide.get("kind", "step")
    h = slide.get("h", "")
    accent = slide.get("accent", "")
    body = slide.get("body", "")
    num = slide.get("num", "")

    accent_html = f'<span class="a">{accent}</span>' if accent else ""
    h_html = f"{h}<br/>{accent_html}" if h and accent else (h + accent_html)

    if kind == "stat" and num:
        center = f'<div class="step-num">/ {n}</div><div class="h">{h_html}</div><div class="num-mega">{num}</div><div class="body-text">{body}</div>'
    elif kind == "quote":
        center = f'<div class="step-num">/ {n}</div><div class="quote">{h}<br/><br/>{body}</div>'
    elif kind == "cta":
        center = f'<div class="h" style="text-align:center;">{h_html}</div><div class="cta-circle"><div class="arr">↗</div><div class="txt">в директ</div></div><div class="body-text" style="text-align:center;">{body}</div>'
    elif kind == "reveal":
        center = f'<div class="step-num">/ {n}</div><div class="h">{h_html}</div><div class="body-text">{body}</div>'
    elif kind == "mistake" and num:
        center = f'<div style="font-family:\'SF Mono\',monospace; font-size:280px; line-height:0.9; color:#3a3a3a; font-weight:700;"><span style="color:#c8f060;">{num[0]}</span>{num[1:]}</div><div class="h" style="font-size:68px;">{h_html}</div><div class="body-text">{body}</div>'
    else:
        center = f'<div class="step-num">/ {n}</div><div class="h" style="font-size:68px;">{h_html}</div><div class="body-text">{body}</div>'

    return f"""<div class="slide">
  <div class="slide-num">{n} <span class="of">/ {total:02d}</span></div>
  <div class="center">{center}</div>
  <div class="brand"><span class="a">●</span> AI SALES · @username</div>
  {'<div class="swipe">SWIPE →</div>' if idx < total - 1 else ''}
</div>"""


def render_html(data: dict) -> str:
    slides = data["slides"]
    slides_html = "\n".join(render_slide(i, len(slides), s) for i, s in enumerate(slides))
    meta = data["metadata"]
    return HTML_TEMPLATE.format(
        topic=meta["topic"],
        slides_html=slides_html,
        caption=data["caption"],
        hashtags=" ".join(data["hashtags"]),
        model=meta["model"],
        cost=meta["cost_usd"],
        tokens=meta["tokens_used"],
        template=meta["template"],
        segment=meta["segment"],
    )


# ============ CLI ============

def main():
    parser = argparse.ArgumentParser(description="AI carousel generator for Instagram")
    parser.add_argument("--topic", required=True, help="Одна строка темы карусели")
    parser.add_argument("--template", default="case-study",
                        choices=["pain-solution", "case-study", "n-mistakes"])
    parser.add_argument("--segment", default="A", choices=["A", "B", "C", "all"])
    parser.add_argument("--mock", action="store_true", help="Не звать Anthropic API, отдать заглушку")
    parser.add_argument("--out", help="Выходной HTML-путь (по умолчанию carousels/generated/...)")
    args = parser.parse_args()

    # Mock-режим
    if args.mock or os.getenv("AISALES_MOCK") == "1":
        print(f"→ MOCK MODE · template={args.template} · segment={args.segment}")
        data = _mock_carousel(args.template, args.topic, args.segment)
    else:
        print(f"→ REAL MODE · template={args.template} · segment={args.segment}")
        print(f"  Загружаю voice context из {PROMPTS_DIR}...")
        voice_ctx = load_voice_context()
        if not voice_ctx:
            print("  ⚠ Voice context пуст — карусель будет в generic-стиле")
        print(f"  Вызываю Anthropic API...")
        data = _real_carousel(args.template, args.topic, args.segment, voice_ctx)

    # Имя файла
    safe_topic = "".join(c if c.isalnum() else "-" for c in args.topic.lower())[:40]
    ts = datetime.now().strftime("%Y%m%d-%H%M")
    out_html = Path(args.out) if args.out else CAROUSELS_DIR / f"{ts}-{args.template}-{safe_topic}.html"
    out_json = out_html.with_suffix(".json")

    out_html.parent.mkdir(parents=True, exist_ok=True)
    html = render_html(data)
    out_html.write_text(html, encoding="utf-8")
    out_json.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print()
    print(f"✓ Carousel ready: {len(data['slides'])} слайдов")
    print(f"  HTML: {out_html}")
    print(f"  JSON: {out_json}")
    if not (args.mock or os.getenv("AISALES_MOCK") == "1"):
        print(f"  Tokens: {data['metadata']['tokens_used']} · Cost: ${data['metadata']['cost_usd']}")
    print()
    print(f"  Открой в браузере:")
    print(f"  open {out_html}")


if __name__ == "__main__":
    main()
