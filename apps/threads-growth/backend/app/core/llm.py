"""Тонкие обёртки над Claude (Anthropic) и Voyage-эмбеддингами.

Ленивые импорты: модели грузятся без установленных SDK; падают с понятным
сообщением, только когда ключ реально нужен. Промпты лежат в app/prompts/*.md
и читаются через load_prompt().
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.config import settings

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


@lru_cache
def load_prompt(name: str) -> str:
    """name без расширения, напр. 'style_profile'."""
    return (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")


def claude_complete(system: str, user: str, max_tokens: int = 1024) -> str:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY не задан — Claude-вызов невозможен.")
    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    msg = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(b.text for b in msg.content if getattr(b, "type", None) == "text").strip()


def embed(text: str) -> list[float] | None:
    """Voyage-эмбеддинг для дедупа и поиска паттернов. Без ключа → None
    (тогда дедуп падает на эвристику, а не роняет пайплайн)."""
    if not settings.voyage_api_key or not text:
        return None
    import voyageai

    client = voyageai.Client(api_key=settings.voyage_api_key)
    res = client.embed([text], model=settings.voyage_model, input_type="document")
    return res.embeddings[0]
