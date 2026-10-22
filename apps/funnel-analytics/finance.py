#!/usr/bin/env python3
"""Parse the school's monthly income/expense workbook ("Расходы <Месяц> [YY]" tabs) into finance.json.

Each monthly tab looks like:
  <Section>,План,Факт,Статус          section header (Сотрудники / Сервисы / Продукт / KPI / ...)
  <item>,<plan>,<fact>,<status>[,<note>]
  ...
  Итого расходы,<plan>,<fact>
  ГК переведено на ИП,,<fact>,,,Выручка лава,евро,доллар,...   revenue channels (+ labels for the row below)
  Итого выручка,<plan>,<fact>,,,,<eur>,<usd>,...
  % проджекта,<plan>,<fact>                                     partner shares
  Итоговая прибыль / Итоговые расходы / Маржинальность

Sources (first that applies):
  --xlsx book.xlsx                 File → Download → .xlsx
  --sheet <url>                    Google Sheet; works when shared "anyone with the link",
                                   or with GOOGLE_ACCESS_TOKEN (OAuth token with drive.readonly)
  --csv tab.csv --month 2026-01    a single tab exported as CSV

Usage:
  python3 finance.py --sheet https://docs.google.com/spreadsheets/d/<id>/edit --out ~/school/finance.json
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

MONTHS = {"январ": 1, "феврал": 2, "март": 3, "апрел": 4, "май": 5, "мая": 5, "июн": 6, "июл": 7,
          "август": 8, "сентябр": 9, "октябр": 10, "ноябр": 11, "декабр": 12}
# Several versions of the same month may exist; the higher score wins.
VARIANT_SCORE = [("пересчитан", 3), ("оформлен", 2)]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def num(v):
    """'4 669 929,24' / 'р.79 347' / '60,30%' / 1234.5 -> float, None when there is no number."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(" ", "").replace(" ", "").replace("₽", "")
    m = re.search(r"-?\d+(?:[.,]\d+)?", s)
    if not m or not re.fullmatch(r"[^\d-]*-?\d+(?:[.,]\d+)?%?", s):
        return None
    return float(m.group(0).replace(",", "."))


def txt(v):
    return "" if v is None else str(v).strip()


# ─────────── xlsx reader (stdlib only) ───────────
def _col(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


DATE_FMT_IDS = set(range(14, 23)) | {45, 46, 47}


def _date_styles(z):
    """Indexes of cellXfs that format a number as a date (so serials like 46303 become 09.10.2026)."""
    if "xl/styles.xml" not in z.namelist():
        return set()
    st = ET.fromstring(z.read("xl/styles.xml"))
    custom = {}
    nf = st.find("m:numFmts", NS)
    for f in (nf if nf is not None else []):
        code = re.sub(r'"[^"]*"|\\.|\[[^]]*\]', "", f.get("formatCode", "")).lower()
        custom[int(f.get("numFmtId"))] = bool(re.search(r"[dy]", code)) or bool(re.search(r"(^|[^h:])m+([^m:s]|$)", code) and "d" in code)
    xfs = st.find("m:cellXfs", NS)
    out = set()
    for i, xf in enumerate(xfs if xfs is not None else []):
        fid = int(xf.get("numFmtId", 0))
        if fid in DATE_FMT_IDS or custom.get(fid):
            out.add(i)
    return out


def _serial_to_date(v):
    import datetime as dt
    return (dt.date(1899, 12, 30) + dt.timedelta(days=int(v))).strftime("%d.%m.%Y")


def read_xlsx(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    dates = _date_styles(z)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    out = {}
    for sh in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", NS):
        target = rels[sh.get(RID)].lstrip("/")
        path = target if target.startswith("xl/") else "xl/" + target
        rows = []
        for row in ET.fromstring(z.read(path)).iter(f"{{{NS['m']}}}row"):
            cells = {}
            for c in row.findall("m:c", NS):
                v, t = c.find("m:v", NS), c.get("t")
                if t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter(f"{{{NS['m']}}}t"))
                elif v is None:
                    continue
                elif t == "s":
                    val = shared[int(v.text)]
                elif t in ("str", "e"):
                    val = v.text
                elif t == "b":
                    val = v.text == "1"
                else:
                    val = float(v.text)
                    if int(c.get("s", 0)) in dates and 20000 < val < 80000:
                        val = _serial_to_date(val)
                cells[_col(c.get("r"))] = val
            idx = int(row.get("r")) - 1
            while len(rows) < idx:
                rows.append([])
            rows.append([cells.get(i) for i in range(max(cells) + 1)] if cells else [])
        out[sh.get("name")] = rows
    return out


def fetch_sheet(url):
    m = re.search(r"/d/([A-Za-z0-9_-]+)", url)
    if not m:
        sys.exit("не похоже на ссылку Google Sheets")
    fid = m.group(1)
    tok = os.environ.get("GOOGLE_ACCESS_TOKEN")
    if tok:
        req = urllib.request.Request(
            f"https://www.googleapis.com/drive/v3/files/{fid}/export?mimeType="
            "application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Authorization": f"Bearer {tok}"})
    else:
        req = urllib.request.Request(f"https://docs.google.com/spreadsheets/d/{fid}/export?format=xlsx")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"Google вернул {e.code}: откройте доступ «всем, у кого есть ссылка» или задайте GOOGLE_ACCESS_TOKEN")
    if not data.startswith(b"PK"):
        sys.exit("Google вернул не xlsx (скорее всего страницу входа) — таблица закрыта")
    return read_xlsx(data)


