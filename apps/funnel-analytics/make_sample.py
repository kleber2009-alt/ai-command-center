#!/usr/bin/env python3
"""Generate a deterministic fictional dataset in sample/ so build.py works out of the box.

The numbers are invented, but deliberately contain the same classes of problems the
dashboard is built to surface: a Lead pixel that double-fires, no Purchase event,
spend outside the decomposition, payments without UTM tags, a missing P&L cost.
"""
import csv
import datetime as dt
import random
from pathlib import Path

OUT = Path(__file__).parent / "sample"
rnd = random.Random(42)

CAMPAIGNS = [
    # (campaign id, name, landing url, quality multiplier)
    ("120210000000001", "Вебинар ИИ-контент — широкая", "https://school.example/webinar", 1.25),
    ("120210000000002", "Вебинар ИИ-контент — LAL покупатели", "https://school.example/webinar", 1.6),
    ("120210000000003", "Вебинар — новый лендинг v2", "https://v2.school.example/", 1.0),
    ("120210000000004", "Ретаргет зрителей", "https://school.example/webinar", 2.1),
    ("120210000000005", "Тест: квиз-лендинг", "https://quiz.school.example/", 0.45),
]
HOOKS = ["пока одни не понимают ИИ", "это не съёмка — это ИИ", "1000 Reels за вечер",
         "как я заменил монтажёра", "ИИ-аватар вместо блогера"]
PLACEMENTS = ["Instagram_Reels", "Instagram_Stories", "Instagram_Feed", "Facebook_Mobile_Feed", "Facebook_Reels"]
COUNTRIES = ["RU", "KZ", "BY", "UZ", "AM", "DE"]
COUNTRY_W = [62, 14, 8, 6, 5, 5]
PRICES = [24990, 34990, 49990, 89990]


def build_ads():
    ads = []
    n = 0
    for cid, cname, url, q in CAMPAIGNS:
        for g in range(1, 3):
            for k in range(rnd.randint(1, 3)):
                n += 1
                hook = rnd.choice(HOOKS)
                ads.append({
                    "campaign_id": cid, "campaign_name": cname, "q": q, "url": url,
                    "campaign_status": "ACTIVE" if cid != "120210000000005" else "PAUSED",
                    "adset_id": f"{cid}{g:02d}", "adset_name": f"группа {g} — {'интересы' if g == 1 else 'широкая'}",
                    "ad_id": f"{cid}{g:02d}{k + 1:02d}", "ad_name": f"{hook} #{n}", "hook": hook,
                    "w": rnd.uniform(0.5, 1.6),
                })
    return ads


