#!/usr/bin/env python3
"""Склейка половинок-скриншотов с меткой (24 бита: 12 id, 12 innerWidth) в слайды 1080x1350."""
import glob, os, sys
from PIL import Image

SRC = sys.argv[1]                      # папка со скриншотами
OUT = sys.argv[2] if len(sys.argv) > 2 else "src"
os.makedirs(OUT, exist_ok=True)

def decode(im):
    W, H = im.size
    g = im.convert("L")
    for iw in range(1200, 1700):
        r = W / iw
        y = int(828 * r)
        if y >= H: continue
        bits = [1 if g.getpixel((int((i * 24 + 8) * r), y)) > 150 else 0 for i in range(24)]
        idv = sum(b << i for i, b in enumerate(bits[:12])); iwv = sum(b << i for i, b in enumerate(bits[12:]))
        if iwv == iw:
            return idv, r
    return None, None

halves = {}
for f in sorted(glob.glob(SRC + "/*.jpg")) + sorted(glob.glob(SRC + "/*.png")):
    try: im = Image.open(f).convert("RGB")
    except Exception: continue
    if im.size[0] < 1000: continue
    idv, r = decode(im)
    if idv is None: continue
    halves[idv] = im.crop((0, 0, round(1270 * r), round(794 * r))).resize((1080, 675), Image.LANCZOS)

for idv in sorted(halves):
    if idv % 2 or idv + 1 not in halves: continue
    c, s = divmod(idv // 2, 100)
    img = Image.new("RGB", (1080, 1350)); img.paste(halves[idv], (0, 0)); img.paste(halves[idv + 1], (0, 675))
    img.save(f"{OUT}/c{c}-s{s:02d}.png"); print(f"c{c}-s{s:02d}")
