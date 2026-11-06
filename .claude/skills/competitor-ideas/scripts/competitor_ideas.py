#!/usr/bin/env python3
"""«Идеи у конкурентов»: свежие публикации конкурентов Ильи → только залёты → out/hits.json.

Залёт — это одновременно (пороги Ильи, как у «Плана дня» @instaoo_bot):
  просмотры ≥ 100 000 · комментарии ≥ 1 000 · репосты ≥ 1 000
  (--min-views / --min-comments / --min-shares или COMP_MIN_VIEWS / COMP_MIN_COMMENTS / COMP_MIN_SHARES)

Чего не видно в открытых данных — помечаем, не придумываем:
  • у каруселей Instagram не показывает просмотры — для каруселей порог просмотров не применяется;
  • репосты публичный парсер отдаёт не всегда: неизвестные репосты → `shares_unknown: true`, такой ролик проходит по
    остальным порогам, но ранжируется ниже проверенных (--shares-unknown fail — выкинуть такие совсем).

Список конкурентов — общий скилл competitors (competitors.json: 60 аккаунтов, таблица Ильи от 06.11.2026; рядом с этим
скиллом или в ~/.claude/skills/competitors), --list — другой файл, --accounts @a,@b — свои ники.
Данные — Apify (apify~instagram-scraper, APIFY_TOKEN из окружения, ~/hq-runner/keys.env или ~/.bashrc / ~/.profile).
Без ключа (или с --offline) — только разбор самой таблицы: кто залетает сильнее своего размера, у кого стабильно.

  python3 competitor_ideas.py --out out/ [--days 30] [--per-account 12] [--market RU|EN] [--group "GPT"] [--top 30]

Только stdlib.
"""
import argparse
import datetime as dt
import json
import math
import os
import re
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
LISTS = [HERE.parent.parent / "competitors" / "competitors.json", Path.home() / ".claude/skills/competitors/competitors.json"]
GROUPS = {"reels-ai": "Reels + ИИ + набор аудитории", "gpt-claude-marketing": "GPT, Claude, маркетинг"}
RC = (".zshrc", ".zprofile", ".zshenv", ".bash_profile", ".bashrc", ".profile")
KEYS_FILE = Path(os.path.expanduser(os.environ.get("HQ_KEYS_FILE", "~/hq-runner/keys.env")))


def load_keys_file():
    out = {}
    if KEYS_FILE.exists():
        for line in KEYS_FILE.read_text(errors="ignore").splitlines():
            m = re.match(r"\s*([A-Z0-9_]+)=(.*)$", line)
            if m:
                out[m.group(1)] = m.group(2).strip().strip("'\"")
    return out


KEYS = load_keys_file()


def secret(name):
    v = (os.environ.get(name) or KEYS.get(name) or "").strip().strip("'\"")
    if v:
        return v
    for rc in RC:
        p = Path.home() / rc
        if not p.exists():
            continue
        last = ""
        for line in p.read_text(errors="ignore").splitlines():
            m = re.match(rf"\s*(?:export\s+)?{name}=(.*)", line)
            if m:
                last = m.group(1).strip()
        last = last.strip("'\"").split()[0] if last else ""
        if last and not last.startswith(("$", "`")):
            return last
    return ""


def num(v):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) and n >= 0 else None


def first(*vals):
    for v in vals:
        n = num(v)
        if n is not None:
            return n
    return None


def load_list(path=None):
    """Общий список конкурентов (скилл competitors) → строки с полями, которые ждёт разбор."""
    for p in ([Path(path)] if path else LISTS):
        if p.exists():
            data = json.loads(p.read_text(encoding="utf-8"))
            break
    else:
        raise SystemExit("нет competitors.json — нужен скилл competitors рядом (или --list путь)")
    rows = []
    for a in data.get("accounts", []):
        reels = (list(a.get("reels") or []) + [None] * 4)[:4]
        rows.append({"handle": str(a.get("nick", "")).lstrip("@"), "group": GROUPS.get(a.get("group"), a.get("group") or ""),
                     "market": a.get("market") or "", "followers": num(a.get("followers")), "theme": a.get("topic") or "",
                     "top1": num(reels[0]), "top2": num(reels[1]), "top3": num(reels[2]), "top4": num(reels[3]),
                     "best_to_followers": num(a.get("best_x_followers")), "funnel": a.get("funnel") or "", "note": a.get("note") or ""})
    return [r for r in rows if r["handle"]]


