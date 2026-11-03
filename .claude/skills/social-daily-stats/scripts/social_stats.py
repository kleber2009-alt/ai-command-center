#!/usr/bin/env python3
"""Статистика соцсетей за день: Instagram, Threads, YouTube, TikTok, Telegram-канал → out/stats.json.

  python3 social_stats.py --out out/ [--date 2026-11-02] [--days 7]

--date — день отчёта (по умолчанию вчера по Москве). Для каждой площадки, к которой есть доступ:
  account  — показатели аккаунта за день (охват, просмотры, вовлечения — что отдаёт API) и подписчики;
  delta    — прирост за день по снимкам (подписчики, просмотры канала), если API не отдаёт день сам;
  posts    — публикации за --days дней с метриками и приростом за день по снимку.
Площадки без доступа попадают в missing с тем, что нужно подключить. Снимки — в ~/.local/state/aicex-social/.

Доступы (окружение, ~/hq-runner/keys.env или ~/.bashrc / ~/.profile / ~/.zshrc):
  Instagram  IG_ACCESS_TOKEN (+ IG_USER_ID для токена Facebook) или META_TOKEN + IG_USER_ID; без них — Apify (APIFY_TOKEN) по SOCIAL_IG
  Threads    THREADS_ACCESS_TOKEN
  YouTube    YOUTUBE_API_KEY + SOCIAL_YT (id канала UC… или @handle)
  TikTok     APIFY_TOKEN + SOCIAL_TIKTOK (ник)
  Telegram   SOCIAL_TG_CHANNEL (@канал) + SOCIAL_TG_BOT_TOKEN (любой бот; для закрытого канала — админ)
Только стандартная библиотека.
"""
import argparse
import datetime as dt
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RC = (".zshrc", ".zprofile", ".zshenv", ".bash_profile", ".bashrc", ".profile")
MSK = dt.timezone(dt.timedelta(hours=3))
STATE = Path(os.path.expanduser(os.environ.get("SOCIAL_STATE", "~/.local/state/aicex-social")))
KEYS_FILE = Path(os.path.expanduser(os.environ.get("HQ_KEYS_FILE", "~/hq-runner/keys.env")))


def load_keys_file():
    if not KEYS_FILE.exists():
        return {}
    out = {}
    for line in KEYS_FILE.read_text(errors="ignore").splitlines():
        m = re.match(r"\s*([A-Z0-9_]+)=(.*)$", line)
        if m:
            out[m.group(1)] = m.group(2).strip().strip("'\"")
    return out


KEYS = load_keys_file()


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
        if last[:1] in ("'", '"'):
            end = last.find(last[0], 1)
            last = last[1:end] if end > 0 else last[1:]
        else:
            last = re.split(r"[\s;#]", last, maxsplit=1)[0]
        if last and not last.startswith(("$", "`")):
            return last
    return default


def _ctx():
    for f in (os.environ.get("SSL_CERT_FILE"), os.environ.get("REQUESTS_CA_BUNDLE"), "/etc/ssl/cert.pem"):
        if f and os.path.exists(f):
            return ssl.create_default_context(cafile=f)
    return ssl.create_default_context()


def get(url, method="GET", body=None, headers=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    h = {"User-Agent": "aicex-hq-socialstats", **({"content-type": "application/json"} if data else {}), **(headers or {})}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=h), timeout=timeout, context=_ctx()) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read()[:240].decode('utf-8', 'replace')}") from None


