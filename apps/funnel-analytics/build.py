#!/usr/bin/env python3
"""Build a self-contained end-to-end analytics dashboard (dist/index.html).

Inputs (CSV, UTF-8, comma-separated) in --data dir:
  decomposition.csv   one row per webinar window: the school's own funnel numbers
  payments.csv        every sale, with UTM tags where they reached the checkout
  meta_ads.csv        Meta Ads, ad level, totals for the whole period      } from meta_api.py
  meta_daily.csv      Meta Ads, account level, per day                     } or exported by hand
  meta_breakdowns.csv Meta spend by placement / country (optional)         }
  config.json         title, FX rate, landing mapping, non-ad costs
  finance.json        income/expense report from the school's sheet (finance.py), optional
  content.json        content analytics: publications, entries per post, accounts, hooks, optional
Every source is optional: the page shows only the tabs it has data for.

Usage:
  python3 build.py                        # demo data from sample/
  python3 build.py --data ~/school --out dist/school.html
  python3 build.py --data ~/school --fetch --since 2026-07-01 --until 2026-09-30
"""
import argparse
import csv
import datetime as dt
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
DEC_KEYS = {  # csv column -> short key used in the page
    "spend_usd": "usd", "impressions": "imp", "clicks": "clicks", "registrations": "regs",
    "viewers": "visits", "applications": "apps", "prepayments": "prepay", "sales": "sales",
    "revenue_rub": "rev_rub", "revenue_fact_rub": "fact_rub",
}
META_KEYS = ["spend", "impressions", "clicks", "leads", "lpv"]
UNSET_MACRO = re.compile(r"^\{\{.*\}\}$")


def num(v):
    v = (v or "").strip().replace(" ", "").replace(" ", "").replace(",", ".")
    if not v or v in ("-", "—"):
        return 0.0
    try:
        return float(v)
    except ValueError:
        return 0.0


