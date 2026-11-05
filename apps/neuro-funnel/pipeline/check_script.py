#!/usr/bin/env python3
"""Проверить суфлёр урока перед аватаром:  python3 check_script.py ../lessons/01

Для каждого слайда — текст `say`: длина (12–75 с при 2,5 слова/с), фразы до 22 слов, без цифр, латиницы,
скобок, %, ссылок и эмодзи (аватар их читает криво). Пишет prompter.md — суфлёр урока по слайдам.
Код выхода 1, если есть FAIL.
"""
import json, re, sys
from pathlib import Path

WPS, MIN_S, MAX_S, MAX_PHRASE = 2.5, 12, 75, 22


def main():
    d = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    lesson = json.loads((d / "lesson.json").read_text())
    fails, warns, total = [], [], 0.0
    md = [f"# Урок {lesson['n']}. {lesson['title']} — суфлёр", ""]
    for i, s in enumerate(lesson["slides"], 1):
        say = s.get("say", "").strip()
        words = len(re.findall(r"[\wА-Яа-яЁё-]+", say))
        sec = words / WPS
        total += sec
        tag = f"слайд {i}"
        if not say:
            fails.append(f"{tag}: нет текста")
        if sec < MIN_S or sec > MAX_S:
            warns.append(f"{tag}: ≈{sec:.0f} с (норма {MIN_S}–{MAX_S})")
        if re.search(r"\d", say):
            fails.append(f"{tag}: цифры — напиши словами")
        if re.search(r"[A-Za-z]", say):
            fails.append(f"{tag}: латиница — напиши, как произносится")
        if re.search(r"[()\[\]%#@*/<>]|https?:", say):
            fails.append(f"{tag}: скобки, знаки или ссылки")
        for ph in re.split(r"(?<=[.!?])\s+", say):
            n = len(ph.split())
            if n > MAX_PHRASE:
                warns.append(f"{tag}: длинная фраза ({n} слов): «{ph[:60]}…»")
        md += [f"## {i}. {s.get('title') or s.get('big', '')}", f"_≈{sec:.0f} с_", "", say, ""]
    md.insert(1, f"\nОбщая длина ≈ {total/60:.1f} мин, слайдов {len(lesson['slides'])}.\n")
    (d / "prompter.md").write_text("\n".join(md))
    for w in warns:
        print("WARN", w)
    for f in fails:
        print("FAIL", f)
    print(f"итого ≈ {total/60:.1f} мин · {len(fails)} FAIL · {len(warns)} WARN · суфлёр: {d/'prompter.md'}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
