#!/usr/bin/env python3
"""Шаг 2. Отобрать залетевшие рилсы → REMAKE_WORK/_scan/candidates.json (+ candidates.jpg — обложки с номерами)

  python3 rank.py [--top 8] [--sheet 8] [--any-cta] [--include-used] [--min-age 3]

Счёт = взвешенные процентили внутри выгрузки: просмотры, комментарии, репосты+шеры, лиды по кодовому слову (ChatPlace)
и лайки (веса — scan.weights в config.json;
если метрики нет у источника, её вес делится между остальными). Процентили, а не сырые числа: один миллионник
не перекрывает остальные сигналы, а рилс с сильными комментариями (кодовое слово сработало) поднимается.
Сначала идут рилсы с кодовым словом в подписи (--any-cta — без этого правила). Рилсы, переделанные за последние
scan.reuse_after_days дней (история), убраны (--include-used — оставить). «Говорящую голову» скрипт не видит:
её проверяешь глазами по candidates.jpg, а у выбранного — по sheet.jpg после grab.py.
"""
import argparse, datetime, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # и под python3 -I
from common import SCAN, code_word, config, download, fmt_n, read_json, used_sources, write_json


def pct(values: list) -> list:
    """Процентиль каждого значения (0..1), одинаковые значения — одинаковый процентиль; None → None."""
    known = sorted(v for v in values if v is not None)
    if not known:
        return [None] * len(values)
    n = len(known)
    rank = {}
    for i, v in enumerate(known):
        rank.setdefault(v, []).append(i)
    return [None if v is None else (sum(rank[v]) / len(rank[v])) / max(n - 1, 1) for v in values]


def age_days(iso: str):
    try:
        d = datetime.datetime.fromisoformat(str(iso).replace("Z", "+00:00").replace("+0000", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=datetime.timezone.utc)
        return (datetime.datetime.now(datetime.timezone.utc) - d).days
    except ValueError:
        return None


def make_sheet(rows: list, out) -> bool:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return False
    thumbs = []
    for r in rows:
        p = SCAN / "thumbs" / f"{r['rank']}.jpg"
        try:
            if r.get("thumb_url"):
                download(r["thumb_url"], p, timeout=60)
                thumbs.append((r, Image.open(p).convert("RGB")))
        except Exception as e:
            print(f"WARN обложка #{r['rank']} не скачалась: {e}")
    if not thumbs:
        return False
    w, h, cols = 270, 480, 4
    rows_n = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (w * cols, h * rows_n), (10, 10, 10))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for f in ("DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf"):
        try:
            font = ImageFont.truetype(f, 44)
            break
        except OSError:
            pass
    for i, (r, im) in enumerate(thumbs):
        im.thumbnail((w, h))
        x, y = (i % cols) * w, (i // cols) * h
        sheet.paste(im, (x + (w - im.width) // 2, y + (h - im.height) // 2))
        d.rectangle([x, y, x + 64, y + 56], fill=(255, 90, 54))
        d.text((x + 12, y + 4), str(r["rank"]), fill=(255, 255, 255), font=font)
    sheet.save(out, quality=85)
    return True


def main():
    cfg = config()["scan"]
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--top", type=int, default=8)
    ap.add_argument("--sheet", type=int, default=8, help="сколько обложек сложить в candidates.jpg (0 — не надо)")
    ap.add_argument("--any-cta", action="store_true", help="не поднимать рилсы с кодовым словом")
    ap.add_argument("--include-used", action="store_true")
    ap.add_argument("--min-age", type=int, default=cfg["min_age_days"])
    a = ap.parse_args()

    scan = read_json(SCAN / "reels.json")
    if not scan:
        sys.exit("нет выгрузки: сначала fetch_reels.py")
    used = set() if a.include_used else used_sources(cfg["reuse_after_days"])
    items = []
    for r in scan["items"]:
        r = dict(r, age_days=age_days(r.get("date")))
        if r["age_days"] is not None and r["age_days"] < a.min_age:
            continue  # свежий рилс ещё не набрал
        if r["id"] in used or (r.get("shortcode") and r["shortcode"] in used):
            continue
        if r.get("restricted"):
            continue  # Instagram прячет рилс от части аудитории — без входа его не скачать
        sh = [x for x in (r.get("shares"), r.get("reposts")) if x is not None]
        r["spread"] = sum(sh) if sh else None
        r["code"] = code_word(r.get("caption", ""))
        items.append(r)
    if not items:
        sys.exit("после фильтров не осталось рилсов: расширь окно (fetch_reels.py --days) или добавь --include-used")

    w = cfg["weights"]
    cols = {"views": pct([i.get("views") for i in items]), "comments": pct([i.get("comments") for i in items]),
            "shares": pct([i.get("spread") for i in items]), "leads": pct([i.get("leads") for i in items]),
            "likes": pct([i.get("likes") for i in items])}
    # метрика, которая у источника есть, но у этого рилса не подтянулась (yt-dlp не ответил) — нейтральная середина,
    # иначе рилс без комментариев и лайков выигрывает за счёт одних лидов
    # порог покрытия — от рилсов, у которых есть хоть одна метрика (у ChatPlace + yt-dlp метрики только у свежих)
    measured = [k for k in range(len(items)) if any(cols[m][k] is not None for m in cols)]
    covered = {m for m in cols if sum(cols[m][k] is not None for k in measured) >= max(2, 0.3 * len(measured))}
    for k, r in enumerate(items):
        parts = [(w.get(m, 0), cols[m][k] if cols[m][k] is not None else 0.5) for m in covered] if k in measured else []
        r["missing"] = [m for m in covered if cols[m][k] is None]
        tw = sum(x for x, _ in parts)
        r["score"] = round(sum(x * v for x, v in parts) / tw, 3) if tw else 0.0
    items.sort(key=lambda r: (bool(r["code"]) or a.any_cta, r["score"]), reverse=True)
    top = items[:a.top]
    for i, r in enumerate(top, 1):
        r["rank"] = i
    write_json(SCAN / "candidates.json", {"made_at": datetime.datetime.now().isoformat(timespec="seconds"), "source": scan["source"],
                                          "items": top})

    print(f"{'#':>2}  {'дата':10}  {'просм':>6}  {'комм':>5}  {'реп+шер':>7}  {'лиды':>5}  {'лайки':>5}  {'счёт':>5}  код-слово   подпись")
    for r in top:
        cap = " ".join((r.get("caption") or "").split())[:56]
        print(f"{r['rank']:>2}  {str(r.get('date') or '')[:10]:10}  {fmt_n(r.get('views')):>6}  {fmt_n(r.get('comments')):>5}  "
              f"{fmt_n(r.get('spread')):>7}  {fmt_n(r.get('leads')):>5}  {fmt_n(r.get('likes')):>5}  {r['score']:>5.2f}  {(r['code'] or '—'):10}  {cap}")
    no_code = sum(1 for r in top if not r["code"])
    if no_code == len(top):
        print("NOTE ни в одной подписи не нашлось кодового слова — проверь после транскрибации (его могут говорить голосом)")
    if a.sheet and make_sheet(top[:a.sheet], SCAN / "candidates.jpg"):
        print(f"SHEET {SCAN / 'candidates.jpg'} — открой и отметь, где лицо говорит в камеру")
    print(f"FILE {SCAN / 'candidates.json'}")


if __name__ == "__main__":
    main()
