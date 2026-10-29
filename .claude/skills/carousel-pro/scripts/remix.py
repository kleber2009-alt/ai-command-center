#!/usr/bin/env python3
"""Ремикс: стираем старый текст на оригинальном слайде, ставим новый теми же шрифтами."""
import json, re, sys, html
from pathlib import Path
import numpy as np, cv2
from PIL import Image

ROOT = Path(__file__).resolve().parent
FONTS = ROOT.parent / "node_modules" / "@fontsource"
W, H = 1080, 1350

def fonts_css():
    faces = [("Jost", "jost", w, "normal") for w in (300, 400, 500, 600)] + \
            [("Tinos", "tinos", 400, "italic"), ("Tinos", "tinos", 700, "italic")]
    out = []
    for fam, slug, w, st in faces:
        for sub in ("latin", "cyrillic"):
            p = FONTS / slug / "files" / f"{slug}-{sub}-{w}-{st}.woff2"
            out.append(f"@font-face{{font-family:'{fam}';font-weight:{w};font-style:{st};src:url('file://{p}') format('woff2');}}")
    return "\n".join(out)

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden;background:#000}
.bg{position:absolute;inset:0;width:1080px;height:1350px}
.t{position:absolute;font-family:'Jost',sans-serif;color:#FCFBFA;white-space:normal}
em{font-family:'Tinos',serif;font-style:italic;font-weight:400;color:#DE984A;letter-spacing:-.5px}
b{font-weight:600}
.h{font-weight:500;font-size:61px;line-height:57px;letter-spacing:-.4px}
.h em{font-size:1.04em}
.it{font-family:'Tinos',serif;font-style:italic;font-size:54px;line-height:60px;color:#DE984A}
.body{font-weight:400;font-size:40px;line-height:46px}
.pill{font-weight:300;font-size:39px;line-height:42px}
.caps{font-weight:500;font-size:51px;line-height:56px;text-transform:uppercase}
.caps em{text-transform:uppercase}
.cta-word{font-family:'Tinos',serif;font-style:italic;font-size:150px;line-height:150px;color:#F0973E}
.lcard{font-weight:400;font-size:42px;line-height:48px;color:#0B0B0B}
.lcard b{font-weight:600}
.badge{font-weight:500;font-size:38px;line-height:44px;color:#F0973E;text-transform:uppercase;letter-spacing:.5px}
.cover{font-weight:600;font-size:78px;line-height:69px;text-transform:uppercase;letter-spacing:-.5px}
.cover em{font-weight:400;font-size:1.02em}
.coversub{font-weight:400;font-size:48px;line-height:49px;text-transform:uppercase}
.pishi{font-weight:500;font-size:48px;line-height:52px;text-transform:uppercase}
.pishi em{font-size:1.05em}
.lcover{font-weight:600;font-size:74px;line-height:62px;text-transform:uppercase;color:#0B0B0B}
.lcardm{font-weight:500;font-size:44px;line-height:42px;color:#0B0B0B}
"""

def md(s):
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"\*(.+?)\*", r"<em>\1</em>", s)
    return s.replace("\n", "<br>")

def hexrgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def clean(img, ops):
    a = np.array(img.convert("RGB"))
    for op in ops:
        x0, y0, x1, y1 = op["box"]
        mode = op.get("mode", "text")
        if mode == "fill":
            c = op.get("color", "auto")
            if c == "auto":
                ring = np.concatenate([a[y0 - 3:y0, x0:x1].reshape(-1, 3), a[y1:y1 + 3, x0:x1].reshape(-1, 3),
                                       a[y0:y1, x0 - 3:x0].reshape(-1, 3), a[y0:y1, x1:x1 + 3].reshape(-1, 3)])
                c = tuple(int(v) for v in np.median(ring, axis=0))
            else:
                c = hexrgb(c)
            a[y0:y1, x0:x1] = c
            continue
        mask = np.zeros(a.shape[:2], np.uint8)
        if mode == "all":
            mask[y0:y1, x0:x1] = 255
        else:
            sub = a[y0:y1, x0:x1].astype(int)
            mask[y0:y1, x0:x1] = (sub.max(axis=2) > op.get("th", 110)).astype(np.uint8) * 255
            mask = cv2.dilate(mask, np.ones((7, 7), np.uint8), iterations=1)
            mask[:y0, :] = 0; mask[y1:, :] = 0; mask[:, :x0] = 0; mask[:, x1:] = 0
        bgr = cv2.inpaint(cv2.cvtColor(a, cv2.COLOR_RGB2BGR), mask, op.get("r", 9), cv2.INPAINT_TELEA)
        a = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return Image.fromarray(a)

def paste(img, ops):
    for op in ops:
        crop = Image.open(ROOT / op["src"]).convert("RGB").crop(tuple(op["box"]))
        img.paste(crop, tuple(op["at"]))
    return img

def page(bg, texts):
    els = []
    for t in texts:
        style = f"left:{t['x']}px;top:{t['y']}px;width:{t.get('w', 860)}px;text-align:{t.get('align', 'left')};{t.get('style', '')}"
        els.append(f'<div class="t {t.get("cls", "h")}" style="{style}">{md(t["html"])}</div>')
    return (f"<!doctype html><html><head><meta charset='utf-8'><style>{fonts_css()}{CSS}</style></head>"
            f"<body><img class='bg' src='file://{bg}'>{''.join(els)}</body></html>")

def main():
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = ROOT / "out" / spec["slug"]; out.mkdir(parents=True, exist_ok=True)
    work = ROOT / "work" / spec["slug"]; work.mkdir(parents=True, exist_ok=True)
    jobs = []
    for i, s in enumerate(spec["slides"], 1):
        img = Image.open(ROOT / s["src"]).convert("RGB")
        if s.get("erase"): img = clean(img, s["erase"])
        if s.get("paste"): img = paste(img, s["paste"])
        plate = work / f"{i:02d}-plate.png"; img.save(plate)
        if s.get("text"):
            hp = work / f"{i:02d}.html"; hp.write_text(page(plate, s["text"]), encoding="utf-8")
            jobs.append((hp, out / f"{spec['slug']}-{i:02d}.png"))
        else:
            img.save(out / f"{spec['slug']}-{i:02d}.png")
    if jobs:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            b = pw.chromium.launch(); pg = b.new_page(viewport={"width": W, "height": H})
            for hp, png in jobs:
                pg.goto(f"file://{hp}"); pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(300)
                pg.screenshot(path=str(png))
            b.close()
    files = sorted(out.glob(f"{spec['slug']}-*.png"))
    th = [Image.open(f).resize((270, 338)) for f in files]
    sheet = Image.new("RGB", (len(th) * 280 + 10, 358), "#222")
    for k, im in enumerate(th): sheet.paste(im, (10 + k * 280, 10))
    sheet.save(ROOT / "out" / f"{spec['slug']}-sheet.jpg", quality=88)
    print("ok", len(files))

if __name__ == "__main__":
    main()
