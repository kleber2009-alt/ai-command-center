"""Reply Engine — Claude (§9, главный драйвер роста).

Драфтит реплай, ДОБАВЛЯЮЩИЙ ценность (инсайт / контр-тейк / опыт / вопрос),
в стиле Ильи. Анти-«согласен!»: score_reply_quality отбраковывает пустые реакции.
Промпт: app/prompts/reply_generation.md + style_profile.md.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.core.llm import claude_complete, load_prompt
from app.models.reply import Reply
from app.models.reply_target import ReplyTarget

# Пустые реакции, которые НЕ дают ценности (§9).
_LOW_VALUE = re.compile(
    r"^\W*(согласен|согласна|круто|класс|супер|так точно|это правда|"
    r"agree|nice|great|exactly|this|so true|love this)\W*$",
    re.IGNORECASE,
)


def score_reply_quality(draft: str) -> float:
    """0..1. Штрафует короткие/пустые реакции, поощряет содержательность."""
    text = (draft or "").strip()
    if not text or _LOW_VALUE.match(text):
        return 0.0
    words = len(re.findall(r"\w+", text))
    if words < 6:
        return 0.2
    # Сигналы ценности: вопрос, цифра, контраст/опыт.
    signal = 0.0
    if "?" in text:
        signal += 0.2
    if re.search(r"\d", text):
        signal += 0.1
    if re.search(r"\b(но|однако|на самом деле|опыт|кейс|but|actually|however)\b", text, re.IGNORECASE):
        signal += 0.2
    base = min(0.5, words / 60)
    return min(1.0, 0.3 + base + signal)


def draft_reply(target_text: str, tone_of_voice: str = "") -> str:
    return claude_complete(
        system=load_prompt("reply_generation") + "\n\n" + load_prompt("style_profile"),
        user=f"Голос бренда: {tone_of_voice or 'стиль Ильи Палия'}\n\nПост, на который отвечаем:\n{target_text[:2500]}",
        max_tokens=400,
    )


def generate_reply(db: Session, target_id: int, account_id: int, tone_of_voice: str = "",
                   min_quality: float = 0.5) -> Reply | None:
    """Драфтит реплай на цель, проверяет качество, сохраняет как draft."""
    target = db.get(ReplyTarget, target_id)
    if target is None or not target.text:
        return None
    text = draft_reply(target.text, tone_of_voice)
    if score_reply_quality(text) < min_quality:
        return None
    reply = Reply(target_id=target_id, account_id=account_id, text=text[:500], status="draft")
    db.add(reply)
    db.flush()
    return reply
