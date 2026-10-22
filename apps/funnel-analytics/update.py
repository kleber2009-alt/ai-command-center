#!/usr/bin/env python3
"""Refresh every configured source in --data, then rebuild the dashboard.

config.json → "sources" (each key optional; a source without config is skipped):
  "finance_sheet":        Google Sheets link of the income/expense workbook (shared «по ссылке»)
  "decomposition_sheet":  link to the decomposition tab (with #gid=...), one row per webinar window
  "decomposition_columns": {"date_from": "<header in your sheet>", ...}  only for headers that differ
  "payments":             "getcourse" (GETCOURSE_ACCOUNT / GETCOURSE_KEY) or a Google Sheets link
  "payments_columns":     same mapping idea for a payments sheet
  "since":                first date to pull from Meta / GetCourse, YYYY-MM-DD
Meta is refreshed when META_TOKEN is set and config has ad_account_id.

A failing source keeps its previous CSV, so the page never goes blank; the status of every source is
written to sources.json and shown on the «Сквозная аналитика» tab.

Usage:
  python3 update.py --data /root/funnel-analytics-data --out /var/www/funnel-analytics/index.html
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import subprocess
import sys
import traceback
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

DEC_COLS = ["date_from", "date_to", "label", "spend_usd", "impressions", "clicks", "registrations", "viewers",
            "applications", "prepayments", "sales", "revenue_rub", "revenue_fact_rub"]
PAY_COLS = ["date", "amount_rub", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "country"]


def sheet_csv(url):
    """CSV of one tab of a link-shared Google Sheet (tab chosen by gid in the link)."""
    m = re.search(r"/d/([A-Za-z0-9_-]+)", url)
    gid = re.search(r"[#&?]gid=(\d+)", url)
    if not m:
        raise ValueError(f"не ссылка Google Sheets: {url}")
    u = f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv" + (f"&gid={gid.group(1)}" if gid else "")
    with urllib.request.urlopen(u, timeout=120) as r:
        if "text/csv" not in r.headers.get("Content-Type", ""):
            raise RuntimeError("таблица закрыта: включите доступ «Все, у кого есть ссылка → Читатель»")
        return list(csv.reader(io.StringIO(r.read().decode("utf-8"))))


def remap(rows, cols, mapping):
    """Find the header row (first row containing any expected header) and write rows in our column order."""
    want = {c: mapping.get(c, c).strip().lower() for c in cols}
    for hi, r in enumerate(rows[:15]):
        low = [x.strip().lower() for x in r]
        pos = {c: low.index(h) for c, h in want.items() if h in low}
        if len(pos) >= 2:
            out = []
            for r2 in rows[hi + 1:]:
                if not any(x.strip() for x in r2):
                    continue
                out.append([r2[pos[c]].strip() if c in pos and pos[c] < len(r2) else "" for c in cols])
            return out, [c for c in cols if c not in pos]
    raise RuntimeError(f"не нашёл строку заголовков; ожидаю колонки: {', '.join(mapping.get(c, c) for c in cols)}")


def write_csv(path, cols, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    data = Path(a.data).expanduser()
    cfg = json.loads((data / "config.json").read_text(encoding="utf-8"))
    src = cfg.get("sources", {})
    today = dt.date.today().isoformat()
    since = src.get("since") or (dt.date.today() - dt.timedelta(days=120)).isoformat()
    status_path = data / "sources.json"
    status = json.loads(status_path.read_text(encoding="utf-8")) if status_path.exists() else {}

    def run(name, fn):
        try:
            note = fn()
            status[name] = {"ok": True, "at": dt.datetime.now().strftime("%d.%m.%Y %H:%M"), "note": note or ""}
        except (Exception, SystemExit) as e:  # keep the previous file, report the error on the page
            traceback.print_exc()
            prev = status.get(name, {})
            status[name] = {"ok": False, "at": dt.datetime.now().strftime("%d.%m.%Y %H:%M"), "error": str(e)[:300],
                            "last_ok": prev.get("at") if prev.get("ok") else prev.get("last_ok")}

    if src.get("finance_sheet"):
        def fin():
            import finance
            book = finance.fetch_sheet(src["finance_sheet"])
            months = finance.parse_book(book, cfg.get("finance", {}))
            sheets = [{"name": n.strip(), "month": next((m["m"] for m in months if m["tab"] == n), None),
                       "rows": finance.trim_grid(r)} for n, r in book.items()]
            (data / "finance.json").write_text(json.dumps(
                {"source": "Google Sheets", "fetched": dt.datetime.now().strftime("%d.%m.%Y %H:%M"),
                 "months": months, "sheets": [s for s in sheets if s["rows"]]},
                ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            return f"{len(months)} мес."
        run("finance", fin)

    if src.get("decomposition_sheet"):
        def dec():
            rows, missing = remap(sheet_csv(src["decomposition_sheet"]), DEC_COLS, src.get("decomposition_columns", {}))
            write_csv(data / "decomposition.csv", DEC_COLS, rows)
            return f"{len(rows)} окон" + (f"; нет колонок: {', '.join(missing)}" if missing else "")
        run("decomposition", dec)

    pay = src.get("payments")
    if pay == "getcourse":
        def gc():
            import getcourse
            fields, items = getcourse.export(since, today)
            rows, missing = getcourse.to_rows(fields, items)
            getcourse.write(rows, data / "payments.csv")
            return f"{len(rows)} оплат" + (f"; нет колонок: {', '.join(missing)}" if missing else "")
        run("payments", gc)
    elif pay:
        def ps():
            rows, missing = remap(sheet_csv(pay), PAY_COLS, src.get("payments_columns", {}))
            write_csv(data / "payments.csv", PAY_COLS, rows)
            return f"{len(rows)} оплат" + (f"; нет колонок: {', '.join(missing)}" if missing else "")
        run("payments", ps)

    for e in cfg.get("embeds", []):
        if not e.get("url"):
            continue
        def emb(e=e):
            import build
            req = urllib.request.Request(e["url"], headers={"User-Agent": "Mozilla/5.0 funnel-analytics"})
            with urllib.request.urlopen(req, timeout=60) as r:
                html = r.read().decode("utf-8", errors="replace")
            if "<" not in html[:2000]:
                raise RuntimeError("ответ не похож на HTML")
            p = build.embed_path(data, e)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(html, encoding="utf-8")
            return f"{len(html) // 1024} КБ"
        run("embed:" + e["title"], emb)

    if os.environ.get("META_TOKEN") and cfg.get("ad_account_id"):
        def meta():
            import meta_api
            meta_api.export(data, cfg["ad_account_id"], since, today)
            return f"{since} — {today}"
        run("meta", meta)

    status_path.write_text(json.dumps(status, ensure_ascii=False, indent=1), encoding="utf-8")
    subprocess.run([sys.executable, str(HERE / "build.py"), "--data", str(data), "--out", a.out], check=True)
    bad = [k for k, v in status.items() if not v.get("ok")]
    if bad:
        print("с ошибками:", ", ".join(bad))


if __name__ == "__main__":
    main()