def read_csv(path, required=True):
    if not path.exists():
        if required:
            sys.exit(f"нет файла {path}")
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        return [{(k or "").strip(): (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]


def parse_date(s):
    s = (s or "").strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y", "%d/%m/%Y"):
        try:
            return dt.datetime.strptime(s[:10], fmt).date()
        except ValueError:
            pass
    return None


def load_decomposition(rows):
    """Window rows -> per-day rows (window totals split evenly across its days) + window list."""
    days, wins = [], []
    for r in rows:
        a, b = parse_date(r.get("date_from")), parse_date(r.get("date_to") or r.get("date_from"))
        if not a:
            continue
        b = b or a
        span = [a + dt.timedelta(days=i) for i in range((b - a).days + 1)]
        vals = {short: num(r.get(col)) for col, short in DEC_KEYS.items()}
        label = r.get("label") or (a.strftime("%d.%m") + ("–" + b.strftime("%d.%m") if b != a else ""))
        wins.append({"label": label, "days": [d.isoformat() for d in span], **vals})
        for d in span:
            days.append({"d": d.isoformat(), "win": label, **{k: v / len(span) for k, v in vals.items()}})
    days.sort(key=lambda x: x["d"])
    wins.sort(key=lambda x: x["days"][0])
    return days, wins


def landing_for(url, mapping):
    for name, needle in mapping.items():
        if needle and needle in (url or ""):
            return name
    m = re.match(r"https?://([^/?#]+)", url or "")
    return m.group(1) if m else "—"


def hook_of(ad_name, rx):
    if rx:
        m = re.search(rx, ad_name)
        if m:
            return (m.group(1) if m.groups() else m.group(0)).strip()
    return re.sub(r"\s*#\d+\s*$", "", ad_name).strip() or ad_name


def build_tree(ad_rows, cfg):
    camps = {}
    for r in ad_rows:
        cid = r.get("campaign_id") or r.get("campaign_name")
        c = camps.setdefault(cid, {
            "id": cid, "name": r.get("campaign_name") or cid, "status": r.get("campaign_status") or "—",
            "land": landing_for(r.get("landing_url"), cfg.get("landings", {})), "adsets": {}, "n": 0, "rev": 0,
            **{k: 0 for k in META_KEYS}})
        sid = r.get("adset_id") or r.get("adset_name") or "—"
        s = c["adsets"].setdefault(sid, {"id": sid, "name": r.get("adset_name") or sid, "ads": {}, "n": 0, "rev": 0,
                                         **{k: 0 for k in META_KEYS}})
        aid = r.get("ad_id") or r.get("ad_name")
        ad = s["ads"].setdefault(aid, {"id": aid, "name": r.get("ad_name") or aid,
                                       "hook": hook_of(r.get("ad_name") or aid, cfg.get("hook_regex")),
                                       "n": 0, "rev": 0, "pl": [], **{k: 0 for k in META_KEYS}})
        for k in META_KEYS:
            v = num(r.get(k))
            for node in (c, s, ad):
                node[k] += v
    return camps


def attach_payments(pay_rows, camps, cfg):
    """Match each payment to campaign/adset/ad via UTM (ids or names), return flat list for the page."""
    by_ad, by_set, by_camp = {}, {}, {}
    for c in camps.values():
        by_camp[c["id"]] = by_camp[c["name"]] = c
        for s in c["adsets"].values():
            by_set[s["id"]] = by_set[s["name"]] = (c, s)
            for a in s["ads"].values():
                by_ad[a["id"]] = by_ad[a["name"]] = (c, s, a)
    srcmap = {k.lower(): v for k, v in cfg.get("sources", {}).items()}
    out = []
    for r in pay_rows:
        rub = num(r.get("amount_rub") or r.get("amount"))
        if rub <= 0:
            continue
        d = parse_date(r.get("date"))
        src_raw = (r.get("utm_source") or "").lower()
        p = {"d": d.isoformat() if d else None, "rub": rub, "src": srcmap.get(src_raw, src_raw or "(нет метки)"),
             "geo": (r.get("country") or "").upper() or "(нет)", "pl": "(нет)", "hook": "(нет метки)",
             "land": None, "cid": None, "ad": None}
        med = r.get("utm_medium") or ""
        if "_" in med:  # {{placement}} macro looks like Instagram_Reels / Facebook_Mobile_Feed
            p["pl"] = med
        ad_ref, set_ref, camp_ref = (r.get(k) or "" for k in ("utm_content", "utm_term", "utm_campaign"))
        hit = by_ad.get(ad_ref)
        if hit:
            c, s, a = hit
        else:
            c = s = a = None
            if set_ref in by_set:
                c, s = by_set[set_ref]
            elif camp_ref in by_camp:
                c = by_camp[camp_ref]
            if c is not None:
                # tagged to a campaign, but the ad is unknown (macro not expanded / ad deleted)
                s = s or c["adsets"].setdefault("—", {"id": "—", "name": "(группа не определена)", "ads": {},
                                                      "n": 0, "rev": 0, **{k: 0 for k in META_KEYS}})
                a = s["ads"].setdefault("—", {"id": "—", "name": "(объявление не определено)",
                                              "hook": "(без ad_id)", "n": 0, "rev": 0, "pl": [],
                                              **{k: 0 for k in META_KEYS}})
                if UNSET_MACRO.match(ad_ref):
                    a["macro"] = True
        if c is not None:
            for node in (c, s, a):
                node["n"] += 1
                node["rev"] += rub
            if p["pl"] != "(нет)" and p["pl"] not in a["pl"]:
                a["pl"].append(p["pl"])
            p.update(cid=c["id"], land=c["land"], ad=a["id"], hook=a["hook"])
        out.append(p)
    return out


def finalize_tree(camps):
    tree = []
    for c in camps.values():
        c["adsets"] = [{**s, "ads": list(s["ads"].values())} for s in c["adsets"].values()]
        tree.append(c)
    tree.sort(key=lambda c: -c["spend"])
    return tree


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def load_meta_daily(rows):
    out = []
    for r in rows:
        d = parse_date(r.get("date"))
        if d:
            out.append({"d": d.isoformat(), **{k: num(r.get(k)) for k in META_KEYS + ["purchases"]}})
    out.sort(key=lambda x: x["d"])
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(HERE / "sample"), help="папка с CSV и config.json")
    ap.add_argument("--out", default=str(HERE / "dist" / "index.html"))
    ap.add_argument("--fetch", action="store_true", help="сначала выгрузить кабинет Meta по API (META_TOKEN)")
    ap.add_argument("--since")
    ap.add_argument("--until")
    a = ap.parse_args()
    data = Path(a.data).expanduser()
    cfg = json.loads((data / "config.json").read_text(encoding="utf-8")) if (data / "config.json").exists() else {}

    if a.fetch:
        import meta_api
        meta_api.export(data, cfg.get("ad_account_id"), a.since, a.until)

    days, wins = load_decomposition(read_csv(data / "decomposition.csv", required=False))
    camps = build_tree(read_csv(data / "meta_ads.csv", required=False), cfg)
    pays = attach_payments(read_csv(data / "payments.csv", required=False), camps, cfg)
    bd = defaultdict(dict)
    for r in read_csv(data / "meta_breakdowns.csv", required=False):
        bd[r.get("dim")][r.get("key")] = bd[r.get("dim")].get(r.get("key"), 0) + num(r.get("spend"))

    tree = finalize_tree(camps)
    D = {
        "title": cfg.get("title", "Сквозная аналитика"),
        "subtitle": cfg.get("subtitle", "Декомпозиция × кабинет Meta × файл оплат с UTM"),
        "generated": dt.datetime.now().strftime("%d.%m.%Y %H:%M"),
        "meta_mode": "по API" if a.fetch else cfg.get("meta_mode", "из CSV"),
        "fx": cfg.get("fx", 90), "target_cpr": cfg.get("target_cpr", 1.5), "act": cfg.get("ad_account_id", ""),
        "days": days, "wins": wins, "meta_daily": load_meta_daily(read_csv(data / "meta_daily.csv", required=False)),
        "tree": tree, "pays": pays, "bd": bd, "costs": cfg.get("costs", {}),
        "lands": sorted({c["land"] for c in tree}),
        "fin": load_json(data / "finance.json"),
        "content": load_json(data / "content.json"),
    }
    tpl = (HERE / "template.html").read_text(encoding="utf-8")
    payload = json.dumps(D, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(tpl.replace("/*__DATA__*/null", payload), encoding="utf-8")
    tagged = sum(1 for p in pays if p["cid"])
    fin_n = len(D["fin"]["months"]) if D["fin"] else 0
    cnt_n = len(D["content"]["pubs"]) if D["content"] else 0
    print(f"{out}: {len(wins)} окон, {len(tree)} кампаний, {len(pays)} оплат (к рекламе привязано {tagged}), "
          f"финансы {fin_n} мес., контент {cnt_n} публикаций")


if __name__ == "__main__":
    main()
