"""
Загрузка системных промптов из ../../agent-prompts/.
В production эти промпты будут жить в БД (таблица prompt_versions) для версионирования.
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "agent-prompts"

PROMPT_FILES = {
    "ig": "01-ig-manager.md",
    "tg": "02-tg-manager.md",
    "analyst": "03-analyst.md",
    "rop": "04-rop.md",
}


def load_prompt(agent: Literal["ig", "tg", "analyst", "rop"]) -> str:
    """Загрузить системный промпт для указанного агента."""
    path = PROMPTS_DIR / PROMPT_FILES[agent]
    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found: {path}")
    return path.read_text(encoding="utf-8")


def check_placeholders(prompt: str) -> list[str]:
    """Найти незаполненные плейсхолдеры в промпте.

    Ловит:
    - [ПЛЕЙСХОЛДЕР]  — всё в квадратных скобках с большой буквы / underscore
    - [N лет], [N₽]  — с цифрой
    - ⚠ TODO маркеры
    """
    import re
    placeholders = set()

    # [TEXT_TEXT] или [Текст с дефисом] или [N лет] — общий паттерн квадратных скобок
    for m in re.findall(r"\[([^\]]+)\]", prompt):
        # Отсекаем технические шаблоны: ссылки [text](url), CSS, JSON
        if any(c in m for c in ["(", ")", "{", "}", "/", '"', ":"]):
            continue
        # Отсекаем переменные программного вида в нижнем регистре
        if m.islower() and "_" in m:
            continue
        placeholders.add(m.strip())

    # ⚠ TODO маркеры
    todos = re.findall(r"⚠\s*TODO[^.\n]*", prompt)
    for t in todos:
        placeholders.add(t.strip()[:60])

    return sorted(placeholders)


if __name__ == "__main__":
    # Утилита: проверить заполненность всех промптов
    print("=" * 60)
    print("PROMPT PLACEHOLDERS CHECK")
    print("=" * 60)
    for agent in ["ig", "tg", "analyst", "rop"]:
        try:
            prompt = load_prompt(agent)  # type: ignore
            placeholders = check_placeholders(prompt)
            status = "✓ READY" if not placeholders else f"⚠ {len(placeholders)} ПЛЕЙСХОЛДЕРОВ"
            print(f"\n{agent.upper()}: {status}")
            if placeholders:
                for p in placeholders[:10]:
                    print(f"  - [{p}]")
                if len(placeholders) > 10:
                    print(f"  ... и ещё {len(placeholders) - 10}")
        except FileNotFoundError as e:
            print(f"\n{agent.upper()}: ✕ {e}")