def apify_posts(token, handles, per_account, timeout=300):
    url = f"https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token={token}&timeout={timeout - 30}"
    body = {"directUrls": [f"https://www.instagram.com/{h}/" for h in handles], "resultsType": "posts", "resultsLimit": per_account,
            "addParentData": False}
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode() or "[]")


def normalize(p):
    kind = (p.get("productType") or p.get("type") or "").lower()
    carousel = kind in ("sidecar", "carousel_container", "carousel") or bool(p.get("childPosts"))
    reel = not carousel and (kind in ("clips", "video", "reel") or p.get("videoPlayCount") is not None)
    ts = p.get("timestamp") or ""
    return {
        "author": (p.get("ownerUsername") or "").lower(),
        "url": p.get("url") or (f"https://www.instagram.com/p/{p['shortCode']}/" if p.get("shortCode") else ""),
        "kind": "carousel" if carousel else "reel" if reel else "post",
        "date": ts,
        "caption": (p.get("caption") or "").strip(),
        "views": None if carousel else first(p.get("videoPlayCount"), p.get("igPlayCount"), p.get("videoViewCount")),
        "comments": first(p.get("commentsCount")),
        "likes": first(p.get("likesCount")),
        "shares": first(p.get("reshareCount"), p.get("resharesCount"), p.get("sharesCount"), p.get("shareCount")),
        "duration": first(p.get("videoDuration")),
        "music": ((p.get("musicInfo") or {}).get("song_name") or ""),
    }


def judge(x, L):
    """Залёт или нет: все известные метрики ≥ порогов; просмотры у каруселей не нужны; репосты могут быть не видны."""
    need = [("comments", L["comments"])] + ([] if x["kind"] == "carousel" else [("views", L["views"])])
    low = [k for k, lim in need if x[k] is None or x[k] < lim]
    if x["shares"] is None:
        x["shares_unknown"] = True
        if L["shares_unknown"] == "fail":
            low.append("shares")
    elif x["shares"] < L["shares"]:
        low.append("shares")
    x["below"] = low
    ok = not low
    if ok:
        ratios = [x[k] / lim for k, lim in need] + ([x["shares"] / L["shares"]] if x["shares"] is not None else [])
        s = math.exp(sum(math.log(max(r, 1e-9)) for r in ratios) / len(ratios))
        x["strength"] = round(s * (0.8 if x.get("shares_unknown") else 1), 2)
    return ok


