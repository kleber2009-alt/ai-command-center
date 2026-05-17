"""
AI-генератор сценариев Reels.

Параллель к carousel_generator.py — но для коротких видео.
Шаблоны: hook-reveal · tutorial · case-talking-head.

Выход:
- JSON со сценарием (раскадровка + voice-over + cues)
- HTML с раскадровкой в дизайн-системе AI Mastery
- SRT с субтитрами для импорта в Submagic/Captions/Veed

Запуск:
    python -m utils.reel_generator \\
        --topic "Уволил 4 продажников. +30% рост" \\
        --template hook-reveal --segment A --duration 60 --mock
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
OUT_DIR = ROOT / "reels" / "generated"

Template = Literal["hook-reveal", "tutorial", "case-talking-head"]
Segment = Literal["A", "B", "C", "all"]

MODEL = "claude-opus-4-7-20260101"

TEMPLATE_FRAMES: dict[Template, list[dict]] = {
    "hook-reveal": [
        {"role": "hook",   "t_start": 0,  "t_end": 3,  "label": "HOOK · 3 секунды"},
        {"role": "tease",  "t_start": 3,  "t_end": 15, "label": "TEASE · обещание"},
        {"role": "block_1","t_start": 15, "t_end": 30, "label": "BLOCK 1 · первый инсайт"},
        {"role": "block_2","t_start": 30, "t_end": 45, "label": "BLOCK 2 · второй+третий"},
        {"role": "cta",    "t_start": 45, "t_end": 60, "label": "CLIMAX + CTA"},
    ],
    "tutorial": [
        {"role": "hook",   "t_start": 0,  "t_end": 5,  "label": "HOOK"},
        {"role": "tease",  "t_start": 5,  "t_end": 15, "label": "TEASE · что узнаешь"},
        {"role": "step_1", "t_start": 15, "t_end": 35, "label": "ШАГ 1"},
        {"role": "step_2", "t_start": 35, "t_end": 50, "label": "ШАГ 2"},
        {"role": "step_3", "t_start": 50, "t_end": 65, "label": "ШАГ 3"},
        {"role": "cta",    "t_start": 65, "t_end": 75, "label": "CTA · «сохрани»"},
    ],
    "case-talking-head": [
        {"role": "hook",    "t_start": 0,  "t_end": 5,  "label": "HOOK · цифра-результат"},
        {"role": "context", "t_start": 5,  "t_end": 20, "label": "КОНТЕКСТ · кто клиент"},
        {"role": "before",  "t_start": 20, "t_end": 35, "label": "БЫЛО"},
        {"role": "what",    "t_start": 35, "t_end": 55, "label": "ЧТО СДЕЛАЛИ"},
        {"role": "result",  "t_start": 55, "t_end": 75, "label": "РЕЗУЛЬТАТ"},
        {"role": "cta",     "t_start": 75, "t_end": 90, "label": "CTA"},
    ],
}

SEGMENT_DESCS = {
    "A": "Горячий: ICP 70+. Прямой язык, цифры, конкретика.",
    "B": "Тёплый: ICP 40-70. Чуть мягче, кейсы важны.",
    "C": "Холодный: ICP < 40. Сильный hook, фокус на боли.",
    "all": "Универсальный: баланс образования и продажи.",
}


# ============ MOCK ============

def _mock_reel(template: Template, topic: str, segment: Segment, duration: int) -> dict:
    """Заглушка."""
    if template == "hook-reveal":
        frames = [
            {"role": "hook", "t_start": 0, "t_end": 3, "scene": "Я уволил 4 продажников.\nИ вырос на 30%.",
             "voiceover": "Я уволил четырёх продажников. И за два месяца вырос на тридцать процентов.",
             "visual": "Talking head close-up · тёмный фон · резкий зум-ин на 2-й секунде",
             "subtitle": "Я уволил 4 продажников. +30%.",
             "sfx": "Whoosh на смене текста"},
            {"role": "tease", "t_start": 3, "t_end": 15, "scene": "Спойлер:\nдело не в AI.",
             "voiceover": "Сейчас расскажу как. И сразу спойлер — дело не в AI. Дело в трёх вещах которые я понял про продажи.",
             "visual": "Кадры с дашборда · цифры на экране",
             "subtitle": "Дело не в AI.",
             "sfx": "Низкий бас-удар"},
            {"role": "block_1", "t_start": 15, "t_end": 30, "scene": "01 — Хороший\nпродажник дорог.",
             "voiceover": "Первое. Хороший продажник стоит сто двадцать тысяч в месяц. Четыре — почти полмиллиона. Это не зарплата. Это абонемент.",
             "visual": "Цифра «120к/мес × 4» overlay · B-roll: счета",
             "subtitle": "120к/мес × 4 = 480к/мес.",
             "sfx": "—"},
            {"role": "block_2", "t_start": 30, "t_end": 45, "scene": "02 Спит 8 часов\n03 Забывает контекст",
             "voiceover": "Второе — спит. Восемь часов клиент пишет вечером — никто не отвечает. Третье — забывает контекст. Третий раз спрашивает о том, что я сказал месяц назад.",
             "visual": "B-roll: ночной город · скролл переписки",
             "subtitle": "Спит. Забывает.",
             "sfx": "—"},
            {"role": "cta", "t_start": 45, "t_end": 60, "scene": "Решил иначе.\n«AI» в директ →",
             "voiceover": "Я решил иначе. И за два месяца это вернуло мне триста часов в неделю. Хочешь узнать как — напиши «AI» в директ — пришлю разбор.",
             "visual": "Talking head · CTA-subtitle жирно в нижней трети",
             "subtitle": "«AI» в директ → пришлю разбор.",
             "sfx": "Финальный pop"},
        ]
    elif template == "tutorial":
        frames = [
            {"role": "hook", "t_start": 0, "t_end": 5, "scene": "90% твоих первых сообщений\nв директ — мусор.",
             "voiceover": "Девяносто процентов твоих первых сообщений в директ — мусор. Сейчас покажу как писать чтобы отвечали.",
             "visual": "Talking head crash zoom", "subtitle": "90% мусор. Учу писать.", "sfx": "Whoosh"},
            {"role": "tease", "t_start": 5, "t_end": 15, "scene": "3 правила.\nНа примерах.",
             "voiceover": "Три правила, на конкретных примерах. Сохраняй пост, проверишь себя завтра.",
             "visual": "Screen recording IG-директа", "subtitle": "3 правила. Сохраняй.", "sfx": "—"},
            {"role": "step_1", "t_start": 15, "t_end": 35, "scene": "01 — Не «Привет!\nМеня зовут N»",
             "voiceover": "Первое. Никогда не «Привет, меня зовут». Вместо этого — конкретная ссылка на его контент плюс вопрос. Запросто, естественно.",
             "visual": "Screen rec · 2 примера BAD vs GOOD", "subtitle": "Не «привет, меня зовут».", "sfx": "—"},
            {"role": "step_2", "t_start": 35, "t_end": 50, "scene": "02 — Один вопрос.\nНе три.",
             "voiceover": "Второе. Один вопрос. Не три, не пять. И обязательно открытый — на который нельзя ответить да/нет.",
             "visual": "Screen rec · bad vs good", "subtitle": "Один открытый вопрос.", "sfx": "—"},
            {"role": "step_3", "t_start": 50, "t_end": 65, "scene": "03 — Без CTA\nв первом.",
             "voiceover": "Третье. Никаких ссылок, никаких «приходи на консультацию» в первом сообщении. Сначала диалог. Продажа — потом.",
             "visual": "Screen rec · пример без CTA", "subtitle": "Сначала диалог.", "sfx": "—"},
            {"role": "cta", "t_start": 65, "t_end": 75, "scene": "Сохрани.\n«директ» в DM.",
             "voiceover": "Сохрани и покажи себе перед следующим директом. Хочешь полный гайд — напиши «директ» в личку. Пришлю PDF.",
             "visual": "CTA subtitle большой", "subtitle": "DM «директ» — пришлю PDF.", "sfx": "Финальный pop"},
        ]
    else:  # case-talking-head
        frames = [
            {"role": "hook", "t_start": 0, "t_end": 5, "scene": "+1.2x за 3 месяца.\nБез новой команды.",
             "voiceover": "Плюс одна целых две десятых раза за три месяца. Без новой команды, без рекламы.",
             "visual": "Talking head · число +1.2x overlay", "subtitle": "+1.2x за 3 месяца.", "sfx": "Whoosh"},
            {"role": "context", "t_start": 5, "t_end": 20, "scene": "Маркетинговое\nагентство · 8 чел",
             "voiceover": "Маркетинговое агентство, восемь человек, двенадцать клиентов, оборот 1.2 млн в месяц. Два с половиной года в нише.",
             "visual": "Карточка с цифрами клиента", "subtitle": "8 чел · 12 клиентов · 1.2М/мес.", "sfx": "—"},
            {"role": "before", "t_start": 20, "t_end": 35, "scene": "Было стабильно.\nИ стагно.",
             "voiceover": "Стабильно. И стагно. Лиды плохие. Воронка теряется. Менеджер в отпуске — простой.",
             "visual": "B-roll скриншоты CRM", "subtitle": "Стабильно. Стагно.", "sfx": "—"},
            {"role": "what", "t_start": 35, "t_end": 55, "scene": "AI-агент.\n5 дней внедрения.",
             "voiceover": "Поставили AI-агента. Не помощника. Полноценную замену. Внедрение — пять дней. Без остановки текущей работы.",
             "visual": "Скрин дашборда · цифры", "subtitle": "AI-агент. 5 дней.", "sfx": "—"},
            {"role": "result", "t_start": 55, "t_end": 75, "scene": "Конверсия 14.2%.\n18 часов/нед.",
             "voiceover": "Через три месяца — оборот плюс 1.2 раза. Конверсия с 7.8 до 14.2%. И главное — 18 часов в неделю освободилось.",
             "visual": "Цифры на экране одна за одной", "subtitle": "14.2% · +18ч/нед.", "sfx": "—"},
            {"role": "cta", "t_start": 75, "t_end": 90, "scene": "Хочешь так же?\n«КЕЙС» в директ.",
             "voiceover": "Хочешь так же — напиши «КЕЙС» в директ. Пришлю детали внедрения и чек-лист.",
             "visual": "Talking head · CTA subtitle", "subtitle": "«КЕЙС» в директ.", "sfx": "Финальный"},
        ]

    caption = (
        f"{frames[0]['scene'].replace(chr(10), ' ')}\n\n"
        f"60 секунд, я разобрал. Сохраняй пост — пригодится.\n\n"
        f"Если в твоей нише похожая ситуация — напиши в директ, обсудим под тебя."
    )
    hashtags = ["#автоматизация", "#маркетинг", "#AIагент", "#нейросети", "#бизнес"]

    return {
        "metadata": {
            "topic": topic,
            "template": template,
            "segment": segment,
            "duration_s": duration,
            "frame_count": len(frames),
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "model": "MOCK",
            "tokens_used": 0,
            "cost_usd": 0.0,
        },
        "frames": frames,
        "caption": caption,
        "hashtags": hashtags,
        "music_suggestion": "Lo-fi инструментал · −15 dB от голоса · смены битов на переходах кадров",
        "ab_hooks": [],
    }


# ============ REAL ============

PROMPT_TEMPLATE = """\
Ты — сценарист коротких видео для Instagram Reels / YouTube Shorts. \
Твоя задача — создать сценарий Reel на {duration} секунд по шаблону.

