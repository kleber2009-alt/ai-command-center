#!/usr/bin/env python3
"""Стиль монтажа и история ремейков

  python3 style.py next [--want "<как сказал Илья>"]   какой стиль сейчас: названный в запросе, иначе давно не бывший
  python3 style.py list                                 три стиля и когда каждый был последний раз
  python3 style.py log <slug> --style <id> --result <mp4> [--caption <файл>]   записать готовый ремейк в историю
  python3 style.py history [N]                          последние ремейки

Ротация: стиль, которого ещё не было, иначе тот, что был давнее всех. style_mode в config.json: ask — в чате
спросить Илью, предложив стиль ротации первым; rotate — брать ротацию без вопроса (так всегда без человека).
История (REMAKE_HOME/history.jsonl) ещё и не даёт rank.py взять один и тот же рилс-оригинал повторно.
"""
import argparse, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # и под python3 -I
from common import config, history, job_dir, log, read_json


def styles():
    return config()["styles"]


def match(want: str):
    w = (want or "").lower().replace("ё", "е")
    for s in styles():
        names = [s["id"], s["name"].lower()] + [x.lower() for x in s.get("aka", [])]
        if any(n.replace("ё", "е") in w for n in names):
            return s
    return None


def last_used() -> dict:
    out = {}
    for h in history():
        if h.get("style"):
            out[h["style"]] = h.get("at", "")
    return out


def rotation():
    used = last_used()
    return sorted(styles(), key=lambda s: (s["id"] in used, used.get(s["id"], "")))[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("next")
    n.add_argument("--want", default="")
    sub.add_parser("list")
    lg = sub.add_parser("log")
    lg.add_argument("job")
    lg.add_argument("--style", required=True)
    lg.add_argument("--result", required=True)
    lg.add_argument("--caption")
    hi = sub.add_parser("history")
    hi.add_argument("n", nargs="?", type=int, default=10)
    a = ap.parse_args()

    if a.cmd == "next":
        s = match(a.want)
        if s:
            print(json.dumps({**s, "why": "назван в запросе", "ask": False}, ensure_ascii=False))
        else:
            s = rotation()
            print(json.dumps({**s, "why": "ротация: давнее всех не было", "ask": config().get("style_mode", "ask") == "ask"},
                             ensure_ascii=False))
    elif a.cmd == "list":
        used = last_used()
        for s in styles():
            print(f"{s['id']:28} {s['name']:24} последний раз: {used.get(s['id'], 'ещё не было')[:16]}")
    elif a.cmd == "log":
        if a.style not in {s["id"] for s in styles()}:
            sys.exit(f"неизвестный стиль {a.style}")
        job = job_dir(a.job)
        src, chk, hg = read_json(job / "source.json", {}), read_json(job / "check.json", {}), read_json(job / "heygen.json", {})
        log({"slug": job.name, "source_id": src.get("shortcode") or src.get("id"), "source_url": src.get("url"),
             "source_views": src.get("views"), "code": src.get("code"), "style": a.style, "result": a.result,
             "caption": a.caption, "overlap": chk.get("overlap"), "heygen_video_id": hg.get("video_id")})
        print(f"OK записано в историю: {job.name} · {a.style}")
    else:
        for h in history()[-a.n:]:
            print(f"{h.get('at', '')[:16]}  {h.get('style', ''):26}  код {h.get('code') or '—':10}  {h.get('source_url') or ''}  → {h.get('result')}")


if __name__ == "__main__":
    main()