def table_insights(rows):
    """Без API: что видно по самой таблице — кто перекрывает свою аудиторию и у кого стабильно."""
    out = []
    for r in rows:
        tops = [v for v in (r["top1"], r["top2"], r["top3"], r["top4"]) if v]
        hits = sum(1 for v in tops if v >= 100_000)
        out.append({"handle": r["handle"], "market": r["market"], "group": r["group"], "followers": r["followers"], "theme": r["theme"],
                    "best": max(tops) if tops else None, "best_to_followers": r["best_to_followers"], "hits_of_top4": hits,
                    "stable": hits >= 3, "funnel": r["funnel"], "note": r["note"]})
    out.sort(key=lambda x: (-(x["hits_of_top4"]), -(x["best_to_followers"] or 0)))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out")
    ap.add_argument("--days", type=int, default=int(os.environ.get("COMP_DAYS", "30")), help="брать публикации не старше N дней")
    ap.add_argument("--per-account", type=int, default=12)
    ap.add_argument("--accounts", default="", help="@a,@b — вместо списка")
    ap.add_argument("--list", default="", help="другой competitors.json")
    ap.add_argument("--market", default="", help="RU или EN")
    ap.add_argument("--group", default="", help="часть названия листа таблицы")
    ap.add_argument("--top", type=int, default=30)
    ap.add_argument("--min-views", type=float, default=float(os.environ.get("COMP_MIN_VIEWS", "100000")))
    ap.add_argument("--min-comments", type=float, default=float(os.environ.get("COMP_MIN_COMMENTS", "1000")))
    ap.add_argument("--min-shares", type=float, default=float(os.environ.get("COMP_MIN_SHARES", "1000")))
    ap.add_argument("--shares-unknown", choices=("pass", "fail"), default=os.environ.get("COMP_SHARES_UNKNOWN", "pass"))
    ap.add_argument("--batch", type=int, default=8, help="аккаунтов в одном запуске Apify")
    ap.add_argument("--offline", action="store_true", help="без Apify — только разбор таблицы")
    a = ap.parse_args()

    rows = load_list(a.list or None)
    if a.accounts:
        want = [h.strip().lstrip("@").lower() for h in re.split(r"[\s,]+", a.accounts) if h.strip()]
        known = {r["handle"].lower(): r for r in rows}
        rows = [known.get(h) or {"handle": h, "market": "", "group": "свои", "followers": None, "theme": "", "top1": None, "top2": None,
                                 "top3": None, "top4": None, "best_to_followers": None, "funnel": "", "note": ""} for h in want]
    if a.market:
        rows = [r for r in rows if r["market"].upper() == a.market.upper()]
    if a.group:
        rows = [r for r in rows if a.group.lower() in r["group"].lower()]

    L = {"views": a.min_views, "comments": a.min_comments, "shares": a.min_shares, "shares_unknown": a.shares_unknown}
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    report = {"generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "limits": L, "days": a.days,
              "accounts": len(rows), "competitors": table_insights(rows), "hits": [], "errors": [], "scanned": 0, "source": ""}

    token = "" if a.offline else secret("APIFY_TOKEN")
    if not token:
        report["source"] = "только таблица (нет APIFY_TOKEN или --offline): свежих залётов нет, разбор по топ-4 роликам из таблицы"
    else:
        report["source"] = "Apify apify~instagram-scraper (публичные данные: охвата и сохранений нет, репосты — если отдаёт)"
        since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=a.days)
        meta = {r["handle"].lower(): r for r in rows}
        handles = [r["handle"] for r in rows]
        posts = []
        for i in range(0, len(handles), a.batch):
            part = handles[i:i + a.batch]
            try:
                items = apify_posts(token, part, a.per_account)
            except Exception as e:  # one failed batch must not stop the rest
                report["errors"].append({"accounts": part, "error": str(e)[:300]})
                continue
            for it in items:
                if it.get("error"):
                    report["errors"].append({"accounts": [it.get("url") or it.get("inputUrl")], "error": str(it.get("error"))[:200]})
                    continue
                x = normalize(it)
                try:
                    when = dt.datetime.fromisoformat(x["date"].replace("Z", "+00:00"))
                except ValueError:
                    when = None
                if when and when < since:
                    continue
                posts.append(x)
            print(f"[{min(i + a.batch, len(handles))}/{len(handles)}] публикаций: {len(posts)}", file=sys.stderr)
        report["scanned"] = len(posts)
        hits = []
        for x in posts:
            if judge(x, L):
                r = meta.get(x["author"]) or {}
                x["followers"] = r.get("followers")
                x["over_followers"] = round(x["views"] / r["followers"], 1) if x.get("views") and r.get("followers") else None
                x["market"], x["theme"] = r.get("market", ""), r.get("theme", "")
                hits.append(x)
        hits.sort(key=lambda x: -x["strength"])
        report["hits"] = hits[:a.top]
        report["hits_total"] = len(hits)
        report["shares_unknown_hits"] = sum(1 for x in hits if x.get("shares_unknown"))

    (out / "hits.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"аккаунтов {len(rows)} · публикаций {report['scanned']} · залётов {report.get('hits_total', 0)} → {out / 'hits.json'}"
          + (f" · ошибок {len(report['errors'])}" if report["errors"] else ""))


if __name__ == "__main__":
    main()
