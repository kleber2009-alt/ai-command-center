#!/usr/bin/env python3
"""Шаг 5. Проверить новый сценарий перед аватаром: уникальность, длина, кодовое слово, годность для озвучки

  python3 check_script.py <slug> [--script <файл>]     (по умолчанию <задача>/script.txt против transcript.txt)

FAIL (код выхода 1) — исправь сценарий и запусти снова; WARN — посмотри и реши сам; всё пишется в check.json.
  уникальность  доля трёхсловных связок нового текста, взятых из оригинала (scripts.max_overlap; WARN выше warn_overlap),
                и самый длинный общий кусок подряд (max_common_run слов; кусок с кодовым словом в призыве не считается)
  хук           первая фраза не та же самая (иначе FAIL), заметно другая (иначе WARN)
  длина         ≈ слов / words_per_sec секунд: в пределах min_sec..max_sec; к оригиналу — в пределах length_ratio
  код-слово     то же, что в оригинале (на него настроена автоматизация в Директе), и звучит в последней трети
  озвучка       без разметки, ремарок, эмодзи и ссылок; латиница и «10к»/«%» — WARN (напиши, как произносится)
"""
import argparse, json, os, re, sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # и под python3 -I
from common import config, job_dir, read_json, write_json

OPENERS = ("привет", "всем привет", "сегодня я расскажу", "сегодня расскажу", "многие спрашивают", "многие меня спрашивают",
           "в этом видео", "знаете ли вы", "хотите узнать")


def tokens(t: str) -> list:
    return re.findall(r"[a-zа-я0-9+]+", t.lower().replace("ё", "е"))


def grams(ws: list, n: int = 3) -> set:
    return {tuple(ws[i:i + n]) for i in range(len(ws) - n + 1)}


def longest_run(a: list, b: list):
    best, end, prev = 0, 0, [0] * (len(b) + 1)
    for i in range(1, len(a) + 1):
        cur = [0] * (len(b) + 1)
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                cur[j] = prev[j - 1] + 1
                if cur[j] > best:
                    best, end = cur[j], i
        prev = cur
    return best, a[end - best:end]