def main():
    OUT.mkdir(exist_ok=True)
    ads = build_ads()
    start, end = dt.date(2026, 7, 1), dt.date(2026, 9, 30)

    # Webinar windows: every Tue-Wed and Thu-Fri pair, some skipped.
    windows, d = [], start
    while d <= end:
        if d.weekday() in (1, 3) and d + dt.timedelta(days=1) <= end and rnd.random() > 0.12:
            windows.append((d, d + dt.timedelta(days=1)))
            d += dt.timedelta(days=2)
            continue
        d += dt.timedelta(days=1)

    daily = []  # account-level Meta daily (spend runs every day, not only on webinar windows)
    ad_tot = {a["ad_id"]: dict(spend=0.0, impressions=0, clicks=0, leads=0, lpv=0) for a in ads}
    win_days = {x for w in windows for x in (w[0], w[1])}
    d = start
    while d <= end:
        base = rnd.uniform(70, 150) * (1.35 if d in win_days else 0.75) * (1 + (d - start).days / 300)
        row = dict(date=d.isoformat(), spend=0.0, impressions=0, clicks=0, leads=0, lpv=0, purchases=0)
        for a in ads:
            sp = base * a["w"] / len(ads) * (0 if a["campaign_status"] == "PAUSED" and d.month == 9 else 1)
            imp = int(sp * rnd.uniform(160, 230))
            cl = int(imp * rnd.uniform(0.011, 0.02))
            lpv = int(cl * rnd.uniform(0.78, 0.92))
            # Lead pixel fires ~1.7x real registrations (duplicates on the thank-you page)
            ld = int(cl * 0.2 * a["q"] ** 0.4 * 1.7 * rnd.uniform(0.85, 1.15))
            for k, v in (("spend", sp), ("impressions", imp), ("clicks", cl), ("leads", ld), ("lpv", lpv)):
                row[k] += v
                ad_tot[a["ad_id"]][k] += v
        daily.append(row)
        d += dt.timedelta(days=1)
    daily_by = {r["date"]: r for r in daily}

    # Decomposition: one row per webinar window, ad numbers only for those days.
    dec = []
    for a_, b_ in windows:
        sp = sum(daily_by[x.isoformat()]["spend"] for x in (a_, b_))
        imp = sum(daily_by[x.isoformat()]["impressions"] for x in (a_, b_))
        cl = sum(daily_by[x.isoformat()]["clicks"] for x in (a_, b_))
        regs = int(sum(daily_by[x.isoformat()]["leads"] for x in (a_, b_)) / 1.7 * rnd.uniform(0.9, 1.05))
        vis = int(regs * rnd.uniform(0.22, 0.34))
        apps = int(vis * rnd.uniform(0.1, 0.2))
        sales = max(0, int(apps * rnd.uniform(0.25, 0.55)))
        prepay = rnd.randint(0, 2) if a_.month >= 8 else 0
        rev = sum(rnd.choice(PRICES) for _ in range(sales))
        dec.append([a_.isoformat(), b_.isoformat(), f"{a_.day}-{b_.day} {MONTHS_GEN[a_.month]}",
                    round(sp, 2), imp, cl, regs, vis, apps, prepay, sales, rev, round(rev * rnd.uniform(0.9, 0.97))])

    with open(OUT / "decomposition.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date_from", "date_to", "label", "spend_usd", "impressions", "clicks", "registrations",
                    "viewers", "applications", "prepayments", "sales", "revenue_rub", "revenue_fact_rub"])
        w.writerows(dec)

    with open(OUT / "meta_daily.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "spend", "impressions", "clicks", "leads", "lpv", "purchases"])
        for r in daily:
            w.writerow([r["date"], round(r["spend"], 2), r["impressions"], r["clicks"], r["leads"], r["lpv"], 0])

    with open(OUT / "meta_ads.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["campaign_id", "campaign_name", "campaign_status", "adset_id", "adset_name", "ad_id",
                    "ad_name", "landing_url", "spend", "impressions", "clicks", "leads", "lpv"])
        for a in ads:
            t = ad_tot[a["ad_id"]]
            w.writerow([a["campaign_id"], a["campaign_name"], a["campaign_status"], a["adset_id"], a["adset_name"],
                        a["ad_id"], a["ad_name"], a["url"], round(t["spend"], 2), t["impressions"], t["clicks"],
                        t["leads"], t["lpv"]])

    # Spend breakdowns from the API (placement / country) for the cut tables.
    tot_spend = sum(r["spend"] for r in daily)
    with open(OUT / "meta_breakdowns.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["dim", "key", "spend"])
        pw = [rnd.uniform(0.5, 2) for _ in PLACEMENTS]
        for p, x in zip(PLACEMENTS, pw):
            w.writerow(["placement", p, round(tot_spend * x / sum(pw), 2)])
        cw = [c * rnd.uniform(0.7, 1.4) for c in COUNTRY_W]
        for c, x in zip(COUNTRIES, cw):
            w.writerow(["country", c, round(tot_spend * x / sum(cw), 2)])

    # Payments file: all school sales (≈ sum of decomposition sales + a few extra),
    # only part of them carries UTM tags, some rows have no date.
    total_sales = sum(r[10] for r in dec) + 12
    weights = [a["w"] * a["q"] for a in ads]
    with open(OUT / "payments.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "amount_rub", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
                     "country"])
        for _ in range(total_sales):
            day = start + dt.timedelta(days=rnd.randint(0, (end - start).days))
            date = "" if rnd.random() < 0.25 else day.isoformat()
            amt = rnd.choice(PRICES)
            r = rnd.random()
            country = rnd.choices(COUNTRIES, COUNTRY_W)[0]
            if r < 0.42:
                a = rnd.choices(ads, weights)[0]
                ad_ref = a["ad_id"] if rnd.random() > 0.08 else "{{ad.id}}"  # macros that did not expand
                w.writerow([date, amt, "facebook", rnd.choice(PLACEMENTS), a["campaign_id"], a["adset_id"],
                            ad_ref, country])
            elif r < 0.55:
                w.writerow([date, amt, "instagram", "bio", "", "", "", country])
            elif r < 0.62:
                w.writerow([date, amt, "telegram", "post", "channel", "", "", country])
            else:
                w.writerow([date, amt, "", "", "", "", "", ""])
    print(f"sample written to {OUT}: {len(windows)} windows, {len(ads)} ads, {total_sales} payments")


