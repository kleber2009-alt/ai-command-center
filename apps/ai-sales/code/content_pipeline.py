"""
Orchestrator всей контент-машины.

Запуск одной командой:
    cd ~/ai-sales-system/code
    source venv/bin/activate
    python content_pipeline.py --idea "автоматизация SMM" --formats carousel,reel,caption --mock

Что делает:
    1. Берёт идею (из CLI или из idea-bank)
    2. Для каждого формата (carousel / reel / caption / post):
       - Зовёт правильный генератор
       - Сохраняет в правильную папку
       - Обновляет content-bank/pipeline-log.jsonl

    3. Опционально: batch-режим (--batch 5 → 5 идей подряд из bank'a)
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Literal

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
LOG_PATH = PROJECT / "content-bank" / "pipeline-log.jsonl"
IDEA_BANK = PROJECT / "content-bank" / "01-idea-seeds.md"

Format = Literal["carousel", "reel", "caption"]

# Default mapping idea → template
DEFAULT_TEMPLATES = {
    "carousel": "case-study",
    "reel": "hook-reveal",
    "caption": "carousel",
}


def log_run(entry: dict) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def run_module(module: str, args: list[str]) -> dict:
    """Запустить модуль через subprocess, вернуть результат."""
    venv_python = ROOT / "venv" / "bin" / "python"
    py = str(venv_python) if venv_python.exists() else sys.executable
    cmd = [py, "-m", module] + args
    print(f"\n  $ {' '.join(cmd)}")
    t0 = time.time()
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    elapsed = time.time() - t0

    if result.returncode != 0:
        print(f"  ✕ FAIL (code {result.returncode}) · {elapsed:.1f}s", file=sys.stderr)
        print(f"  stderr: {result.stderr[:500]}", file=sys.stderr)
        return {"ok": False, "elapsed": elapsed, "stderr": result.stderr[:1000]}

    print(f"  ✓ OK · {elapsed:.1f}s")
    # Извлечь последние строки
    lines = result.stdout.strip().split("\n")
    return {"ok": True, "elapsed": elapsed, "output_tail": "\n".join(lines[-8:])}


def process_idea(idea: str, formats: list[Format], segment: str, mock: bool) -> dict:
    """Обработать одну идею через все указанные форматы."""
    print(f"\n{'='*60}")
    print(f"IDEA: {idea}")
    print(f"FORMATS: {', '.join(formats)} · SEGMENT: {segment} · {'MOCK' if mock else 'REAL'}")
    print('='*60)

    results = {}
    for fmt in formats:
        print(f"\n→ {fmt.upper()}")
        if fmt == "carousel":
            args = ["--topic", idea, "--template", DEFAULT_TEMPLATES["carousel"],
                    "--segment", segment]
            if mock: args.append("--mock")
            results[fmt] = run_module("utils.carousel_generator", args)
        elif fmt == "reel":
            args = ["--topic", idea, "--template", DEFAULT_TEMPLATES["reel"],
                    "--segment", segment]
            if mock: args.append("--mock")
            results[fmt] = run_module("utils.reel_generator", args)
        elif fmt == "caption":
            args = ["--topic", idea, "--content-type", DEFAULT_TEMPLATES["caption"],
                    "--segment", segment]
            if mock: args.append("--mock")
            results[fmt] = run_module("utils.caption_generator", args)

    entry = {
        "ts": datetime.utcnow().isoformat() + "Z",
        "idea": idea,
        "segment": segment,
        "formats": formats,
        "mock": mock,
        "results": {k: {"ok": v["ok"], "elapsed_s": round(v["elapsed"], 1)} for k, v in results.items()},
    }
    log_run(entry)
    return entry


def parse_idea_bank(n: int) -> list[str]:
    """Грубый парсер: достать первые N идей из 01-idea-seeds.md."""
    if not IDEA_BANK.exists():
        return []
    text = IDEA_BANK.read_text(encoding="utf-8")
    ideas: list[str] = []
    for line in text.split("\n"):
        line = line.strip()
        # Берём строки вида "1. **«...»**" или "1. «...» — ..."
        if not line or not line[0].isdigit():
            continue
        # Strip number+dot+spaces
        body = line.lstrip("0123456789.").lstrip(" -")
        # Cut at first em-dash (description after)
        cut = body.find("—")
        if cut != -1:
            body = body[:cut].strip()
        # Strip markdown bold/italics + quotes
        body = body.replace("**", "").replace("«", "").replace("»", "").strip()
        if body:
            ideas.append(body)
        if len(ideas) >= n:
            break
    return ideas


def main():
    parser = argparse.ArgumentParser(description="Content pipeline orchestrator")
    parser.add_argument("--idea", help="Одна конкретная идея (топик)")
    parser.add_argument("--from-bank", type=int, help="Взять первые N идей из content-bank/01-idea-seeds.md")
    parser.add_argument("--formats", default="carousel,reel,caption",
                        help="Через запятую: carousel, reel, caption")
    parser.add_argument("--segment", default="A", choices=["A", "B", "C", "all"])
    parser.add_argument("--mock", action="store_true")
    args = parser.parse_args()

    formats = [f.strip() for f in args.formats.split(",") if f.strip()]
    valid = {"carousel", "reel", "caption"}
    bad = [f for f in formats if f not in valid]
    if bad:
        print(f"✕ Неизвестные форматы: {bad}. Допустимые: {valid}", file=sys.stderr)
        sys.exit(1)

    # Собрать список идей
    if args.from_bank:
        ideas = parse_idea_bank(args.from_bank)
        if not ideas:
            print(f"✕ Не удалось извлечь идеи из {IDEA_BANK}", file=sys.stderr)
            sys.exit(1)
        print(f"→ Загружено {len(ideas)} идей из bank'a")
    elif args.idea:
        ideas = [args.idea]
    else:
        print("✕ Укажи --idea \"...\" или --from-bank N", file=sys.stderr)
        sys.exit(1)

    # Запустить
    overall_t0 = time.time()
    all_results = []
    for idea in ideas:
        result = process_idea(idea, formats, args.segment, args.mock)
        all_results.append(result)

    overall_elapsed = time.time() - overall_t0

    # Итог
    print(f"\n\n{'='*60}")
    print("PIPELINE COMPLETE")
    print('='*60)
    total_ok = sum(1 for r in all_results for v in r["results"].values() if v["ok"])
    total_runs = sum(len(r["results"]) for r in all_results)
    print(f"  Идей обработано: {len(ideas)}")
    print(f"  Генераций:       {total_ok}/{total_runs} успешно")
    print(f"  Общее время:     {overall_elapsed:.1f}s")
    print(f"  Лог:             {LOG_PATH}")
    print()
    print(f"  Результаты:")
    print(f"  · Карусели:  {PROJECT}/carousels/generated/")
    print(f"  · Reels:     {PROJECT}/reels/generated/")
    print(f"  · Captions:  {PROJECT}/content-bank/generated-captions/")


if __name__ == "__main__":
    main()