def sentences(t: str) -> list:
    return [s.strip() for s in re.split(r"(?<=[.!?…])\s+|\n+", t) if s.strip()]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("job")
    ap.add_argument("--script")
    a = ap.parse_args()
    job = job_dir(a.job)
    cfg = config()["script"]
    sp, tp = Path(a.script) if a.script else job / "script.txt", job / "transcript.txt"
    for f, what in ((tp, "расшифровки оригинала — сначала transcribe.py"), (sp, "сценария — напиши script.txt по script-rules.md")):
        if not f.exists():
            sys.exit(f"нет {what}: {f}")
    new, orig = sp.read_text().strip(), tp.read_text().strip()
    src = read_json(job / "source.json", {})
    res = {"fail": [], "warn": [], "ok": []}
    say = lambda kind, msg: res[kind].append(msg)

    nw, ow = tokens(new), tokens(orig)
    code = (src.get("code") or "").lower().replace("ё", "е")
    g_new, g_orig = grams(nw), grams(ow)
    overlap = round(len(g_new & g_orig) / max(len(g_new), 1), 3)
    run, chunk = longest_run(nw, ow)
    if code and code in chunk:  # призыв с тем же кодовым словом может совпадать — это нормально
        run2, chunk2 = longest_run([w for w in nw if w != code], [w for w in ow if w != code])
        run, chunk = min(run, run2), chunk2 if run2 < run else chunk
    res["overlap"], res["common_run"] = overlap, run
    if overlap > cfg["max_overlap"]:
        say("fail", f"уникальность: {overlap:.0%} связок из оригинала (порог {cfg['max_overlap']:.0%}) — перепиши примеры и формулировки")
    elif overlap > cfg["warn_overlap"]:
        say("warn", f"уникальность: {overlap:.0%} связок из оригинала — допустимо, но лучше поменять ещё пару примеров")
    else:
        say("ok", f"уникальность: {overlap:.0%} связок из оригинала")
    if run > cfg["max_common_run"]:
        say("fail", f"кусок из оригинала подряд {run} слов: «{' '.join(chunk)}» — перефразируй")

    sn, so = sentences(new), sentences(orig)
    if sn and so:
        h = len(grams(tokens(sn[0])) & grams(tokens(so[0]))) / max(len(grams(tokens(sn[0]))), 1)
        if tokens(sn[0]) == tokens(so[0]):
            say("fail", "хук слово в слово как в оригинале — усиль его (другой тип или новая картинка того же типа)")
        elif h > 0.5:
            say("warn", f"хук близок к оригиналу ({h:.0%} связок) — точно ли он стал сильнее?")
        if any(" ".join(tokens(sn[0])).startswith(" ".join(tokens(o))) for o in OPENERS):
            say("fail", f"хук начинается с запрещённого захода: «{sn[0][:40]}»")
        long_s = [s for s in sn if len(tokens(s)) > 22]
        if long_s:
            say("warn", f"{len(long_s)} фраз длиннее 22 слов — аватару тяжело, раздели: «{long_s[0][:60]}…»")

    wps = cfg["words_per_sec"]
    est = round(len(nw) / wps, 1)
    res["words"], res["est_sec"] = len(nw), est
    ratio = len(nw) / max(len(ow), 1)
    if not cfg["min_sec"] <= est <= cfg["max_sec"]:
        say("fail", f"длина ≈ {est} с — нужно {cfg['min_sec']}–{cfg['max_sec']} с")
    elif not cfg["length_ratio"][0] <= ratio <= cfg["length_ratio"][1]:
        say("warn", f"длина {len(nw)} слов против {len(ow)} в оригинале ({ratio:.0%}) — залетевший ритм держался на своей длине")
    else:
        say("ok", f"длина ≈ {est} с ({len(nw)} слов, оригинал {len(ow)})")

    if code:
        pos = [i for i, w in enumerate(nw) if w == code or w.startswith(code)]
        if not pos:
            say("fail", f"нет кодового слова «{code.upper()}» — на него настроена автоматизация, оставь то же слово")
        elif pos[-1] < len(nw) * 0.66:
            say("warn", f"кодовое слово «{code.upper()}» звучит раньше последней трети — призыв должен быть в конце")
        else:
            say("ok", f"кодовое слово «{code.upper()}» в призыве")
    else:
        say("warn", "у оригинала не найдено кодовое слово — проверь призыв вручную")

    if re.search(r"[#*_`\[\]<>]|\(в кадре|\(графика|https?://", new):
        say("fail", "в тексте для озвучки есть разметка, ремарки или ссылки — их место в script.md, не в script.txt")
    if re.search(r"[\U0001F300-\U0001FAFF☀-➿]", new):
        say("fail", "эмодзи в тексте для озвучки")
    lat = sorted(set(re.findall(r"\b[A-Za-z][A-Za-z0-9.-]+\b", new)))
    if lat:
        say("warn", "латиница: " + ", ".join(lat[:10]) + " — аватар может прочитать криво; напиши, как произносится (Клод, Чат Джи-Пи-Ти)")
    if re.search(r"\d+\s?[кkKmMм]\b|\d+\s?%", new):
        say("warn", "сокращения чисел (10к, 5%) — напиши словами: «десять тысяч», «пять процентов»")

    write_json(job / "check.json", res)
    for k, mark in (("fail", "FAIL"), ("warn", "WARN"), ("ok", "OK  ")):
        for m in res[k]:
            print(mark, m)
    print(f"RESULT {'FAIL' if res['fail'] else 'PASS'} · уникальность {overlap:.0%} · общий кусок {run} сл. · ≈{est} с")
    sys.exit(1 if res["fail"] else 0)


if __name__ == "__main__":
    main()
