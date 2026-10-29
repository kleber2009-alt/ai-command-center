#!/usr/bin/env python3
"""Шаг 1. Выгрузить свои рилсы с метриками в один формат → REMAKE_WORK/_scan/reels.json

  python3 fetch_reels.py --windsor rows.json        строки, сохранённые из Windsor MCP (get_data, коннектор instagram)
  python3 fetch_reels.py --source graph             Instagram Graph API: IG_ACCESS_TOKEN (+ IG_USER_ID, иначе из config.json)
  python3 fetch_reels.py --source apify             публичный скрейп apify~instagram-scraper: APIFY_TOKEN (без репостов и шеров)
  python3 fetch_reels.py --links <url> [<url> ...]  конкретные рилсы (метрики подтянет Apify, если есть токен)
  python3 fetch_reels.py --chatplace posts.json [--automations autos.json] [--enrich 40]
                                                    запасной путь без Windsor: рилсы и подписи из ChatPlace MCP
                                                    (automations_triggers_list_instagram_media), «лиды» — сколько людей
                                                    написали кодовое слово (automations_list_with_stats), лайки и
                                                    комментарии последних --enrich рилсов — через yt-dlp
  python3 fetch_reels.py                            auto: graph, если есть токен, иначе apify; иначе — подсказка
  --days N  окно (по умолчанию scan.days из config.json)

Запись: id, shortcode, url, date, caption, views, comments, likes, shares, reposts, saves, leads, avg_watch_ms, duration,
video_url (прямая ссылка CDN, живёт несколько часов), thumb_url, source. Неизвестная метрика = null.
"""
import argparse, datetime, json, os, re, shutil, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # и под python3 -I
from common import SCAN, HTTPError, code_word, config, http_json, secret, write_json

WINDSOR_BLOCK = "not your real numbers"


def shortcode(url: str):
    m = re.search(r"instagram\.com/(?:[\w.]+/)?(?:reels?|p|tv)/([A-Za-z0-9_-]+)", url or "")
    return m.group(1) if m else None


def num(v):
    try:
        return None if v in (None, "") else float(v)
    except (TypeError, ValueError):
        return None


def rec(**kw) -> dict:
    keys = ("id", "shortcode", "url", "date", "caption", "views", "comments", "likes", "shares", "reposts", "saves", "leads",
            "restricted", "avg_watch_ms", "duration", "video_url", "thumb_url", "source")
    r = {k: (kw.get(k) if kw.get(k) != "" or k == "caption" else None) for k in keys}
    r["shortcode"] = r["shortcode"] or shortcode(r["url"])
    r["id"] = str(r["id"] or r["shortcode"] or r["url"])
    return r


# ---------- Windsor (строки из MCP) ----------
def from_windsor(path: str) -> list:
    raw = json.load(open(path))
    rows = raw.get("data", raw.get("result", [])) if isinstance(raw, dict) else raw
    if any(WINDSOR_BLOCK in str(r.get("media_caption") or r.get("media_id") or "") for r in rows[:3]):
        sys.exit("Windsor отдал заглушку вместо цифр: на бесплатном плане подключено больше одного аккаунта. "
                 "Отключи лишний (instagram_public) на https://onboard.windsor.ai/app/ и повтори через минуту.")
    out = {}
    for r in rows:
        if str(r.get("media_product_type", "")).upper() not in ("REELS", "CLIPS") and str(r.get("media_type", "")).upper() != "VIDEO":
            continue
        k = str(r.get("media_id") or r.get("media_permalink"))
        cur = out.get(k)
        item = rec(id=r.get("media_id"), shortcode=r.get("media_shortcode"), url=r.get("media_permalink"),
                   date=r.get("timestamp") or r.get("date"), caption=r.get("media_caption") or "",
                   views=num(r.get("media_views")), comments=num(r.get("media_total_comments_count") or r.get("media_comments_count")),
                   likes=num(r.get("media_total_like_count") or r.get("media_like_count")), shares=num(r.get("media_shares")),
                   reposts=num(r.get("media_reposts")), saves=num(r.get("media_saved")),
                   avg_watch_ms=num(r.get("media_reel_avg_watch_time")), video_url=r.get("media_url"),
                   thumb_url=r.get("media_thumbnail_url"), source="windsor")
        if cur:  # строки по дням — складываем числа
            for f in ("views", "comments", "likes", "shares", "reposts", "saves"):
                if item[f] is not None:
                    cur[f] = (cur[f] or 0) + item[f] if f in ("views", "shares", "reposts", "saves") else max(cur[f] or 0, item[f])
        else:
            out[k] = item
    return list(out.values())


