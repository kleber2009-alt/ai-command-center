"""
Voice Analyzer · извлекает структуру голоса из транскриптов подкастов.

Это keystone-инструмент контент-машины: без него агенты звучат generic.

Pipeline:
    voice-input/audio/*.mp3
        ↓ voice_transcribe.py
    voice-input/transcripts/*.txt + .json
        ↓ voice_analyzer.py  ← это здесь
    voice-input/analysis/voice-profile.json
        ↓
    agent-prompts/01-ig-manager.md (auto-filled [PLACEHOLDERS])
    Notion · 🎭 Голос и тон (через MCP)

Что извлекает:
    1. Identity — кто, чем занимается, кому продаёт
    2. Tone of voice — как говорит (на ты/вы, темп, эмодзи, длина)
    3. Values — что важно (4-6 пунктов)
    4. Red lines — чего не делает (4-6 пунктов)
    5. Favorite phrases — 10-15 любимых оборотов
    6. Banned phrases — 10-15 запретных слов
    7. Style examples — 5+ показательных цитат из подкастов
    8. Themes — 5-10 тем которые часто поднимает

Использование:
    cd ~/ai-sales-system/code
    source venv/bin/activate

    # Mock (для теста структуры без API)
    python -m utils.voice_analyzer --mock

    # Боевой (нужен ANTHROPIC_API_KEY)
    export ANTHROPIC_API_KEY=sk-ant-...
    python -m utils.voice_analyzer

    # Только конкретный транскрипт
    python -m utils.voice_analyzer --file podcast-01.txt
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TRANSCRIPTS_DIR = ROOT / "voice-input" / "transcripts"
ANALYSIS_DIR = ROOT / "voice-input" / "analysis"

# Модель: Sonnet 4.6 хватает для извлечения структуры (дешевле Opus, быстрее)
MODEL = "claude-sonnet-4-6-20260101"

# Цены (USD за 1М токенов)
PRICE_INPUT = 3.0
PRICE_OUTPUT = 15.0


SYSTEM_PROMPT = """\
Ты — лингвист-аналитик голоса бренда. Твоя задача — извлечь из транскриптов \
подкастов человека структурированный профиль его голоса для AI-агентов продаж.

Это критично: AI-агенты будут говорить с клиентами от его имени, и ошибка в \
голосе = клиенты заметят что говорит не он.

Извлекай ТОЧНО то что есть в транскрипте, НЕ ВЫДУМЫВАЙ. Если чего-то нет — \
оставь поле пустым массивом или null.
"""

USER_PROMPT_TEMPLATE = """\
# ТРАНСКРИПТ(Ы)

{transcripts}

---

# ЗАДАЧА

Извлеки структурированный профиль голоса. Верни СТРОГО валидный JSON:

```json
{{
  "identity": {{
    "name": "имя если упомянуто, иначе null",
    "what_i_do": "одна строка чем занимается",
    "target_audience": "кому продаёт / для кого работает",
    "differentiation": "что отличает от конкурентов (1-2 фразы)",
    "business_age_or_scale": "возраст бизнеса или масштаб если упомянут"
  }},
  "tone_of_voice": {{
    "addressing": "ты | вы | смешанно",
    "formality": "casual | neutral | formal",
    "energy": "high | medium | low",
    "humor": "много | умеренно | редко | нет",
    "emoji_usage": "много | 1-2 на сообщение | редко | нет",
    "typical_length": "короткие фразы | средние | длинные размышления",
    "first_person_share": 0
  }},
  "values": [
    "ценность 1 — 1 фраза + краткое раскрытие",
    "ценность 2",
    "..."
  ],
  "red_lines": [
    "чего никогда не делает 1",
    "..."
  ],
  "favorite_phrases": [
    "фраза 1 — точная цитата как говорит",
    "фраза 2",
    "..."
  ],
  "banned_phrases": [
    "слова/обороты которые НЕ употребляет (если можно вывести из контекста)"
  ],
  "style_examples": [
    {{
      "context": "о чём говорил",
      "quote": "точная цитата из транскрипта 1-3 предложения",
      "demonstrates": "что показывает (тон, ценности, стиль)"
    }}
  ],
  "themes": [
    {{"theme": "тема которая часто поднимается", "weight": 0.0}}
  ],
  "vocabulary_notes": "наблюдения о словаре — профжаргон, англицизмы, etc"
}}
```

# ПРАВИЛА