# ТЕМА
{topic}

# ШАБЛОН: {template}
Кадры (frame_count = {frame_count}):
{frames_def}

# СЕГМЕНТ: {segment}
{segment_desc}

# ГОЛОС (из базы знаний)
{voice_context}

# ПРАВИЛА
- Hook (0-3 сек) — резко цепляет, противоречит ожиданиям. 5-12 слов.
- На каждый кадр: scene (текст в кадре 1-2 строки), voiceover (что говорит, точная речь), visual (что в кадре), subtitle (для саб-титров, короткий), sfx (звук, если нужен).
- Voiceover — это ТО ЧТО МОДЕЛЬ БУДЕТ ОЗВУЧИВАТЬ через ElevenLabs. Должно звучать как живая речь, со своим темпом, не «текст с экрана».
- Subtitle — короче voiceover, выделяет главное. Это то что увидят зрители без звука.
- Hooks для A/B-теста — 3 альтернативных варианта первой фразы.

# ВЫХОД
Строго валидный JSON:
```json
{{
  "frames": [
    {{"role": "...", "t_start": 0, "t_end": 3, "scene": "...", "voiceover": "...", "visual": "...", "subtitle": "...", "sfx": "..."}}
  ],
  "caption": "подпись для IG (короче чем у карусели — 80-150 слов)",
  "hashtags": ["#тег1", ...],
  "music_suggestion": "описание музыки",
  "ab_hooks": ["альтернативный hook 1", "hook 2", "hook 3"]
}}
```

