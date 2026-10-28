#!/usr/bin/env python3
"""Шаг 3. Забрать рилс-оригинал в папку задачи

  python3 grab.py <N | ссылка | shortcode | путь к mp4> [--slug S]

N — номер из candidates.json. Видео: прямая ссылка из выгрузки → Apify (APIFY_TOKEN) → yt-dlp → ошибка с подсказкой
(тогда пусть Илья пришлёт файл, и запускаешь с путём). В папке задачи:
  sources/original.mp4   оригинал
  source.json            метрики, подпись, кодовое слово, длительность
  sheet.jpg              8 кадров ролика — проверь глазами, что это говорящая голова
Печатает JSON со slug и путём — дальше transcribe.py <slug>.
"""
import argparse, datetime, json, os, re, shutil, subprocess, sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # и под python3 -I
from common import SCAN, code_word, download, job_dir, probe, read_json, secret, sheet, write_json

TR = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
              ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "h",
               "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))


def slugify(s: str) -> str:
    s = "".join(TR.get(c, c) for c in s.lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40] or "reel"


def pick(arg: str) -> dict:
    p = Path(arg).expanduser()
    if p.exists():
        return {"id": p.stem, "file": str(p.resolve()), "source": "file", "caption": ""}
    cand = (read_json(SCAN / "candidates.json") or {}).get("items", [])
    if arg.isdigit():
        for r in cand:
            if r.get("rank") == int(arg):
                return r
        sys.exit(f"нет кандидата #{arg} — сначала rank.py")
    for r in cand + (read_json(SCAN / "reels.json") or {}).get("items", []):
        if arg in (r.get("url"), r.get("shortcode"), r.get("id")):
            return r
    if arg.startswith("http"):
        return {"id": arg, "url": arg, "source": "link", "caption": ""}
    sys.exit(f"не понял, что брать: {arg}")


def fetch_video(r: dict, dest: Path) -> str:
    if r.get("file"):
        shutil.copy2(r["file"], dest)
        return "file"
    tried = []
    if r.get("video_url"):
        try:
            download(r["video_url"], dest)
            if probe(dest)["duration"] > 0:
                return "cdn"
        except Exception as e:
            tried.append(f"cdn: {e}")
    if r.get("url") and secret("APIFY_TOKEN"):
        try:
            from fetch_reels import apify
            items = apify({"directUrls": [r["url"]], "resultsType": "details", "resultsLimit": 1}, timeout=120)
            v = items[0].get("videoUrl") if items else None
            if v:
                download(v, dest)
                if not r.get("caption"):
                    r["caption"] = items[0].get("caption") or ""
                return "apify"
            tried.append("apify: нет videoUrl")
        except Exception as e:
            tried.append(f"apify: {e}")
    if r.get("url") and shutil.which("yt-dlp"):
        x = subprocess.run(["yt-dlp", "-q", "-f", "mp4/best", "-o", str(dest), r["url"]], capture_output=True, text=True, timeout=300)
        if x.returncode == 0 and dest.exists():
            return "yt-dlp"
        tried.append(f"yt-dlp: {(x.stderr or '').strip()[-200:]}")
    sys.exit("не удалось скачать видео (" + "; ".join(tried or ["нет ни ссылки на видео, ни APIFY_TOKEN, ни yt-dlp"]) +
             "). Попроси файл рилса и запусти grab.py с путём к нему.")


def face_check(src: Path, n: int = 8):
    """Доля кадров с крупным лицом — если есть OpenCV. Иначе None (тогда только глазами по sheet.jpg)."""
    try:
        import cv2
    except ImportError:
        return None
    cap = cv2.VideoCapture(str(src))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    casc = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    hits = 0
    for i in range(n):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * (i + 0.5) / n))
        ok, fr = cap.read()
        if not ok:
            continue
        g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
        faces = casc.detectMultiScale(g, 1.2, 5, minSize=(g.shape[1] // 8, g.shape[1] // 8))
        hits += len(faces) > 0
    cap.release()
    return round(hits / n, 2)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("what")
    ap.add_argument("--slug")
    a = ap.parse_args()

    r = pick(a.what)
    stamp = datetime.date.today().strftime("%m%d")
    slug = a.slug or f"remake-{slugify(r.get('code') or code_word(r.get('caption', '')) or r.get('shortcode') or r['id'])}-{stamp}"
    job = job_dir(slug, create=True)
    dest = job / "sources" / "original.mp4"
    how = fetch_video(r, dest)
    meta = probe(dest)
    if meta["duration"] <= 0:
        sys.exit(f"скачанный файл не читается как видео: {dest}")
    sheet(dest, job / "sheet.jpg")
    info = {**{k: v for k, v in r.items() if k not in ("video_url", "thumb_url")}, "slug": slug, "downloaded_by": how,
            "duration": meta["duration"], "width": meta["width"], "height": meta["height"], "audio": meta["audio"],
            "code": r.get("code") or code_word(r.get("caption", "")), "face_ratio": face_check(dest)}
    write_json(job / "source.json", info)
    print(json.dumps({"ok": True, "slug": slug, "job": str(job), "duration": meta["duration"], "audio": meta["audio"],
                      "code_in_caption": info["code"], "face_ratio": info["face_ratio"], "sheet": str(job / "sheet.jpg")},
                     ensure_ascii=False))
    if not meta["audio"]:
        print("WARN у видео нет звука — это не говорящая голова, возьми другого кандидата")


if __name__ == "__main__":
    main()