# ─────────── month detection ───────────
def month_of(name, base_year, overrides):
    """'Расходы ИЮЛЬ 26' -> '2026-07'; tabs without a year get base_year (or an explicit override)."""
    if name.strip() in overrides:
        return overrides[name.strip()]
    low = name.lower()
    if not low.startswith("расходы"):
        return None
    mon = next((n for k, n in MONTHS.items() if k in low), None)
    if not mon:
        return None
    y = re.search(r"\b(\d{2}|\d{4})\b", low)
    year = (2000 + int(y.group(1)) if len(y.group(1)) == 2 else int(y.group(1))) if y else base_year
    return f"{year}-{mon:02d}"


def variant_score(name):
    low = name.lower()
    return next((s for k, s in VARIANT_SCORE if k in low), 1)


# ─────────── one monthly tab ───────────
def parse_month(rows):
    """One monthly tab -> items / revenue channels / partner shares / the tab's own totals.

    Two layouts exist: the current one (<section>,План,Факт,Статус) and the early one
    (Dec 2024 - Jan 2025: <item>,<amount>,<status>, no plan column).
    """
    old = not any(len(r) > 1 and txt(r[1]).lower() == "план" for r in rows)
    items, revenue, shares, sheet = [], [], [], {}
    section, mode = ("Клуб" if old else "Прочее"), "exp"
    labels = {}  # column -> label from the header of the channel breakdown (Выручка лава / евро / доллар ...)

    def pf(r):  # (plan, fact) of a summary row in either layout
        b, c = num(r[1]), num(r[2])
        return (None, b) if old else (b, c)

    for r in rows:
        r = list(r) + [None] * (6 - len(r))
        a = txt(r[0])
        low = a.lower()
        if not any(txt(x) for x in r):
            if mode == "exp" and not old:
                section = "Прочее"
            continue
        if mode == "done":
            break
        if low.startswith("итого расход"):
            sheet["exp_plan"], sheet["exp_fact"] = pf(r)
            mode = "rev"
            continue
        if mode == "exp":
            b, c = num(r[1]), num(r[2])
            if txt(r[1]).lower() == "план" or (a and not any(txt(x) for x in r[1:4])):
                section = a or section
                continue
            if not a:
                continue
            if old:
                items.append({"cat": section, "item": a, "plan": 0, "fact": b or 0, "status": txt(r[2]),
                              "note": txt(r[3]) if num(r[3]) is None else ""})
            else:
                items.append({"cat": section, "item": a, "plan": b or 0, "fact": c or 0, "status": txt(r[3]),
                              "note": txt(r[4]) if num(r[4]) is None else ""})
            continue
        # revenue / summary block; everything below «Маржинальность» is side calculations
        plan, fact = pf(r)
        if low.startswith("итого выручка"):
            sheet["rev_plan"], sheet["rev_fact"] = plan, fact
            for col, lab in labels.items():
                v = num(r[col]) if col < len(r) else None
                if v:
                    revenue.append({"ch": (lab["group"] + " · " if lab["group"] else "") + lab["name"],
                                    "fact": v, "detail": True})
            mode = "after"
        elif low.startswith("итоговая прибыль"):
            sheet["profit_plan"], sheet["profit_fact"] = plan, fact
        elif low.startswith("итого прибыль"):
            sheet["gross_plan"], sheet["gross_fact"] = plan, fact
        elif low.startswith("итоговые расходы"):
            sheet["total_exp_plan"], sheet["total_exp_fact"] = plan, fact
        elif low.startswith("маржинальн"):
            to_pct = lambda v: None if v is None else (v * 100 if abs(v) <= 1.5 else v)
            sheet["margin_plan"], sheet["margin_fact"] = to_pct(plan), to_pct(fact)
            mode = "done"
        elif a.startswith("%"):
            shares.append({"item": a.lstrip("% ").strip(), "plan": plan or 0, "fact": fact or 0})
        elif a and fact is not None and (mode == "rev" or "манифест" in low):
            # channels sit between «Итого расходы» and «Итого выручка»; «Манифесты» comes right after it
            revenue.append({"ch": a, "fact": fact or 0, "plan": plan or 0})
        if mode == "rev":
            texts = [(j, txt(x)) for j, x in enumerate(r) if j >= 4 and txt(x) and num(x) is None]
            if len(texts) >= 3:
                group, labels = "", {}
                for j, t in texts:
                    if t.lower().startswith("выручка"):
                        group = re.sub(r"(?i)^выручка\s*", "", t).strip() or t
                    elif not t.lower().startswith("конвертац"):
                        labels[j] = {"name": t, "group": group}
    return {"items": items, "revenue": [x for x in revenue if not x.get("detail")],
            "revenue_detail": [x for x in revenue if x.get("detail")], "shares": shares, "sheet": sheet,
            "layout": "early" if old else "plan-fact"}