# ---------- Instagram Graph API ----------
def from_graph(days: int, limit: int) -> list:
    cfg = config()["instagram"]
    tok = secret("IG_ACCESS_TOKEN") or secret("META_TOKEN")
    if not tok:
        sys.exit("нет IG_ACCESS_TOKEN (или META_TOKEN с instagram_basic + instagram_manage_insights)")
    ig = tok.startswith("IG")
    base = f"https://graph.{'instagram' if ig else 'facebook'}.com/{cfg.get('graph_version', 'v23.0')}"
    uid = "me" if ig else (secret("IG_USER_ID") or cfg["user_id"])
    since = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)
    fields = "id,caption,media_type,media_product_type,permalink,shortcode,media_url,thumbnail_url,timestamp,comments_count,like_count"
    url = f"{base}/{uid}/media?" + urlencode({"fields": fields, "limit": 50, "access_token": tok})
    items, seen = [], 0
    while url and seen < limit:
        page = http_json(url, timeout=60)
        stop = False
        for m in page.get("data", []):
            seen += 1
            ts = datetime.datetime.fromisoformat(m["timestamp"].replace("+0000", "+00:00"))
            if ts < since:
                stop = True
                break
            if m.get("media_product_type") != "REELS" and m.get("media_type") != "VIDEO":
                continue
            ins = graph_insights(base, m["id"], tok)
            items.append(rec(id=m["id"], shortcode=m.get("shortcode"), url=m.get("permalink"), date=m["timestamp"],
                             caption=m.get("caption") or "", views=ins.get("views"), comments=ins.get("comments", m.get("comments_count")),
                             likes=ins.get("likes", m.get("like_count")), shares=ins.get("shares"), reposts=ins.get("reposts"),
                             saves=ins.get("saved"), avg_watch_ms=ins.get("ig_reels_avg_watch_time"), video_url=m.get("media_url"),
                             thumb_url=m.get("thumbnail_url"), source="graph"))
        url = None if stop else page.get("paging", {}).get("next")
    return items


def _insights(base: str, mid: str, tok: str, metrics: str) -> dict:
    """Один запрос метрик. Неизвестная API метрика роняет весь запрос (400) — тогда {}."""
    try:
        d = http_json(f"{base}/{mid}/insights?" + urlencode({"metric": metrics, "access_token": tok}), timeout=30)
    except HTTPError:
        return {}
    out = {}
    for row in d.get("data", []):
        v = (row.get("values") or [{}])[0].get("value", row.get("total_value", {}).get("value"))
        out[row["name"]] = num(v)
    return out


def graph_insights(base: str, mid: str, tok: str) -> dict:
    out = (_insights(base, mid, tok, "views,reach,saved,shares,comments,likes,total_interactions,ig_reels_avg_watch_time")
           or _insights(base, mid, tok, "views,saved,shares,comments"))
    out.update(_insights(base, mid, tok, "reposts"))  # метрика новая — отдельным запросом, чтобы не ронять основной
    return out


# ---------- Apify ----------
def apify(body: dict, timeout: int = 300) -> list:
    tok = secret("APIFY_TOKEN")
    if not tok:
        sys.exit("нет APIFY_TOKEN")
    actor = secret("APIFY_INSTAGRAM_ACTOR") or "apify~instagram-scraper"
    url = f"https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items?" + urlencode({"token": tok, "timeout": timeout})
    items = http_json(url, method="POST", data=body, timeout=timeout + 30)
    return items if isinstance(items, list) else []


def apify_rec(p: dict) -> dict:
    return rec(id=p.get("id") or p.get("shortCode"), shortcode=p.get("shortCode"), url=p.get("url"), date=p.get("timestamp"),
               caption=p.get("caption") or "", views=num(p.get("videoPlayCount") or p.get("videoViewCount")),
               comments=num(p.get("commentsCount")), likes=num(p.get("likesCount")), duration=num(p.get("videoDuration")),
               video_url=p.get("videoUrl"), thumb_url=p.get("displayUrl"), source="apify")


def from_apify(days: int, limit: int) -> list:
    user = config()["instagram"]["username"]
    items = apify({"directUrls": [f"https://www.instagram.com/{user}/"], "resultsType": "posts",
                   "resultsLimit": limit, "onlyPostsNewerThan": f"{days} days"})
    return [apify_rec(p) for p in items if p.get("type") == "Video" or p.get("productType") == "clips" or p.get("videoUrl")]


def from_links(links: list) -> list:
    if secret("APIFY_TOKEN"):
        try:
            got = {shortcode(p.get("url")) or p.get("shortCode"): apify_rec(p)
                   for p in apify({"directUrls": links, "resultsType": "details", "resultsLimit": len(links)})}
            return [got.get(shortcode(u)) or rec(url=u, source="link") for u in links]
        except (HTTPError, OSError) as e:
            print(f"WARN Apify не ответил ({e}) — беру ссылки без метрик")
    return [rec(url=u, source="link") for u in links]


# ---------- ChatPlace + yt-dlp (без Windsor и токенов) ----------
def norm_word(w: str) -> str:
    return (w or "").strip().upper().replace("Ё", "Е")


