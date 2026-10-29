"""Contact sheet of photos for picking story backgrounds.

Usage: python3 contact_sheet.py <photos-dir> <out.png> [--size 200] [--cols 10]
Each tile is labelled with its file name and V (vertical) / H (horizontal).
"""
import argparse
import glob
import os

from PIL import Image, ImageDraw, ImageOps


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--size", type=int, default=200)
    ap.add_argument("--cols", type=int, default=10)
    a = ap.parse_args()
    files = sorted(f for f in glob.glob(os.path.join(a.src, "*")) if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
    rows = (len(files) + a.cols - 1) // a.cols
    sheet = Image.new("RGB", (a.size * a.cols, a.size * max(rows, 1)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        im = ImageOps.exif_transpose(Image.open(f)).convert("RGB")
        orient = "V" if im.height > im.width else "H"
        im.thumbnail((a.size, a.size))
        x, y = (i % a.cols) * a.size, (i // a.cols) * a.size
        sheet.paste(im, (x, y))
        name = os.path.splitext(os.path.basename(f))[0][:10]
        draw.rectangle([x, y, x + 90, y + 20], fill="black")
        draw.text((x + 4, y + 4), f"{name} {orient}", fill="yellow")
    sheet.save(a.out)
    print(a.out, len(files), "photos")


if __name__ == "__main__":
    main()