1. Только то что есть в транскрипте. Никаких выдумок.
2. Цитаты — точные. Не перефразируй.
3. favorite_phrases — это его реальные обороты, не общие.
4. Если поле трудно вывести из контекста — null или пустой массив.
5. tone_of_voice.first_person_share — % предложений где говорит «я» (0.0-1.0).
6. values · red_lines — выводи из контекста, не цитируй буквально, а описывай суть.
7. style_examples — 5-10 штук, разные ситуации.
8. themes — top 5-10 по частоте.

Только JSON. Никакого текста до или после.
"""


def collect_transcripts(specific_file: str | None = None) -> str:
    """Собрать содержимое транскриптов в один текст для модели."""
    if specific_file:
        path = TRANSCRIPTS_DIR / specific_file
        if not path.exists():
            print(f"✕ Файл не найден: {path}", file=sys.stderr)
            sys.exit(1)
        files = [path]
    else:
        files = sorted(TRANSCRIPTS_DIR.glob("*.txt"))

    if not files:
        print(
            f"⚠ Транскриптов нет в {TRANSCRIPTS_DIR}\n"
            f"  Сначала запусти: python -m utils.voice_transcribe",
            file=sys.stderr,
        )
        sys.exit(0)

    chunks = []
    total_chars = 0
    for f in files:
        text = f.read_text(encoding="utf-8")
        chunks.append(f"## ИСТОЧНИК: {f.name}\n\n{text}\n")
        total_chars += len(text)
        # Лимит — ~150K символов (~40K токенов) чтобы влезть в контекст с запасом
        if total_chars > 150_000:
            print(f"⚠ Транскрипты обрезаны до {total_chars} символов (~40K токенов)", file=sys.stderr)
            break

    print(f"→ Собрано {len(chunks)} транскриптов · {total_chars} символов")
    return "\n\n---\n\n".join(chunks)


def _mock_profile() -> dict:
    """Заглушка с реалистичной структурой для тестов без API."""
    return {
        "identity": {
            "name": "Илья",
            "what_i_do": "помогаю маркетинговым агентствам автоматизировать продажи через AI-агентов",
            "target_audience": "владельцы SMM-агентств 5-15 человек, оборот 0.5-3М/мес",
            "differentiation": "система а не отдельный инструмент — заменяет SMM-отдел, не помогает ему",
            "business_age_or_scale": "2 года, 50+ внедрений"
        },
        "tone_of_voice": {
            "addressing": "ты",
            "formality": "casual",
            "energy": "medium",
            "humor": "умеренно",
            "emoji_usage": "редко",
            "typical_length": "средние",
            "first_person_share": 0.65
        },
        "values": [
            "честность важнее продажи — если продукт не подходит клиенту, говорю прямо",
            "уважение ко времени клиента — не растягиваю созвоны, не задаю одно и то же",
            "результат vs процесс — мерим в деньгах и часах, не в количестве сообщений",
            "не учу, а делюсь — позиция коллеги, а не «гуру»"
        ],
        "red_lines": [
            "не давить на клиента ложным дефицитом",
            "не давать скидку без условия",
            "не обещать гарантированный результат",
            "не сравнивать с конкурентами по имени",
            "не обсуждать одного клиента с другим"
        ],
        "favorite_phrases": [
            "без воды",
            "окей, давай прямо",
            "это нормально",
            "по делу",
            "не парься",
            "дверь открыта",
            "слушай, я скажу честно",
            "это решается"
        ],
        "banned_phrases": [
            "уважаемый клиент", "по вашему запросу", "спешу сообщить",
            "имею честь", "канцеляризмы в целом"
        ],
        "style_examples": [
            {
                "context": "о ценообразовании",
                "quote": "Слушай, цифра не маленькая. И нормально что ты так реагируешь. Давай разложу — за что вообще эти 80к.",
                "demonstrates": "тёплый тон, без обиды на возражение, переход к фактам"
            },
            {
                "context": "о неподходящем клиенте",
                "quote": "Если честно, под твою ситуацию это не сработает. Не потому что плохо, а потому что не та задача.",
                "demonstrates": "честность важнее продажи, не унижает клиента"
            }
        ],
        "themes": [
            {"theme": "автоматизация продаж в директе", "weight": 0.35},
            {"theme": "разница AI и шаблонов", "weight": 0.20},
            {"theme": "управление командой агентства", "weight": 0.15},
            {"theme": "тестирование контента", "weight": 0.10}
        ],
        "vocabulary_notes": "MOCK · реальные данные подгрузятся когда добавишь ANTHROPIC_API_KEY и транскрипты"
    }


def _real_analysis(transcripts: str) -> tuple[dict, dict]:
    """Реальный анализ через Anthropic. Возвращает (profile, meta)."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY не установлен. Запусти с --mock для теста."
        )

    try:
        from anthropic import Anthropic  # type: ignore
    except ImportError:
        raise RuntimeError("Установи: pip install anthropic")

    client = Anthropic(api_key=api_key)

    prompt = USER_PROMPT_TEMPLATE.format(transcripts=transcripts)

    print(f"→ Вызываю {MODEL}...")
    t0 = time.time()
    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    elapsed = time.time() - t0
    print(f"  Получен ответ за {elapsed:.1f}s")

    raw = response.content[0].text  # type: ignore
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        raise RuntimeError(f"Не удалось извлечь JSON. Raw:\n{raw[:500]}")

    profile = json.loads(raw[start:end + 1])

    inp = response.usage.input_tokens / 1_000_000 * PRICE_INPUT
    out = response.usage.output_tokens / 1_000_000 * PRICE_OUTPUT

    meta = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "model": response.model,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "cost_usd": round(inp + out, 6),
        "elapsed_seconds": round(elapsed, 2),
    }
    return profile, meta


