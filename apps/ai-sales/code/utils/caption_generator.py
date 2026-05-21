"""
Генератор подписей под пост / карусель / Reel с хэштегами.

Использование:
    python -m utils.caption_generator \\
        --topic "автоматизация SMM для агентств" \\
        --content-type carousel \\
        --segment A --mock
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
OUT_DIR = ROOT / "content-bank" / "generated-captions"

ContentType = Literal["carousel", "reel", "post", "story"]
Segment = Literal["A", "B", "C", "all"]

MODEL = "claude-sonnet-4-6"
PRICE_INPUT = 3.0
PRICE_OUTPUT = 15.0


PROMPT_TEMPLATE = """\
Ты — копирайтер для AI Sales. Напиши подпись под IG-{content_type} на тему: {topic}

# Целевой сегмент: {segment}
{segment_desc}

# Голос автора
{voice_context}

# Шаблон подписи для {content_type}
{template_def}

# Правила:
- Никаких канцеляризмов («дорогие подписчики», «по вашему запросу»)
- Никаких ложных дефицитов («только сегодня»)
- 1 эмодзи максимум, и только если уместно
- Подпись = 4 блока: hook → problem → solution → CTA
- Длина для {content_type}: {target_length}

# Выход (строго JSON):
{{
  "caption": "полный текст подписи",
  "cta_variants": ["3 варианта CTA"],
  "hashtags_primary": ["8-12 нишевых хэштегов"],
  "hashtags_trend": ["3-5 хайповых для discovery"]
}}

Только JSON.
"""

TEMPLATES = {
    "carousel": "4 блока · hook → problem → solution → CTA · 200-280 слов",
    "reel": "3 блока · повтор хука → tease → CTA · 80-150 слов",
    "post": "5 блоков · provocative заголовок → тезис → 3 аргумента → вывод → вопрос · 250-350 слов",
    "story": "2-3 строки максимум · CTA-кнопка",
}

TARGET_LENGTHS = {
    "carousel": "200-280 слов",
    "reel": "80-150 слов",
    "post": "250-350 слов",
    "story": "10-30 слов",
}

SEGMENT_DESCS = {
    "A": "ICP 70+, готов покупать. Прямой язык, цифры.",
    "B": "ICP 40-70, в раздумьях. Чуть мягче, кейсы важны.",
    "C": "ICP < 40. Сильный hook нужен, фокус на боли.",
    "all": "Универсальный баланс.",
}


def _mock(topic: str, content_type: ContentType, segment: Segment) -> dict:
    return {
        "caption": (
            f"{topic} — вот что бесит большинство.\n\n"
            f"Личный опыт: 3 часа в день уходило на ручной постинг. "
            f"73% этой работы — повторение того, что я уже знаю как делать.\n\n"
            f"Что сработало: одна система которая знает всех клиентов, "
            f"пишет в их стиле, постит вовремя. Не «помощник» — замена отдела.\n\n"
            f"Сохрани если про тебя. Хочешь обсудить под свою ситуацию — напиши «SMM» в директ."
        ),
        "cta_variants": [
            "Напиши «SMM» в директ — пришлю кейс",
            "Сохрани пост · покажи команде",
            "Дай знать в комментариях если узнал себя"
        ],
        "hashtags_primary": [
            "#маркетинг", "#smm", "#smmагентство", "#автоматизация",
            "#AIагент", "#нейросети", "#контентмаркетинг", "#бизнес"
        ],
        "hashtags_trend": ["#ИИвбизнесе", "#MultiAgent", "#нейросети2026"],
        "_meta": {
            "topic": topic, "content_type": content_type, "segment": segment,
            "model": "MOCK", "cost_usd": 0.0, "tokens": 0,
        }
    }


def _real(topic: str, content_type: ContentType, segment: Segment, voice_ctx: str) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY не установлен. --mock для теста.")
    from anthropic import Anthropic  # type: ignore

    client = Anthropic(api_key=api_key)
    prompt = PROMPT_TEMPLATE.format(
        topic=topic, content_type=content_type, segment=segment,
        segment_desc=SEGMENT_DESCS[segment], voice_context=voice_ctx or "(нейтральный)",
        template_def=TEMPLATES[content_type], target_length=TARGET_LENGTHS[content_type],
    )

    response = client.messages.create(
        model=MODEL, max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text  # type: ignore
    start, end = raw.find("{"), raw.rfind("}")
    data = json.loads(raw[start:end + 1])

    inp = response.usage.input_tokens / 1_000_000 * PRICE_INPUT
    out = response.usage.output_tokens / 1_000_000 * PRICE_OUTPUT
    data["_meta"] = {
        "topic": topic, "content_type": content_type, "segment": segment,
        "model": response.model,
        "tokens": response.usage.input_tokens + response.usage.output_tokens,
        "cost_usd": round(inp + out, 6),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
    return data


def load_voice() -> str:
    p = ROOT / "voice-input" / "analysis" / "voice-profile.json"
    if p.exists():
        d = json.loads(p.read_text(encoding="utf-8"))
        prof = d.get("profile", {})
        bits = [
            f"Tone: {prof.get('tone_of_voice', {}).get('addressing', '?')}, {prof.get('tone_of_voice', {}).get('formality', '?')}",
            "Favorite: " + ", ".join(prof.get("favorite_phrases", [])[:6]),
            "Banned: " + ", ".join(prof.get("banned_phrases", [])[:6]),
        ]
        return "\n".join(bits)
    return ""


def main():
    parser = argparse.ArgumentParser(description="Caption generator")
    parser.add_argument("--topic", required=True)
    parser.add_argument("--content-type", default="carousel", choices=["carousel", "reel", "post", "story"])
    parser.add_argument("--segment", default="A", choices=["A", "B", "C", "all"])
    parser.add_argument("--mock", action="store_true")
    args = parser.parse_args()

    if args.mock or os.getenv("AISALES_MOCK") == "1":
        print(f"→ MOCK · {args.content_type} · seg {args.segment}")
        data = _mock(args.topic, args.content_type, args.segment)
    else:
        voice_ctx = load_voice()
        data = _real(args.topic, args.content_type, args.segment, voice_ctx)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M")
    safe = "".join(c if c.isalnum() else "-" for c in args.topic.lower())[:40]
    out = OUT_DIR / f"{ts}-{args.content_type}-{safe}.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print()
    print("=" * 60)
    print("CAPTION READY")
    print("=" * 60)
    print()
    print(data["caption"])
    print()
    print("HASHTAGS (primary):", " ".join(data["hashtags_primary"]))
    print("HASHTAGS (trend):  ", " ".join(data.get("hashtags_trend", [])))
    print()
    print("CTA variants:")
    for c in data["cta_variants"]:
        print(f"  → {c}")
    print()
    print(f"Saved: {out}")
    if "cost_usd" in data["_meta"] and data["_meta"]["model"] != "MOCK":
        print(f"Cost: ${data['_meta']['cost_usd']} · {data['_meta']['tokens']} tokens")


if __name__ == "__main__":
    main()