def num(v):
    try:
        return int(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return None


def ts(v):
    """ISO / unix → datetime по Москве."""
    if v is None or v == "":
        return None
    try:
        if isinstance(v, (int, float)) or str(v).isdigit():
            return dt.datetime.fromtimestamp(int(v), MSK)
        return dt.datetime.fromisoformat(str(v).replace("Z", "+00:00").replace("+0000", "+00:00")).astimezone(MSK)
    except ValueError:
        return None


def post(platform, url, text, published, metrics, kind=""):
    p = ts(published)
    return {"platform": platform, "url": url or "", "text": re.sub(r"\s+", " ", text or "")[:220], "kind": kind,
            "published": p.isoformat() if p else "", "metrics": {k: v for k, v in metrics.items() if v is not None}}


# ---------- площадки ----------

def instagram(day, since):
    tok = secret("IG_ACCESS_TOKEN") or (secret("META_TOKEN") if secret("IG_USER_ID") else "")
    handle = secret("SOCIAL_IG", "ilia.paliy").lstrip("@")
    if tok:
        ig = tok.startswith("IG")
        base = f"https://graph.{'instagram' if ig else 'facebook'}.com/v23.0"
        uid = "me" if ig else secret("IG_USER_ID")
        if not uid:
            raise RuntimeError("для токена Facebook нужен IG_USER_ID")
        q = lambda path, **p: get(f"{base}/{path}?" + urllib.parse.urlencode({**p, "access_token": tok}))
        prof = q(uid, fields="username,followers_count,media_count")
        lo, hi = dt.datetime.combine(day, dt.time(), MSK), dt.datetime.combine(day + dt.timedelta(days=1), dt.time(), MSK)
        account = {"followers": num(prof.get("followers_count")), "username": prof.get("username")}
        for group in ("reach,views,accounts_engaged,total_interactions", "likes,comments,shares,saves,replies", "profile_views,website_clicks,follows_and_unfollows"):
            try:
                d = q(f"{uid}/insights", metric=group, period="day", metric_type="total_value", since=int(lo.timestamp()), until=int(hi.timestamp()))
                for m in d.get("data", []):
                    tv = m.get("total_value") or {}
                    if m["name"] == "follows_and_unfollows":
                        for b in (tv.get("breakdowns") or [{}])[0].get("results", []):
                            account["follows" if "FOLLOWER" in str(b.get("dimension_values")) else "unfollows"] = num(b.get("value"))
                    else:
                        account[m["name"]] = num(tv.get("value"))
            except RuntimeError as e:
                account.setdefault("_errors", []).append(f"{group}: {str(e)[:120]}")
        posts = []
        media = q(f"{uid}/media", fields="id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", limit=30).get("data", [])
        for m in media:
            if (ts(m.get("timestamp")) or lo) < since:
                continue
            met = {"likes": num(m.get("like_count")), "comments": num(m.get("comments_count"))}
            for metrics in ("views,reach,saved,shares,total_interactions", "reach,saved,shares,total_interactions"):
                try:
                    for x in q(f"{m['id']}/insights", metric=metrics).get("data", []):
                        met[x["name"]] = num((x.get("values") or [{}])[0].get("value") if x.get("values") else (x.get("total_value") or {}).get("value"))
                    break
                except RuntimeError:
                    continue
            posts.append(post("instagram", m.get("permalink"), m.get("caption"), m.get("timestamp"), met, m.get("media_product_type") or m.get("media_type")))
        return {"source": "Instagram Graph API", "account": account, "posts": posts}
    apify = secret("APIFY_TOKEN")
    if not apify:
        raise LookupError("IG_ACCESS_TOKEN (Instagram Graph API — охват и просмотры аккаунта) или хотя бы APIFY_TOKEN (публичные цифры публикаций)")
    run = lambda body: get(f"https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token={apify}&timeout=240", "POST", body, timeout=300)
    url = f"https://www.instagram.com/{handle}/"
    prof = (run({"directUrls": [url], "resultsType": "details", "resultsLimit": 1}) or [{}])[0]
    items = run({"directUrls": [url], "resultsType": "posts", "resultsLimit": 25}) or []
    posts = [post("instagram", it.get("url"), it.get("caption"), it.get("timestamp"),
                  {"views": num(it.get("videoPlayCount") or it.get("videoViewCount")), "likes": num(it.get("likesCount")), "comments": num(it.get("commentsCount"))},
                  it.get("productType") or it.get("type")) for it in items if (ts(it.get("timestamp")) or since) >= since]
    return {"source": "Apify (публичные данные: охвата и сохранений нет)", "account": {"followers": num(prof.get("followersCount")), "username": handle}, "posts": posts}


def threads(day, since):
    tok = secret("THREADS_ACCESS_TOKEN")
    if not tok:
        raise LookupError("THREADS_ACCESS_TOKEN (Threads API, разрешение threads_manage_insights)")
    base = "https://graph.threads.net/v1.0"
    q = lambda path, **p: get(f"{base}/{path}?" + urllib.parse.urlencode({**p, "access_token": tok}))
    lo = dt.datetime.combine(day, dt.time(), MSK)
    hi = lo + dt.timedelta(days=1)
    account = {}
    d = q("me/threads_insights", metric="views,likes,replies,reposts,quotes,followers_count", since=int(lo.timestamp()), until=int(hi.timestamp()))
    for m in d.get("data", []):
        account["followers" if m["name"] == "followers_count" else m["name"]] = num((m.get("total_value") or {}).get("value")
                                                                                  if m.get("total_value") else sum(num(v.get("value")) or 0 for v in m.get("values", [])))
    posts = []
    for t in q("me/threads", fields="id,text,timestamp,permalink", limit=25).get("data", []):
        if (ts(t.get("timestamp")) or lo) < since:
            continue
        met = {}
        try:
            for x in q(f"{t['id']}/insights", metric="views,likes,replies,reposts,quotes").get("data", []):
                met[x["name"]] = num((x.get("values") or [{}])[0].get("value"))
        except RuntimeError:
            pass
        posts.append(post("threads", t.get("permalink"), t.get("text"), t.get("timestamp"), met, "thread"))
    return {"source": "Threads API", "account": account, "posts": posts}


def youtube(day, since):
    key, ch = secret("YOUTUBE_API_KEY"), secret("SOCIAL_YT")
    if not key or not ch:
        raise LookupError("YOUTUBE_API_KEY и SOCIAL_YT (id канала UC… или @handle)")
    q = lambda path, **p: get("https://www.googleapis.com/youtube/v3/" + path + "?" + urllib.parse.urlencode({**p, "key": key}))
    sel = {"id": ch} if ch.startswith("UC") else {"forHandle": ch if ch.startswith("@") else "@" + ch}
    items = q("channels", part="statistics,contentDetails,snippet", **sel).get("items") or []
    if not items:
        raise RuntimeError(f"канал {ch} не найден")
    c = items[0]
    st = c.get("statistics", {})
    account = {"followers": num(st.get("subscriberCount")), "views_total": num(st.get("viewCount")), "videos": num(st.get("videoCount")), "title": c["snippet"].get("title")}
    up = c["contentDetails"]["relatedPlaylists"]["uploads"]
    ids = [x["contentDetails"]["videoId"] for x in q("playlistItems", part="contentDetails", playlistId=up, maxResults=15).get("items", [])]
    posts = []
    if ids:
        for v in q("videos", part="statistics,snippet", id=",".join(ids)).get("items", []):
            s = v.get("statistics", {})
            posts.append(post("youtube", f"https://youtu.be/{v['id']}", v["snippet"].get("title"), v["snippet"].get("publishedAt"),
                              {"views": num(s.get("viewCount")), "likes": num(s.get("likeCount")), "comments": num(s.get("commentCount"))}, "video"))
    return {"source": "YouTube Data API (цифры — накопленные, за день — по снимку)", "account": account, "posts": posts, "cumulative": True}


def tiktok(day, since):
    name, apify = secret("SOCIAL_TIKTOK").lstrip("@"), secret("APIFY_TOKEN")
    if not name or not apify:
        raise LookupError("SOCIAL_TIKTOK (ник) и APIFY_TOKEN")
    items = get(f"https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token={apify}&timeout=240", "POST",
                {"profiles": [name], "resultsPerPage": 15, "shouldDownloadVideos": False, "shouldDownloadCovers": False}, timeout=300) or []
    fans = next((num((it.get("authorMeta") or {}).get("fans")) for it in items if it.get("authorMeta")), None)
    posts = [post("tiktok", it.get("webVideoUrl"), it.get("text"), it.get("createTimeISO") or it.get("createTime"),
                  {"views": num(it.get("playCount")), "likes": num(it.get("diggCount")), "comments": num(it.get("commentCount")),
                   "shares": num(it.get("shareCount")), "saves": num(it.get("collectCount"))}, "video") for it in items]
    return {"source": "Apify (цифры — накопленные, за день — по снимку)", "account": {"followers": fans, "username": name}, "posts": posts, "cumulative": True}


def telegram(day, since):
    ch, tok = secret("SOCIAL_TG_CHANNEL"), secret("SOCIAL_TG_BOT_TOKEN")
    if not ch or not tok:
        raise LookupError("SOCIAL_TG_CHANNEL (@канал) и SOCIAL_TG_BOT_TOKEN (бот; для закрытого канала — админ канала)")
    chat = ch if ch.startswith(("@", "-")) else "@" + ch
    n = get(f"https://api.telegram.org/bot{tok}/getChatMemberCount?chat_id={urllib.parse.quote(chat)}").get("result")
    return {"source": "Telegram Bot API (просмотры постов Bot API не отдаёт)", "account": {"followers": num(n), "channel": chat}, "posts": []}


PLATFORMS = {"instagram": instagram, "threads": threads, "youtube": youtube, "tiktok": tiktok, "telegram": telegram}


# ---------- снимки и приросты ----------

def deltas(name, res, day):
    """Прирост за день: подписчики и, для накопленных цифр, просмотры каждой публикации — по прошлому снимку."""
    STATE.mkdir(parents=True, exist_ok=True)
    snap = {"account": {k: v for k, v in res["account"].items() if isinstance(v, int)},
            "posts": {p["url"]: p["metrics"] for p in res["posts"] if p["url"]}}
    prev, prev_day = None, None
    for back in range(1, 8):
        f = STATE / f"{name}-{(day - dt.timedelta(days=back)).isoformat()}.json"
        if f.exists():
            prev, prev_day = json.loads(f.read_text()), (day - dt.timedelta(days=back)).isoformat()
            break
    (STATE / f"{name}-{day.isoformat()}.json").write_text(json.dumps(snap))
    if not prev:
        res["delta_note"] = "первый снимок — приросты появятся со следующего отчёта"
        return
    res["delta_since"] = prev_day
    res["delta"] = {k: v - prev["account"][k] for k, v in snap["account"].items() if k in prev["account"]}
    for p in res["posts"]:
        old = prev["posts"].get(p["url"])
        if old:
            p["delta"] = {k: v - old[k] for k, v in p["metrics"].items() if isinstance(v, int) and isinstance(old.get(k), int)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--date", help="день отчёта YYYY-MM-DD (по умолчанию вчера по Москве)")
    ap.add_argument("--days", type=int, default=7, help="публикации за сколько дней брать")
    ap.add_argument("--only", help="площадки через запятую")
    a = ap.parse_args()
    day = dt.date.fromisoformat(a.date) if a.date else (dt.datetime.now(MSK) - dt.timedelta(days=1)).date()
    since = dt.datetime.combine(day - dt.timedelta(days=a.days - 1), dt.time(), MSK)
    out = Path(a.out).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    report = {"date": day.isoformat(), "generated": dt.datetime.now(MSK).isoformat(timespec="minutes"), "platforms": {}, "missing": [], "errors": []}
    for name, fn in PLATFORMS.items():
        if a.only and name not in a.only.split(","):
            continue
        print(f"STEP Собирает {name}", flush=True)
        try:
            res = fn(day, since)
            res["posts"].sort(key=lambda p: p["published"], reverse=True)
            for p in res["posts"]:
                p["yesterday"] = p["published"][:10] == day.isoformat()
            deltas(name, res, day)
            report["platforms"][name] = res
        except LookupError as e:
            report["missing"].append({"platform": name, "need": str(e)})
        except Exception as e:  # noqa: BLE001 — одна площадка не валит отчёт
            report["errors"].append({"platform": name, "error": str(e)[:300]})
    (out / "stats.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({"ok": bool(report["platforms"]), "date": report["date"], "platforms": list(report["platforms"]),
                      "missing": [m["platform"] for m in report["missing"]], "errors": report["errors"], "file": str(out / "stats.json")}, ensure_ascii=False))
    sys.exit(0 if report["platforms"] else 1)


if __name__ == "__main__":
    main()