# ============ HTML отчёт ============

def render_report(profile: dict, meta: dict) -> str:
    """Сгенерировать читабельный HTML-отчёт по голосу."""
    p = profile
    identity = p.get("identity", {})
    tone = p.get("tone_of_voice", {})

    def lst(items):
        if not items:
            return '<div class="empty">— пусто —</div>'
        return "".join(f"<li>{e}</li>" for e in items)

    fav = lst(p.get("favorite_phrases", []))
    ban = lst(p.get("banned_phrases", []))
    values = lst(p.get("values", []))
    red = lst(p.get("red_lines", []))

    examples = "".join(
        f'<div class="ex"><div class="ex-ctx">{e.get("context","—")}</div>'
        f'<div class="ex-q">«{e.get("quote","")}»</div>'
        f'<div class="ex-d">→ {e.get("demonstrates","")}</div></div>'
        for e in p.get("style_examples", [])
    )

    themes = "".join(
        f'<div class="theme"><span class="th-name">{t.get("theme","—")}</span>'
        f'<span class="th-bar"><span class="th-fill" style="width:{int(float(t.get("weight",0))*100)}%;"></span></span>'
        f'<span class="th-w">{int(float(t.get("weight",0))*100)}%</span></div>'
        for t in p.get("themes", [])
    )

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Voice Profile · {identity.get("name", "—")}</title>
<style>
  *,*::before,*::after {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ background:#080808; color:#f5f0e8; font-family:Georgia,serif; padding:40px 24px 80px; min-height:100vh; }}
  .shell {{ max-width:920px; margin:0 auto; display:grid; gap:2px; }}
  h1 {{ font-family:Georgia,serif; font-size:44px; font-weight:normal; line-height:1.1; letter-spacing:-0.02em; margin-bottom:8px; }}
  h1 .a {{ color:#c8f060; font-style:italic; }}
  .sub {{ font-family:'SF Mono',monospace; font-size:11px; color:#5a5550; letter-spacing:0.16em; text-transform:uppercase; margin-bottom:28px; }}
  .sec {{ background:#0f0f0f; border:1px solid #1a1a1a; padding:22px 26px; }}
  .sec h2 {{ font-family:Georgia,serif; font-size:22px; font-weight:normal; margin-bottom:14px; }}
  .sec h2 .a {{ color:#c8f060; font-style:italic; }}
  .row {{ display:grid; grid-template-columns:180px 1fr; gap:14px; padding:10px 0; border-bottom:1px solid #1a1a1a; align-items:baseline; }}
  .row:last-child {{ border-bottom:none; }}
  .row .k {{ font-family:'SF Mono',monospace; font-size:10px; color:#5a5550; letter-spacing:0.12em; text-transform:uppercase; font-weight:700; }}
  .row .v {{ font-family:Georgia,serif; font-size:15px; line-height:1.5; color:#f5f0e8; }}
  ul {{ list-style:none; padding:0; }}
  li {{ padding:9px 0; border-bottom:1px solid #1a1a1a; font-size:14.5px; line-height:1.5; color:#d8d2c6; }}
  li:last-child {{ border-bottom:none; }}
  li::before {{ content:'• '; color:#c8f060; }}
  .empty {{ color:#5a5550; font-style:italic; font-family:Georgia,serif; }}
  .ex {{ padding:14px 16px; background:#141414; border-left:3px solid #60c8f0; margin:8px 0; }}
  .ex-ctx {{ font-family:'SF Mono',monospace; font-size:10px; color:#60c8f0; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; margin-bottom:6px; }}
  .ex-q {{ font-family:Georgia,serif; font-size:16px; line-height:1.5; font-style:italic; color:#f5f0e8; margin-bottom:8px; }}
  .ex-d {{ font-family:'SF Mono',monospace; font-size:11px; color:#5a5550; }}
  .theme {{ display:grid; grid-template-columns:200px 1fr 50px; gap:14px; padding:7px 0; align-items:center; font-family:'SF Mono',monospace; font-size:11px; color:#b8b3a8; }}
  .th-bar {{ height:6px; background:#1a1a1a; display:block; }}
  .th-fill {{ height:100%; background:#c8f060; display:block; }}
  .th-w {{ color:#c8f060; font-weight:700; text-align:right; }}
  .meta-band {{ font-family:'SF Mono',monospace; font-size:10px; color:#5a5550; letter-spacing:0.1em; padding:14px 0; border-top:1px solid #2a2a2a; margin-top:18px; text-transform:uppercase; }}
</style>
</head>
<body>
<div class="shell">

  <header>
    <div class="sub">/ Voice Profile · auto-extracted</div>
    <h1>Голос <span class="a">{identity.get("name", "—")}</span></h1>
  </header>

  <div class="sec">
    <h2>Identity</h2>
    <div class="row"><span class="k">Имя</span><span class="v">{identity.get("name", "—")}</span></div>
    <div class="row"><span class="k">Чем занимается</span><span class="v">{identity.get("what_i_do", "—")}</span></div>
    <div class="row"><span class="k">Кому продаёт</span><span class="v">{identity.get("target_audience", "—")}</span></div>
    <div class="row"><span class="k">Отличие</span><span class="v">{identity.get("differentiation", "—")}</span></div>
    <div class="row"><span class="k">Возраст</span><span class="v">{identity.get("business_age_or_scale", "—")}</span></div>
  </div>

  <div class="sec">
    <h2>Tone of <span class="a">voice</span></h2>
    <div class="row"><span class="k">Обращение</span><span class="v">на {tone.get("addressing", "—")}</span></div>
    <div class="row"><span class="k">Формальность</span><span class="v">{tone.get("formality", "—")}</span></div>
    <div class="row"><span class="k">Энергия</span><span class="v">{tone.get("energy", "—")}</span></div>
    <div class="row"><span class="k">Юмор</span><span class="v">{tone.get("humor", "—")}</span></div>
    <div class="row"><span class="k">Эмодзи</span><span class="v">{tone.get("emoji_usage", "—")}</span></div>
    <div class="row"><span class="k">Длина фраз</span><span class="v">{tone.get("typical_length", "—")}</span></div>
    <div class="row"><span class="k">% «я»</span><span class="v">{int(float(tone.get("first_person_share", 0))*100)}%</span></div>
  </div>

  <div class="sec">
    <h2>Ценности</h2>
    <ul>{values}</ul>
  </div>

  <div class="sec">
    <h2>Красные <span class="a">линии</span></h2>
    <ul>{red}</ul>
  </div>

  <div class="sec">
    <h2>Любимые <span class="a">фразы</span></h2>
    <ul>{fav}</ul>
  </div>

  <div class="sec">
    <h2>Запретные слова</h2>
    <ul>{ban}</ul>
  </div>

  <div class="sec">
    <h2>Образцы <span class="a">стиля</span></h2>
    {examples or '<div class="empty">— нет образцов —</div>'}
  </div>

  <div class="sec">
    <h2>Темы</h2>
    {themes or '<div class="empty">— нет тем —</div>'}
  </div>

  <div class="sec">
    <h2>Vocabulary</h2>
    <div class="v" style="font-family:Georgia,serif; font-size:14.5px; color:#d8d2c6;">{p.get("vocabulary_notes", "—")}</div>
  </div>

  <div class="meta-band">
    META · {meta.get("model", "MOCK")} · ${meta.get("cost_usd", 0)} · {meta.get("input_tokens", 0)}+{meta.get("output_tokens", 0)} tokens · {meta.get("elapsed_seconds", 0)}s · {meta.get("generated_at", "—")}
  </div>

</div>
</body>
</html>
"""


# ============ Auto-fill prompt placeholders ============

def autofill_ig_prompt(profile: dict) -> str:
    """Создать обновлённый промпт IG-Менеджера с заполненными плейсхолдерами.

    Не перезаписывает оригинал — возвращает новый текст. Илья ревьюит и подтверждает.
    """
    original = (ROOT / "agent-prompts" / "01-ig-manager.md").read_text(encoding="utf-8")

    identity = profile.get("identity", {})
    tone = profile.get("tone_of_voice", {})
    fav = profile.get("favorite_phrases", [])
    ban = profile.get("banned_phrases", [])
    values = profile.get("values", [])
    red = profile.get("red_lines", [])

    # Простая подстановка плейсхолдеров (грубая, для review)
    replacements = {
        "[одна строка — что продаём]": identity.get("what_i_do", "[НЕ_ЗАПОЛНЕНО]"),
        "[ICP — кто целевая аудитория]": identity.get("target_audience", "[НЕ_ЗАПОЛНЕНО]"),
        "[уникальность, чем отличаемся от конкурентов]": identity.get("differentiation", "[НЕ_ЗАПОЛНЕНО]"),
        "[сколько лет / клиентов]": identity.get("business_age_or_scale", "[НЕ_ЗАПОЛНЕНО]"),
    }

    new_text = original
    for needle, repl in replacements.items():
        new_text = new_text.replace(needle, repl)

    # Заменим примеры фраз
    if fav:
        phrases_block = "\n".join(f"- «{p}»" for p in fav)
        # Найти секцию любимых фраз и подставить
        marker = "**Любимые выражения** (используй естественно, не вставляй насильно):"
        if marker in new_text:
            idx = new_text.find(marker) + len(marker)
            next_section = new_text.find("\n\n**Запретные слова**", idx)
            if next_section != -1:
                new_text = new_text[:idx] + "\n\n" + phrases_block + "\n" + new_text[next_section:]

    return new_text


# ============ CLI ============

def main():
    parser = argparse.ArgumentParser(description="Voice analyzer · podcasts → profile")
    parser.add_argument("--file", help="Конкретный транскрипт из voice-input/transcripts/")
    parser.add_argument("--mock", action="store_true", help="Без вызова API, заглушка")
    parser.add_argument("--no-autofill", action="store_true", help="Не генерировать обновлённый промпт IG")
    args = parser.parse_args()

    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)

    # Получаем транскрипты или mock
    if args.mock or os.getenv("AISALES_MOCK") == "1":
        print("→ MOCK MODE")
        profile = _mock_profile()
        meta = {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "model": "MOCK",
            "input_tokens": 0,
            "output_tokens": 0,
            "cost_usd": 0.0,
            "elapsed_seconds": 0,
        }
    else:
        transcripts = collect_transcripts(args.file)
        profile, meta = _real_analysis(transcripts)

    # Сохранить
    profile_path = ANALYSIS_DIR / "voice-profile.json"
    profile_path.write_text(
        json.dumps({"profile": profile, "meta": meta}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    report_path = ANALYSIS_DIR / "voice-profile-report.html"
    report_path.write_text(render_report(profile, meta), encoding="utf-8")

    print()
    print("=" * 60)
    print("ГОЛОС ИЗВЛЕЧЁН")
    print("=" * 60)
    print(f"  JSON:   {profile_path}")
    print(f"  HTML:   {report_path}")
    print()

    # Авто-заполнение промпта
    if not args.no_autofill:
        new_prompt_text = autofill_ig_prompt(profile)
        new_prompt_path = ANALYSIS_DIR / "01-ig-manager.AUTO-FILLED.md"
        new_prompt_path.write_text(new_prompt_text, encoding="utf-8")
        print(f"  AUTOFILL: {new_prompt_path}")
        print(f"  → Просмотри. Если устраивает: cp {new_prompt_path} {ROOT}/agent-prompts/01-ig-manager.md")
        print()

    # Резюме
    p = profile
    print(f"  Identity:        {p['identity'].get('name', '—')} · {p['identity'].get('what_i_do', '—')[:60]}")
    print(f"  Tone:            на «{p['tone_of_voice'].get('addressing', '—')}» · {p['tone_of_voice'].get('formality', '—')}")
    print(f"  Values:          {len(p.get('values', []))} штук")
    print(f"  Red lines:       {len(p.get('red_lines', []))} штук")
    print(f"  Favorite:        {len(p.get('favorite_phrases', []))} фраз")
    print(f"  Style examples:  {len(p.get('style_examples', []))} цитат")
    print(f"  Themes:          {len(p.get('themes', []))} тем")
    print()
    if not (args.mock or os.getenv("AISALES_MOCK") == "1"):
        print(f"  Tokens: {meta['input_tokens']}+{meta['output_tokens']} · Cost: ${meta['cost_usd']}")
    print()


if __name__ == "__main__":
    main()
