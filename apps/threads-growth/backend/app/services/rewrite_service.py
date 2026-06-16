"""Style Profile + Content Rewrite Engine — Claude (§8).

Генерирует N адаптаций под стиль Ильи Палия (prompts/style_profile.md +
rewrite_threads.md). Уникализация — НЕ копирование:
  text_similarity     < 0.25   (лексическая близость, Jaccard по токенам)
  semantic_similarity < 0.80   (косинус эмбеддингов)
Лимит 500 символов, ≤1 хэштег. Адаптации, не прошедшие пороги, отсеиваются.
"""
from __future__ import annotations

import json
import re

from sqlalchemy.orm import Session

from app.config import settings
from app.core.llm import claude_complete, embed, load_prompt
from app.models.generated_content import GeneratedContent
from app.models.viral_post import ViralPost


# ── Similarity (чистые функции) ──────────────────────────────────────────────
def _tokens(text: str) -> set[str]:
    return set(re.findall(r"\w+", text.lower()))


def text_similarity(a: str, b: str) -> float:
    """Jaccard по словам — грубая лексическая близость (антиплагиат)."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def cosine(a, b) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


def semantic_similarity(a: str, b: str) -> float:
    ea, eb = embed(a), embed(b)
    if ea is None or eb is None:
        return 0.0   # без эмбеддингов семантический гейт пропускаем (лексический остаётся)
    return cosine(ea, eb)


def check_similarity(original: str, rewritten: str) -> dict:
    txt = text_similarity(original, rewritten)
    sem = semantic_similarity(original, rewritten)
    ok = txt < settings.text_similarity_max and sem < settings.semantic_similarity_max
    return {"text_similarity": txt, "semantic_similarity": sem, "passed": ok}


def _enforce_limits(text: str) -> str:
    text = text.strip()[:500]                       # ≤500 символов (§2)
    hashtags = re.findall(r"#\w+", text)
    if len(hashtags) > 1:                            # ≤1 хэштег
        for extra in hashtags[1:]:
            text = text.replace(extra, "", 1)
    return text.strip()


def _parse_variants(raw: str, count: int) -> list[str]:
    i, j = raw.find("["), raw.rfind("]")
    if 0 <= i < j:
        try:
            arr = json.loads(raw[i : j + 1])
            return [_enforce_limits(str(x)) for x in arr][:count]
        except json.JSONDecodeError:
            pass
    return [_enforce_limits(ln) for ln in raw.splitlines() if ln.strip()][:count]


def generate_adaptations(db: Session, viral_post_id: int, account_id: int | None = None,
                         count: int | None = None) -> list[GeneratedContent]:
    """Генерит адаптации, прогоняет similarity-гейт, сохраняет прошедшие как draft."""
    count = count or settings.adapt_variants
    post = db.get(ViralPost, viral_post_id)
    if post is None or not post.text:
        return []

    style = load_prompt("style_profile")
    system = load_prompt("rewrite_threads") + "\n\n" + style
    raw = claude_complete(
        system=system,
        user=f"Исходный вирусный пост (источник механики, НЕ для копирования):\n{post.text[:3000]}\n\n"
             f"Верни СТРОГО JSON-массив из {count} оригинальных адаптаций (строки).",
        max_tokens=1600,
    )
    variants = _parse_variants(raw, count)

    saved: list[GeneratedContent] = []
    for text in variants:
        sim = check_similarity(post.text, text)
        if not sim["passed"]:
            continue
        gc = GeneratedContent(
            source_post_id=post.id, account_id=account_id, content=text,
            topic=post.text[:80], status="draft",
            similarity_score=sim["semantic_similarity"], text_similarity=sim["text_similarity"],
        )
        db.add(gc)
        saved.append(gc)
    post.status = "adapted"
    db.flush()
    return saved
