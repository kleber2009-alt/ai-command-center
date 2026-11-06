#!/usr/bin/env python3
"""«Аналитика контента»: всё, что вышло у @ilia.paliy за период, с цифрами → out/metrics.json.

Источники (что есть — то и берём, чего нет — пишем в missing, цифр не придумываем):
  Instagram  IG_ACCESS_TOKEN (+ IG_USER_ID для токена Facebook): публикации за период и их insights — просмотры, охват,
             лайки, комментарии, репосты (shares), сохранения, вовлечения; без ключа — Apify (APIFY_TOKEN, SOCIAL_IG): публичные
             просмотры, лайки и комментарии (репостов и сохранений нет).
  Threads    THREADS_ACCESS_TOKEN: посты за период и их insights — просмотры, лайки, ответы, репосты, цитаты.
  Офис       in/content-data.json (--data): что вышло через «Планер публикаций» — кодовое слово, цепочка ChatPlace, подпись.
Ключи — окружение, ~/hq-runner/keys.env или ~/.bashrc / ~/.profile.

  python3 content_metrics.py --out out/ --from 2026-11-01 --to 2026-11-07 [--data in/content-data.json]

Только stdlib.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

RC = (".zshrc", ".zprofile", ".zshenv", ".bash_profile", ".bashrc", ".profile")
MSK = dt.timezone(dt.timedelta(hours=3))
KEYS_FILE = Path(os.path.expanduser(os.environ.get("HQ_KEYS_FILE", "~/hq-runner/keys.env")))
VER = os.environ.get("HQ_IG_GRAPH_VERSION", "v23.0")


def load_keys():
    out = {}
    if KEYS_FILE.exists():
        for line in KEYS_FILE.read_text(errors="ignore").splitlines():
            m = re.match(r"\s*([A-Z0-9_]+)=(.*)$", line)
            if m:
                out[m.group(1)] = m.group(2).strip().strip("'\"")
    return out


KEYS = load_keys()


def secret(name, default=""):
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
    return default


def get(url, method="GET", body=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"} if data else {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode()).get("error", {}).get("message", "")
        except Exception:
            msg = ""
        raise RuntimeError(f"HTTP {e.code} {msg}".strip())


def num(v):
    try:
        n = float(v)
        return int(n) if n.is_integer() else n
    except (TypeError, ValueError):
        return None


def when(s):
    try:
        return dt.datetime.fromisoformat(str(s).replace("Z", "+00:00").replace("+0000", "+00:00")).astimezone(MSK)
    except ValueError:
        return None


CODE = re.compile(r"(?:пиши|напиши|пишите|напишите|комментари\w*|слово|word|comment)\s*[«\"“']?\s*([A-ZА-ЯЁ0-9+]{2,20})\b", re.I)


def code_word(caption):
    m = CODE.search(caption or "")
    if m and (m.group(1).isupper() or m.group(1).isdigit() or m.group(1) == "+"):
        return m.group(1)
    caps = re.findall(r"\b[A-ZА-ЯЁ]{3,20}\b", caption or "")
    return caps[0] if caps else ""


def hook(caption):
    for line in (caption or "").splitlines():
        line = line.strip()
        if line:
            return line[:200]
    return ""


def instagram(since, until, missing, errors):
    tok, uid = secret("IG_ACCESS_TOKEN"), secret("IG_USER_ID")
    posts = []
    if tok:
        ig = tok.startswith("IG")
        root = f"https://graph.{'instagram' if ig else 'facebook'}.com/{VER}"
        me = "me" if ig else uid
        if not ig and not uid:
            errors.append("Instagram: для токена Facebook нужен IG_USER_ID")
            return posts, ""
        url = f"{root}/{me}/media?" + urllib.parse.urlencode({"fields": "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", "limit": 50, "access_token": tok})
        while url:
            d = get(url)
            stop = False
            for m in d.get("data", []):
                t = when(m.get("timestamp"))
                if t and t.date() < since:
                    stop = True
                    break
                if t and t.date() > until:
                    continue
                kind = "reel" if m.get("media_product_type") == "REELS" else "carousel" if m.get("media_type") == "CAROUSEL_ALBUM" else "image"
                met = {"likes": num(m.get("like_count")), "comments": num(m.get("comments_count"))}
                for metrics in ("views,reach,saved,shares,total_interactions", "reach,saved,shares,total_interactions", "reach,saved"):
                    try:
                        q = urllib.parse.urlencode({"metric": metrics, "access_token": tok})
                        for x in get(f"{root}/{m['id']}/insights?{q}").get("data", []):
                            v = (x.get("values") or [{}])[0].get("value") if x.get("values") else (x.get("total_value") or {}).get("value")
                            met[x["name"]] = num(v)
                        break
                    except RuntimeError:
                        continue
                posts.append({"platform": "instagram", "id": m["id"], "url": m.get("permalink"), "at": t.isoformat() if t else m.get("timestamp"),
                              "kind": kind, "caption": m.get("caption") or "", "metrics": met})
            url = "" if stop else (d.get("paging") or {}).get("next", "")
        return posts, "Instagram Graph API"
    apify, nick = secret("APIFY_TOKEN"), secret("SOCIAL_IG", "ilia.paliy").lstrip("@")
    if not apify:
        missing.append("Instagram: нужен IG_ACCESS_TOKEN (цифры с репостами и сохранениями) или хотя бы APIFY_TOKEN (публичные цифры)")
        return posts, ""
    items = get(f"https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token={apify}&timeout=240", "POST",
                {"directUrls": [f"https://www.instagram.com/{nick}/"], "resultsType": "posts", "resultsLimit": 60}, timeout=300) or []
    for it in items:
        t = when(it.get("timestamp"))
        if not t or not (since <= t.date() <= until):
            continue
        typ = (it.get("productType") or it.get("type") or "").lower()
        kind = "reel" if typ in ("clips", "video", "reel") else "carousel" if typ in ("sidecar", "carousel") else "image"
        posts.append({"platform": "instagram", "id": it.get("id"), "url": it.get("url"), "at": t.isoformat(), "kind": kind, "caption": it.get("caption") or "",
                      "metrics": {"views": num(it.get("videoPlayCount") or it.get("videoViewCount")), "likes": num(it.get("likesCount")), "comments": num(it.get("commentsCount"))}})
    missing.append("Instagram: цифры публичные (Apify) — репостов, охвата и сохранений нет; для них нужен IG_ACCESS_TOKEN")
    return posts, "Apify (публичные данные)"


def threads(since, until, missing, errors):
    tok = secret("THREADS_ACCESS_TOKEN")
    if not tok:
        missing.append("Threads: нужен THREADS_ACCESS_TOKEN (threads_manage_insights)")
        return []
    base = "https://graph.threads.net/v1.0"
    posts = []
    d = get(f"{base}/me/threads?" + urllib.parse.urlencode({"fields": "id,text,timestamp,permalink,media_type", "limit": 50, "access_token": tok}))
    for t in d.get("data", []):
        w = when(t.get("timestamp"))
        if not w or not (since <= w.date() <= until):
            continue
        met = {}
        try:
            for x in get(f"{base}/{t['id']}/insights?" + urllib.parse.urlencode({"metric": "views,likes,replies,reposts,quotes,shares", "access_token": tok})).get("data", []):
                met[x["name"]] = num((x.get("values") or [{}])[0].get("value") if x.get("values") else (x.get("total_value") or {}).get("value"))
        except RuntimeError as e:
            errors.append(f"Threads insights {t['id']}: {e}")
        posts.append({"platform": "threads", "id": t["id"], "url": t.get("permalink"), "at": w.isoformat(), "kind": (t.get("media_type") or "").lower(), "caption": t.get("text") or "", "metrics": met})
    return posts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out")
    ap.add_argument("--from", dest="since", required=True)
    ap.add_argument("--to", dest="until", required=True)
    ap.add_argument("--data", default="in/content-data.json")
    a = ap.parse_args()
    since, until = dt.date.fromisoformat(a.since), dt.date.fromisoformat(a.until)
    office = {}
    try:
        office = json.loads(Path(a.data).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    missing, errors, posts, src = [], [], [], {}
    try:
        ig, src["instagram"] = instagram(since, until, missing, errors)
        posts += ig
    except Exception as e:
        errors.append(f"Instagram: {e}")
    try:
        posts += threads(since, until, missing, errors)
    except Exception as e:
        errors.append(f"Threads: {e}")
    # what went out through the planner: its code word and ChatPlace chain win over a guess from the caption
    planner = office.get("published_by_planner") or []
    links = {}
    for p in planner:
        for k, r in (p.get("results") or {}).items():
            if r and r.get("permalink"):
                links[r["permalink"].rstrip("/")] = p
            if r and r.get("id"):
                links[str(r["id"])] = p
    for x in posts:
        p = links.get((x.get("url") or "").rstrip("/")) or links.get(str(x.get("id")))
        x["via_planner"] = bool(p)
        x["code_word"] = (p or {}).get("code_word") or code_word(x["caption"])
        x["chain"] = (p or {}).get("chain")
        x["hook"] = hook(x["caption"])
        m = x["metrics"]
        eng = sum(v for v in (m.get("likes"), m.get("comments"), m.get("shares"), m.get("saved"), m.get("replies"), m.get("reposts")) if isinstance(v, (int, float)))
        base = m.get("reach") or m.get("views")
        x["er"] = round(eng / base * 100, 2) if base else None
    # the summaries the report is built on
    def top(key, n=5):
        have = [x for x in posts if isinstance(x["metrics"].get(key), (int, float))]
        return [{"url": x["url"], "platform": x["platform"], "kind": x["kind"], "hook": x["hook"], "code_word": x["code_word"], key: x["metrics"][key]}
                for x in sorted(have, key=lambda x: -x["metrics"][key])[:n]]
    words = {}
    for x in posts:
        w = x["code_word"]
        if not w:
            continue
        s = words.setdefault(w, {"code_word": w, "posts": 0, "views": 0, "comments": 0, "shares": 0, "saved": 0, "chain": x.get("chain")})
        s["posts"] += 1
        for k in ("views", "comments", "shares", "saved"):
            v = x["metrics"].get(k)
            if isinstance(v, (int, float)):
                s[k] += v
    kinds = {}
    for x in posts:
        s = kinds.setdefault(f'{x["platform"]}:{x["kind"]}', {"posts": 0, "views": 0, "comments": 0, "shares": 0})
        s["posts"] += 1
        for k in ("views", "comments", "shares"):
            v = x["metrics"].get(k) if k != "shares" else (x["metrics"].get("shares") or x["metrics"].get("reposts"))
            if isinstance(v, (int, float)):
                s[k] += v
    report = {"period": {"from": a.since, "to": a.until, "kind": (office.get("period") or {}).get("kind", "")}, "sources": src,
              "posts": sorted(posts, key=lambda x: x["at"] or ""), "count": len(posts), "via_planner": sum(1 for x in posts if x["via_planner"]),
              "top": {"views": top("views"), "comments": top("comments"), "shares": top("shares"), "saved": top("saved"), "reposts": top("reposts")},
              "code_words": sorted(words.values(), key=lambda s: -s["comments"]), "formats": kinds,
              "planner": planner, "chief_plans": office.get("chief_plans") or [], "missing": missing, "errors": errors}
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "metrics.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"постов {len(posts)} (через планер {report['via_planner']}) · кодовых слов {len(words)} → {out / 'metrics.json'}"
          + (f" · не подключено: {len(missing)}" if missing else "") + (f" · ошибок {len(errors)}" if errors else ""))


if __name__ == "__main__":
    main()