Только JSON. Никакого текста до или после.
"""


def _real_reel(template: Template, topic: str, segment: Segment, duration: int, voice_ctx: str) -> dict:
    """Вызов Anthropic."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY не установлен. --mock для теста.")

    try:
        from anthropic import Anthropic  # type: ignore
    except ImportError:
        raise RuntimeError("pip install anthropic")

    client = Anthropic(api_key=api_key)

    frames_def = "\n".join(
        f"  {i+1}. role={f['role']} · t={f['t_start']}-{f['t_end']}s · {f['label']}"
        for i, f in enumerate(TEMPLATE_FRAMES[template])
    )

    prompt = PROMPT_TEMPLATE.format(
        topic=topic, template=template, frame_count=len(TEMPLATE_FRAMES[template]),
        frames_def=frames_def, segment=segment, segment_desc=SEGMENT_DESCS[segment],
        duration=duration, voice_context=voice_ctx or "(голос не настроен, нейтрально)",
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text  # type: ignore
    start, end = raw.find("{"), raw.rfind("}")
    data = json.loads(raw[start:end + 1])

    inp = response.usage.input_tokens / 1_000_000 * 15.0
    out = response.usage.output_tokens / 1_000_000 * 75.0
    data["metadata"] = {
        "topic": topic, "template": template, "segment": segment, "duration_s": duration,
        "frame_count": len(data["frames"]),
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "model": response.model,
        "tokens_used": response.usage.input_tokens + response.usage.output_tokens,
        "cost_usd": round(inp + out, 6),
    }
    return data


# ============ SRT export ============

def _fmt_srt_time(s: float) -> str:
    h = int(s // 3600); m = int((s % 3600) // 60); sec = int(s % 60); ms = int((s - int(s)) * 1000)
    return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"


def render_srt(data: dict) -> str:
    """Сгенерировать SRT для импорта в Submagic/Captions/Veed."""
    lines = []
    for i, f in enumerate(data["frames"], 1):
        lines.append(str(i))
        lines.append(f"{_fmt_srt_time(f['t_start'])} --> {_fmt_srt_time(f['t_end'])}")
        lines.append(f.get("subtitle", "").strip())
        lines.append("")
    return "\n".join(lines)


# ============ HTML storyboard ============

def load_voice_context() -> str:
    p = ROOT / "agent-prompts" / "01-ig-manager.md"
    if not p.exists():
        return ""
    text = p.read_text(encoding="utf-8")
    sections = []
    for marker in ["## VOICE", "## RED LINES", "## STYLE EXAMPLES"]:
        idx = text.find(marker)
        if idx == -1: continue
        nxt = text.find("\n## ", idx + 4)
        sections.append(text[idx:nxt if nxt != -1 else len(text)])
    return "\n\n".join(sections)[:3000]


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><title>Reel · {topic}</title>
<style>
*,*::before,*::after {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ background:#080808; color:#f5f0e8; font-family:Georgia,serif; padding:30px 24px 80px; }}
.shell {{ max-width:1480px; margin:0 auto; display:grid; gap:2px; }}
.head {{ display:flex; justify-content:space-between; align-items:baseline; padding-bottom:16px; border-bottom:1px solid #2a2a2a; margin-bottom:20px; }}
.head h1 {{ font-family:Georgia,serif; font-size:32px; font-weight:normal; letter-spacing:-0.02em; }}
.head h1 .a {{ color:#c8f060; font-style:italic; }}
.head .meta {{ font-family:'SF Mono',monospace; font-size:11px; color:#b8b3a8; letter-spacing:0.12em; }}
.head .meta .v {{ color:#c8f060; }}
.sec-num {{ font-family:'SF Mono',monospace; font-size:10px; color:#c8f060; letter-spacing:0.18em; font-weight:700; }}
.sec-title {{ font-family:Georgia,serif; font-size:14px; font-style:italic; color:#b8b3a8; }}
.sec-head {{ display:flex; align-items:baseline; gap:14px; padding:18px 2px 10px; }}
.sec-spacer {{ flex:1; border-bottom:1px solid #1a1a1a; transform:translateY(-2px); }}
.frames {{ display:grid; grid-template-columns:repeat({grid_cols}, 1fr); gap:2px; }}
@media (max-width:1100px) {{ .frames {{ grid-template-columns:repeat(2, 1fr); }} }}
@media (max-width:700px)  {{ .frames {{ grid-template-columns:1fr; }} }}
.frame {{ background:#0f0f0f; border:1px solid #1a1a1a; }}
.frame.hook {{ border-color:#c8f060; }}
.frame.cta  {{ border-color:#60c8f0; }}
.frame-vid {{ aspect-ratio:9/16; padding:18px; display:flex; flex-direction:column; justify-content:space-between; background:#080808; border-bottom:1px solid #1a1a1a; }}
.frame.hook .frame-vid {{ background:linear-gradient(180deg, #1a2a0d 0%, #080808 100%); }}
.frame-vid .tc {{ font-family:'SF Mono',monospace; font-size:10px; color:#c8f060; letter-spacing:0.15em; font-weight:700; }}
.frame-vid .scene {{ font-family:Georgia,serif; font-size:18px; line-height:1.25; color:#f5f0e8; white-space:pre-line; }}
.frame-vid .visual {{ font-family:'SF Mono',monospace; font-size:9px; color:#5a5550; letter-spacing:0.1em; text-transform:uppercase; }}
.frame-info {{ padding:14px 16px; }}
.frame-info .lbl {{ font-family:'SF Mono',monospace; font-size:9px; color:#5a5550; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; margin-bottom:4px; }}
.frame-info .voice {{ font-family:Georgia,serif; font-size:13.5px; line-height:1.5; color:#d8d2c6; font-style:italic; margin-bottom:10px; }}
.frame-info .sub {{ font-family:'SF Mono',monospace; font-size:11px; color:#60c8f0; letter-spacing:0.04em; margin-bottom:6px; }}
.frame-info .sfx {{ font-family:'SF Mono',monospace; font-size:10px; color:#f06090; letter-spacing:0.08em; }}
.panel {{ background:#0f0f0f; border:1px solid #1a1a1a; padding:22px 26px; }}
.panel h3 {{ font-family:Georgia,serif; font-size:18px; font-weight:normal; margin-bottom:10px; }}
.panel h3 .a {{ color:#c8f060; font-style:italic; }}
.panel pre {{ white-space:pre-wrap; font-family:Georgia,serif; font-size:15px; line-height:1.6; color:#f5f0e8; }}
.hashtags {{ margin-top:14px; font-family:'SF Mono',monospace; font-size:12px; color:#60c8f0; }}
.ab-hooks {{ display:grid; grid-template-columns:1fr; gap:2px; }}
.ab-row {{ background:#141414; padding:12px 16px; display:flex; gap:14px; align-items:center; }}
.ab-row .num {{ font-family:'SF Mono',monospace; font-size:10px; color:#c8f060; letter-spacing:0.16em; font-weight:700; }}
.ab-row .txt {{ font-family:Georgia,serif; font-size:14.5px; }}
.meta-band {{ font-family:'SF Mono',monospace; font-size:10px; color:#5a5550; letter-spacing:0.1em; padding:14px 0; border-top:1px solid #2a2a2a; margin-top:16px; text-transform:uppercase; }}
</style></head><body>
<div class="shell">
<div class="head">
  <h1>Reel · <span class="a">{topic}</span></h1>
  <div class="meta">{template} · <span class="v">{duration}s</span> · сегмент {segment}</div>
</div>

<div class="sec-head"><span class="sec-num">/01</span><span class="sec-title">Раскадровка · {frame_count} кадров</span><span class="sec-spacer"></span></div>
<div class="frames">{frames_html}</div>

<div class="sec-head"><span class="sec-num">/02</span><span class="sec-title">Подпись + хэштеги</span><span class="sec-spacer"></span></div>
<div class="panel"><h3>Caption <span class="a">для IG</span></h3><pre>{caption}</pre><div class="hashtags">{hashtags}</div></div>

<div class="sec-head"><span class="sec-num">/03</span><span class="sec-title">A/B варианты hook'a</span><span class="sec-spacer"></span></div>
<div class="panel"><div class="ab-hooks">{ab_html}</div></div>

<div class="sec-head"><span class="sec-num">/04</span><span class="sec-title">Музыка</span><span class="sec-spacer"></span></div>
<div class="panel"><pre>{music}</pre></div>

<div class="meta-band">META · {model} · ${cost} · {tokens} tokens · {template}</div>
</div></body></html>
"""


def _frame_html(f: dict) -> str:
    sfx = f.get("sfx", "")
    sfx_block = f'<div class="sfx">🔊 {sfx}</div>' if sfx and sfx != "—" else ""
    role_class = f["role"].split("_")[0]
    return (
        f'<div class="frame {role_class}">'
        f'<div class="frame-vid">'
        f'<div class="tc">{_fmt_srt_time(f["t_start"])[3:8]} — {_fmt_srt_time(f["t_end"])[3:8]} · {f["role"].upper()}</div>'
        f'<div class="scene">{f.get("scene", "")}</div>'
        f'<div class="visual">⎚ {f.get("visual", "")[:60]}</div>'
        f'</div>'
        f'<div class="frame-info">'
        f'<div class="lbl">↗ VOICEOVER</div>'
        f'<div class="voice">«{f.get("voiceover", "")}»</div>'
        f'<div class="lbl">SUBTITLE</div>'
        f'<div class="sub">{f.get("subtitle", "")}</div>'
        f'{sfx_block}'
        f'</div></div>'
    )


def render_html(data: dict) -> str:
    frames = data["frames"]
    grid_cols = max(2, min(6, len(frames)))
    frames_html = "".join(_frame_html(f) for f in frames)
    ab_html = "".join(
        f'<div class="ab-row"><span class="num">A/B {i+1}</span><span class="txt">«{h}»</span></div>'
        for i, h in enumerate(data.get("ab_hooks", []))
    ) or '<div style="color:#5a5550; font-style:italic;">— альтернативы не сгенерированы —</div>'

    meta = data["metadata"]
    return HTML_TEMPLATE.format(
        topic=meta["topic"], template=meta["template"], segment=meta["segment"],
        duration=meta["duration_s"], frame_count=len(frames), grid_cols=grid_cols,
        frames_html=frames_html, caption=data["caption"],
        hashtags=" ".join(data["hashtags"]), ab_html=ab_html,
        music=data.get("music_suggestion", "—"),
        model=meta["model"], cost=meta["cost_usd"], tokens=meta["tokens_used"],
    )


# ============ CLI ============

def main():
    parser = argparse.ArgumentParser(description="AI Reel scenario generator")
    parser.add_argument("--topic", required=True)
    parser.add_argument("--template", default="hook-reveal", choices=list(TEMPLATE_FRAMES.keys()))
    parser.add_argument("--segment", default="A", choices=["A", "B", "C", "all"])
    parser.add_argument("--duration", type=int, default=60, help="секунд (30-90)")
    parser.add_argument("--mock", action="store_true")
    parser.add_argument("--out", help="базовое имя без расширения")
    args = parser.parse_args()

    if args.mock or os.getenv("AISALES_MOCK") == "1":
        print(f"→ MOCK · {args.template} · {args.duration}s")
        data = _mock_reel(args.template, args.topic, args.segment, args.duration)
    else:
        print(f"→ REAL · {args.template} · {args.duration}s")
        voice_ctx = load_voice_context()
        data = _real_reel(args.template, args.topic, args.segment, args.duration, voice_ctx)

    safe = "".join(c if c.isalnum() else "-" for c in args.topic.lower())[:40]
    ts = datetime.now().strftime("%Y%m%d-%H%M")
    base = Path(args.out) if args.out else OUT_DIR / f"{ts}-{args.template}-{safe}"
    base.parent.mkdir(parents=True, exist_ok=True)

    base.with_suffix(".html").write_text(render_html(data), encoding="utf-8")
    base.with_suffix(".json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    base.with_suffix(".srt").write_text(render_srt(data), encoding="utf-8")

    print()
    print(f"✓ Reel ready: {len(data['frames'])} кадров")
    print(f"  HTML: {base.with_suffix('.html')}")
    print(f"  JSON: {base.with_suffix('.json')}")
    print(f"  SRT:  {base.with_suffix('.srt')}  ← импорт в Submagic / Captions / Veed")
    print()


if __name__ == "__main__":
    main()
