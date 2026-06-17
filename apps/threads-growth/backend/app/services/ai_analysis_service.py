"""AI Pattern Analyzer — Claude (§7).

Разбирает успешный пост по структуре (тема/хук/боль/желание/обещание/конфликт/
формат/CTA/эмоция/«почему сработало»/«как адаптировать под Илью») и извлекает
ПАТТЕРН (структуру), не текст → content_patterns с embedding.
Промпт: app/prompts/viral_analysis.md.
"""
from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.core.llm import claude_complete, embed, load_prompt
from app.models.content_pattern import ContentPattern
from app.models.viral_post import ViralPost


def _extract_json(raw: str) -> str:
    i, j = raw.find("{"), raw.rfind("}")
    return raw[i : j + 1] if 0 <= i < j else raw


def analyze_post(text: str) -> dict:
    """Возвращает разбор паттерна как dict (см. ключи в viral_analysis.md)."""
    raw = claude_complete(
        system=load_prompt("viral_analysis"),
        user=text[:4000],
        max_tokens=1200,
    )
    try:
        return json.loads(_extract_json(raw))
    except json.JSONDecodeError:
        return {}


def analyze_and_store(db: Session, viral_post_id: int) -> ContentPattern | None:
    post = db.get(ViralPost, viral_post_id)
    if post is None or not post.text:
        return None
    data = analyze_post(post.text)
    if not data:
        return None
    template = data.get("structure_template") or data.get("how_to_adapt") or ""
    pattern = ContentPattern(
        topic=data.get("topic"),
        hook_type=data.get("hook_type") or data.get("hook"),
        format=data.get("format"),
        emotion=data.get("emotion"),
        cta_type=data.get("cta_type") or data.get("cta"),
        structure_template=template,
        embedding=embed(template) if template else None,
    )
    db.add(pattern)
    post.status = "analyzed"
    db.flush()
    return pattern