def ytdlp_meta(url: str) -> dict:
    """Публичные метрики рилса через yt-dlp: лайки, комментарии, длительность (просмотры Instagram ему обычно не отдаёт)."""
    if not shutil.which("yt-dlp"):
        return {}
    try:
        x = subprocess.run(["yt-dlp", "-q", "--no-warnings", "--skip-download", "--dump-json", url],
                           capture_output=True, text=True, timeout=90)
        if "isn't available to everyone" in (x.stderr or "") or "login" in (x.stderr or "").lower():
            return {"restricted": True}  # возрастное/гео-ограничение: без входа не скачать — не кандидат
        d = json.loads((x.stdout or "{}").splitlines()[0] or "{}")
    except (subprocess.TimeoutExpired, ValueError, IndexError):
        return {}
    return {"likes": num(d.get("like_count")), "comments": num(d.get("comment_count")), "views": num(d.get("view_count")),
            "duration": num(d.get("duration"))}


def from_chatplace(posts_path: str, autos_path: str, days: int, limit: int, enrich: int) -> list:
    raw = json.load(open(posts_path))
    posts = raw if isinstance(raw, list) else raw.get("data", raw.get("items", []))
    leads = {}
    if autos_path:
        autos = json.load(open(autos_path))
        for a in autos if isinstance(autos, list) else autos.get("data", []):
            for w in a.get("startMessages") or []:
                leads[norm_word(w)] = leads.get(norm_word(w), 0) + int(a.get("totalClients") or 0)
    since = datetime.datetime.now().timestamp() - days * 86400
    items = []
    for p in posts:
        if "/reel/" not in (p.get("permalink") or "") or (p.get("timestamp") or 0) < since:
            continue
        code = code_word(p.get("caption") or "")
        items.append(rec(id=p.get("mediaId"), url=p["permalink"], caption=p.get("caption") or "",
                         date=datetime.datetime.fromtimestamp(p["timestamp"], datetime.timezone.utc).isoformat(),
                         leads=float(leads[norm_word(code)]) if code and norm_word(code) in leads else None,
                         thumb_url=p.get("mediaUrl"), source="chatplace"))
        if len(items) >= limit:
            break
    items.sort(key=lambda r: r["date"], reverse=True)
    if enrich and shutil.which("yt-dlp"):
        with ThreadPoolExecutor(2) as ex:
            for r, m in zip(items[:enrich], ex.map(lambda r: ytdlp_meta(r["url"]), items[:enrich])):
                for k, v in m.items():
                    if v is not None:
                        r[k] = v
                r["source"] = "chatplace+yt-dlp"
    elif enrich:
        print("NOTE yt-dlp не установлен (pip install yt-dlp) — без лайков и комментариев")
    return items


def main():
    cfg = config()["scan"]
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", choices=("auto", "graph", "apify"), default="auto")
    ap.add_argument("--windsor", help="JSON со строками Windsor get_data")
    ap.add_argument("--links", nargs="+")
    ap.add_argument("--chatplace", help="JSON постов из ChatPlace (automations_triggers_list_instagram_media)")
    ap.add_argument("--automations", help="JSON автоматизаций со статистикой (automations_list_with_stats)")
    ap.add_argument("--enrich", type=int, default=24, help="скольким свежим рилсам подтянуть лайки и комментарии через yt-dlp "
                    "(анонимный лимит Instagram — несколько десятков запросов в час, оставь запас на скачивание победителя)")
    ap.add_argument("--days", type=int, default=cfg["days"])
    ap.add_argument("--limit", type=int, default=cfg["max_items"])
    a = ap.parse_args()

    if a.links:
        src, items = "links", from_links(a.links)
    elif a.chatplace:
        src, items = "chatplace", from_chatplace(a.chatplace, a.automations, a.days, a.limit, a.enrich)
    elif a.windsor:
        src, items = "windsor", from_windsor(a.windsor)
    else:
        src = a.source
        if src == "auto":
            src = "graph" if (secret("IG_ACCESS_TOKEN") or secret("META_TOKEN")) else "apify" if secret("APIFY_TOKEN") else ""
        if not src:
            sys.exit("Нет источника данных Instagram. Варианты: (1) Windsor MCP → сохрани строки и запусти с --windsor; "
                     "(2) IG_ACCESS_TOKEN в окружении; (3) APIFY_TOKEN; (4) --links <ссылки на рилсы>. Подробно — references/sources.md")
        items = from_graph(a.days, a.limit) if src == "graph" else from_apify(a.days, a.limit)

    out = SCAN / "reels.json"
    write_json(out, {"fetched_at": datetime.datetime.now().isoformat(timespec="seconds"), "source": src, "days": a.days, "items": items})
    has = lambda f: sum(1 for i in items if i.get(f) is not None)
    print(json.dumps({"ok": True, "source": src, "reels": len(items), "with_views": has("views"), "with_comments": has("comments"),
                      "with_shares": has("shares"), "with_reposts": has("reposts"), "with_leads": has("leads"), "with_video_url": has("video_url"),
                      "file": str(out)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
