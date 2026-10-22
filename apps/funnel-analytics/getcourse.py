#!/usr/bin/env python3
"""Export paid GetCourse deals with UTM tags into payments.csv (the format build.py reads).

Env:
  GETCOURSE_ACCOUNT   school domain, e.g. "myschool" (myschool.getcourse.ru) or a full custom domain
  GETCOURSE_KEY       API key: Профиль → Настройки аккаунта → API → «Секретный ключ»

GetCourse exports are asynchronous: one call starts the export, the file is polled until ready.

Usage:
  python3 getcourse.py --out ~/school/payments.csv --since 2025-12-01
"""
import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

# header name variants seen in deal exports -> payments.csv column
FIELDS = {
    "date": ["Дата оплаты", "Дата создания"],
    "amount_rub": ["Оплачено", "Заработано", "Стоимость, RUB", "Стоимость"],
    "utm_source": ["utm_source"], "utm_medium": ["utm_medium"], "utm_campaign": ["utm_campaign"],
    "utm_term": ["utm_term"], "utm_content": ["utm_content"],
    "country": ["Страна"],
}


def base_url(account):
    return f"https://{account}" if "." in account else f"https://{account}.getcourse.ru"


def call(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        body = json.load(r)
    if not body.get("success", True) or body.get("error"):
        raise RuntimeError(body.get("error_message") or json.dumps(body, ensure_ascii=False)[:300])
    return body.get("info", {})


def export(since, until=None, status="payed"):
    acc, key = os.environ.get("GETCOURSE_ACCOUNT"), os.environ.get("GETCOURSE_KEY")
    if not acc or not key:
        sys.exit("нужны GETCOURSE_ACCOUNT и GETCOURSE_KEY")
    q = {"key": key, "status": status, "payed_at[from]": since}
    if until:
        q["payed_at[to]"] = until
    info = call(f"{base_url(acc)}/pl/api/account/deals?{urllib.parse.urlencode(q)}")
    eid = info.get("export_id")
    if not eid:
        sys.exit(f"GetCourse не вернул export_id: {info}")
    for _ in range(40):  # up to ~10 minutes
        time.sleep(15)
        try:
            data = call(f"{base_url(acc)}/pl/api/account/exports/{eid}?key={urllib.parse.quote(key)}")
        except RuntimeError as e:
            if re.search(r"не (создан|готов)|not ready|in progress", str(e), re.I):
                continue
            raise
        if data.get("items") is not None:
            return data.get("fields", []), data["items"]
    sys.exit("GetCourse не подготовил выгрузку за 10 минут")


def to_rows(fields, items):
    idx = {}
    for out, names in FIELDS.items():
        for n in names:
            hit = next((i for i, f in enumerate(fields) if f.strip().lower() == n.lower()), None)
            if hit is not None:
                idx[out] = hit
                break
    rows = []
    for it in items:
        r = {k: (str(it[i]).strip() if i < len(it) and it[i] is not None else "") for k, i in idx.items()}
        r["date"] = r.get("date", "")[:10]
        rows.append(r)
    return rows, [k for k in FIELDS if k not in idx]


def write(rows, out):
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(FIELDS))
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in FIELDS})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--since", required=True)
    ap.add_argument("--until")
    a = ap.parse_args()
    fields, items = export(a.since, a.until)
    rows, missing = to_rows(fields, items)
    write(rows, a.out)
    print(f"GetCourse: {len(rows)} оплат → {a.out}" + (f"; нет колонок: {', '.join(missing)}" if missing else ""))
