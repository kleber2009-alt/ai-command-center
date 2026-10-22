#!/usr/bin/env python3
"""Export Meta Ads insights into the CSVs build.py reads.

Env:
  META_TOKEN         system-user / long-lived token with ads_read
  META_AD_ACCOUNT    act_123... (or ad_account_id in config.json, or --act)
  META_API_VERSION   default v23.0

Usage:
  python3 meta_api.py --data ~/school --since 2026-07-01 --until 2026-09-30
"""
import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

LEAD = ("lead", "offsite_conversion.fb_pixel_lead", "onsite_web_lead")
PURCHASE = ("purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase")
LPV = ("landing_page_view",)


def _get(path, params):
    ver = os.environ.get("META_API_VERSION", "v23.0")
    params = {**params, "access_token": os.environ["META_TOKEN"]}
    url = f"https://graph.facebook.com/{ver}/{path}?{urllib.parse.urlencode(params)}"
    rows = []
    while url:
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=120) as r:
                    body = json.load(r)
                break
            except urllib.error.HTTPError as e:
                err = e.read().decode("utf-8", "replace")
                # 17/613 = rate limit: back off and retry, anything else is fatal
                if attempt < 3 and ('"code":17' in err or '"code":613' in err or e.code >= 500):
                    time.sleep(2 ** (attempt + 2))
                    continue
                sys.exit(f"Meta API {e.code}: {err[:500]}")
        rows += body.get("data", [])
        url = body.get("paging", {}).get("next")
    return rows


def _act(actions, types):
    # several action types can describe the same event; take the max, not the sum, to avoid double counting
    vals = [float(a["value"]) for a in actions or [] if a.get("action_type") in types]
    return max(vals) if vals else 0


def _insights(act, since, until, **extra):
    return _get(f"{act}/insights", {
        "time_range": json.dumps({"since": since, "until": until}),
        "fields": "spend,impressions,inline_link_clicks,actions," + extra.pop("fields", ""),
        "limit": 500, **extra})


def _link(creative):
    spec = (creative or {}).get("object_story_spec") or {}
    return (creative or {}).get("link_url") or (spec.get("link_data") or {}).get("link") or \
        (((spec.get("video_data") or {}).get("call_to_action") or {}).get("value") or {}).get("link") or ""


def _write(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def export(data, act=None, since=None, until=None):
    if not os.environ.get("META_TOKEN"):
        sys.exit("нужен META_TOKEN (токен с правом ads_read)")
    act = act or os.environ.get("META_AD_ACCOUNT")
    if not act or not since or not until:
        sys.exit("нужны ID кабинета (--act / META_AD_ACCOUNT / config.ad_account_id), --since и --until")
    act = act if act.startswith("act_") else "act_" + act
    data = Path(data)
    data.mkdir(parents=True, exist_ok=True)

    ads = _insights(act, since, until, level="ad",
                    fields="campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name")
    status = {c["id"]: c.get("effective_status", "—")
              for c in _get(f"{act}/campaigns", {"fields": "id,effective_status", "limit": 500})}
    links = {a["id"]: _link(a.get("creative")) for a in _get(f"{act}/ads", {
        "fields": "id,creative{link_url,object_story_spec}", "limit": 200})}
    _write(data / "meta_ads.csv",
           ["campaign_id", "campaign_name", "campaign_status", "adset_id", "adset_name", "ad_id", "ad_name",
            "landing_url", "spend", "impressions", "clicks", "leads", "lpv"],
           [[r["campaign_id"], r["campaign_name"], status.get(r["campaign_id"], "—"), r["adset_id"], r["adset_name"],
             r["ad_id"], r["ad_name"], links.get(r["ad_id"], ""), r.get("spend", 0), r.get("impressions", 0),
             r.get("inline_link_clicks", 0), _act(r.get("actions"), LEAD), _act(r.get("actions"), LPV)]
            for r in ads])

    daily = _insights(act, since, until, level="account", time_increment=1)
    _write(data / "meta_daily.csv", ["date", "spend", "impressions", "clicks", "leads", "lpv", "purchases"],
           [[r["date_start"], r.get("spend", 0), r.get("impressions", 0), r.get("inline_link_clicks", 0),
             _act(r.get("actions"), LEAD), _act(r.get("actions"), LPV), _act(r.get("actions"), PURCHASE)]
            for r in daily])

    bd = []
    for r in _insights(act, since, until, level="account", breakdowns="publisher_platform,platform_position"):
        # same shape as the {{placement}} URL macro: Instagram_Reels, Facebook_Mobile_Feed
        key = "_".join(w.capitalize() for w in f"{r['publisher_platform']}_{r['platform_position']}".split("_"))
        bd.append(["placement", key, r.get("spend", 0)])
    for r in _insights(act, since, until, level="account", breakdowns="country"):
        bd.append(["country", r["country"], r.get("spend", 0)])
    _write(data / "meta_breakdowns.csv", ["dim", "key", "spend"], bd)
    print(f"Meta: {len(ads)} объявлений, {len(daily)} дней, {len(bd)} строк разрезов → {data}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--act")
    ap.add_argument("--since", required=True)
    ap.add_argument("--until", required=True)
    a = ap.parse_args()
    cfg_path = Path(a.data) / "config.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8")) if cfg_path.exists() else {}
    export(a.data, a.act or cfg.get("ad_account_id"), a.since, a.until)