def finance_and_content():
    """Fictional income/expense months (finance.json, finance.py format) and content stats (content.json)."""
    import json
    cats = {"Сотрудники": [("Руководитель контента", 120000), ("Дизайнер", 60000), ("Техспец", 40000), ("СММ", 60000)],
            "Сервисы": [("Сейлбот", 17000), ("GetCourse", 25000), ("Подписки ИИ", 15000), ("Телефония", 3300)],
            "Продукт": [("Куратор флагмана", 75000), ("Кураторы потока", 90000)],
            "KPI": [("ОП", 400000)],
            "Налог и возвраты": [("Налог", 300000), ("Возвраты", 0)]}
    months = []
    for m, rev_plan in (("2026-07", 3500000), ("2026-08", 4000000), ("2026-09", 4500000)):
        rev = round(rev_plan * rnd.uniform(0.78, 1.08))
        items = []
        for cat, rows in cats.items():
            for name, plan in rows:
                fact = plan * rnd.uniform(0.8, 1.3) if plan else rnd.choice([0, 45000, 90000])
                if name == "ОП":
                    fact = rev * 0.11
                if name == "Налог":
                    fact = rev * 0.07
                items.append({"cat": cat, "item": name, "plan": plan, "fact": round(fact),
                              "status": "Выплачено" if rnd.random() > 0.3 else "Не выплачено", "note": ""})
        ch = [("GetCourse", 0.72), ("Lava", 0.18), ("Счета на ИП", 0.1)]
        exp = sum(i["fact"] for i in items)
        shares = [{"item": "продюсера", "plan": 0, "fact": round((rev - exp) * 0.03)}]
        months.append({"m": m, "tab": "Расходы " + m, "items": items,
                       "revenue": [{"ch": c, "fact": round(rev * w), "plan": 0} for c, w in ch],
                       "revenue_detail": [], "shares": shares,
                       "sheet": {"rev_plan": rev_plan, "rev_fact": sum(round(rev * w) for _, w in ch), "exp_fact": exp}})
    (OUT / "finance.json").write_text(json.dumps({"source": "демо-таблица", "months": months}, ensure_ascii=False, indent=1),
                                      encoding="utf-8")
    accs = [("school.example", "RU", 220, 180, 6200), ("competitor_one", "RU", 300, 95, 14000),
            ("competitor_two", "EN", 150, 410, 52000), ("competitor_three", "RU", 90, 40, 2100)]
    pubs = []
    for i in range(40):
        acc, lang, posts, med, mx = rnd.choice(accs)
        ins = int(min(mx, med * rnd.lognormvariate(1.2, 1.1)))
        pubs.append({"id": f"p{i}", "acc": acc, "url": f"https://www.instagram.com/{acc}/", "ins": ins,
                     "xn": round(ins / med, 1), "date": f"{rnd.randint(1, 9):02d}.2026",
                     "fmt": rnd.choice(["Рилс", "Рилс", "Карусель"]), "hook": rnd.choice(HOOKS)})
    content = {"source": "демо-выборка", "own": "school.example", "pubs": pubs,
               "accounts": [{"acc": a, "lang": l, "posts": p, "median": m, "max": x} for a, l, p, m, x in accs],
               "mechanics": [{"n": "Инструмент + результат + срок", "stat": "14 000 входов", "why": "Конкретный результат за короткий срок.",
                              "refs": [p["id"] for p in pubs[:2]]}],
               "slides": [{"n": "1", "role": "Обложка", "q": "«Стоит ли смотреть?»", "what": "Тренд + результат + срочность"},
                          {"n": "2–8", "role": "Шаги", "q": "«Как сделать?»", "what": "Шаг, пример, результат"},
                          {"n": "9", "role": "Призыв", "q": "«Как получить остальное?»", "what": "Кодовое слово и что внутри"}]}
    (OUT / "content.json").write_text(json.dumps(content, ensure_ascii=False, indent=1), encoding="utf-8")


MONTHS_GEN = {7: "июля", 8: "августа", 9: "сентября"}

if __name__ == "__main__":
    main()
    finance_and_content()