def trim_grid(rows):
    """Drop empty trailing rows/columns; numbers stay numbers, text is stripped."""
    rows = [[(round(x, 2) if isinstance(x, float) else txt(x)) if x is not None and txt(x) != "" else ""
             for x in r] for r in rows]
    while rows and not any(c != "" for c in rows[-1]):
        rows.pop()
    width = max((max((i + 1 for i, c in enumerate(r) if c != ""), default=0) for r in rows), default=0)
    return [r[:width] + [""] * (width - len(r[:width])) for r in rows]


def parse_book(book, cfg):
    base_year = cfg.get("base_year", 2025)
    overrides = cfg.get("month_overrides", {})
    best = {}
    for name, rows in book.items():
        m = month_of(name, base_year, overrides)
        if not m:
            continue
        if m not in best or variant_score(name) > variant_score(best[m][0]):
            best[m] = (name, rows)
    months = []
    for m in sorted(best):
        name, rows = best[m]
        p = parse_month(rows)
        if not p["items"] and not p["sheet"]:
            continue
        months.append({"m": m, "tab": name, **p})
    return months


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sheet")
    ap.add_argument("--xlsx")
    ap.add_argument("--csv")
    ap.add_argument("--month", help="для --csv: какой это месяц, YYYY-MM")
    ap.add_argument("--config", help="config.json (ключ finance: base_year, month_overrides)")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    cfg = json.loads(Path(a.config).read_text(encoding="utf-8")).get("finance", {}) if a.config else {}
    if a.csv:
        if not a.month:
            sys.exit("для --csv нужен --month YYYY-MM")
        with open(a.csv, newline="", encoding="utf-8-sig") as f:
            book = {"Расходы": list(csv.reader(f))}
        cfg = {**cfg, "month_overrides": {"Расходы": a.month}}
    elif a.xlsx:
        book = read_xlsx(Path(a.xlsx).expanduser().read_bytes())
    elif a.sheet:
        book = fetch_sheet(a.sheet)
    else:
        sys.exit("нужен --sheet, --xlsx или --csv")
    months = parse_book(book, cfg)
    used = {m["tab"] for m in months}
    sheets = [{"name": n.strip(), "month": next((m["m"] for m in months if m["tab"] == n), None),
               "rows": trim_grid(rows)} for n, rows in book.items()]
    out = Path(a.out).expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"months": months, "sheets": [x for x in sheets if x["rows"]]},
                              ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{out}: {len(months)} мес. ({', '.join(m['m'] for m in months)}); листов всего {len(sheets)}, "
          f"из них помесячных в отчёте {len(used)}")


if __name__ == "__main__":
    main()
