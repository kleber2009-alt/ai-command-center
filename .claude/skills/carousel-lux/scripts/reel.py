"""«Люкс» для рилс: тот же дизайн-слой, что у каруселей, в кадре 1080×1920.

Рилс = говорящая голова (аватар HeyGen или съёмка) + вставки. Этот модуль делает вставки и аниматик:
обложку, кадры «заголовок + окно со скрином» с плавным скроллом/наездом и финал с кодовым словом.

    from reel import Reel
    r = Reel("out/01", texture="textures/steel.jpg", photo="covers/c03.jpg", tag="ИИ-ОФИС · @ILIA.PALIY")
    r.cover("ЭТОТ ОФИС", "я бы спрятал", "13 агентов вместо отдела")
    r.insert("ХУК", "Спокойный текст реплики", "13 агентов *вместо отдела*",
             [("st/tour.png", (0, 0, 1440, 900))], url="hq2.aicex.club")
    r.cta("ПРАКТИКУМ", "4–5 ноября · 18:00 МСК", "Пиши слово в комментариях — пришлю приглашение")
    r.build()   # inserts/NN-<role>.mp4 (без субтитров), animatic.mp4 (с субтитрами), cover.png, timeline.txt

Длина вставки — по реплике: 2,5 слова в секунду (скорость голоса-клона), минимум 2,2 с.
Нужны Playwright (Chromium) и ffmpeg. Шрифты — как у lux.py (LUX_FONTS или node_modules/@fontsource).
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lux  # noqa: E402

FW, FH = 1080, 1920
WX, WY, WW, BAR = 60, 520, 960, 44
CH = 940                        # content area height under the window bar
FPS = 30
WPS = 2.5                       # words per second of the voice clone

CSS = (lux.CSS.replace("width:1080px;height:1350px", f"width:{FW}px;height:{FH}px")
       + ".sub{position:absolute;left:70px;right:70px;bottom:190px;text-align:center;font-family:'Manrope';font-weight:700;font-size:44px;"
         "line-height:1.25;color:#fff;text-shadow:0 4px 18px rgba(0,0,0,.9)}"
         ".sub em{font-style:normal;color:#E0B46A}")
GRAIN = lux.GRAIN.replace("height='1350'", f"height='{FH}'")


def page(inner):
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{lux.FONTS}{CSS}</style></head><body>{inner}{GRAIN}</body></html>"


def dur(text):
    return max(2.2, round(len(text.split()) / WPS + 0.35, 2))


def _sub(text):
    return f"<div class='sub'>{lux.md(text)}</div>" if text else ""


class Reel:
    def __init__(self, out, texture="textures/steel.jpg", photo="covers/c01.jpg", tag="@ILIA.PALIY", handle="@ilia.paliy", url=""):
        self.out = Path(out).resolve()
        self.tex, self.photo, self.tag, self.handle, self.url = texture, photo, tag, handle, url
        self.items = []

    # ---------- frames ----------
    def _bg(self):
        return (f"<img class='bg' src='{lux.f(lux.G / self.tex)}' style='height:{FH}px;filter:brightness(.55)'>"
                "<div class='shade' style='background:linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.2) 30%,rgba(0,0,0,.55) 80%,rgba(0,0,0,.8))'></div>")

    def _foot(self):
        return (f"<div class='abs mono' style='left:70px;bottom:70px;font-size:22px;letter-spacing:2px;color:rgba(243,238,228,.6)'>{self.handle}</div>"
                + (f"<div class='abs mono' style='right:70px;bottom:70px;font-size:22px;letter-spacing:2px;color:rgba(224,180,106,.85)'>{self.url}</div>" if self.url else ""))

    def cover(self, top, accent, sub="", pos="50% 25%", say=""):
        html = (f"<img class='bg' src='{lux.f(lux.G / self.photo)}' style='height:{FH}px;object-position:{pos}'>"
                "<div class='shade' style='background:linear-gradient(180deg,rgba(0,0,0,.3) 0,rgba(0,0,0,0) 20%,rgba(0,0,0,0) 45%,rgba(0,0,0,.85) 70%,rgba(0,0,0,.96) 100%)'></div>"
                f"<div class='abs' style='left:64px;right:64px;bottom:430px'>"
                f"<div class='tag' style='margin-bottom:26px'>{lux.md(self.tag)}</div>"
                f"<div class='serif' style='font-weight:500;font-size:132px;line-height:.9;letter-spacing:-1px;text-transform:uppercase;color:#F6F1E7'>{lux.md(top)}</div>"
                f"<div style='position:relative;display:inline-block;margin-top:16px;padding:4px 0 18px'>"
                f"<span class='it' style='font-size:104px;line-height:1;font-weight:500'>{lux.md(accent)}</span>"
                "<svg class='abs' style='left:14px;bottom:-4px;width:calc(100% - 10px);height:30px;overflow:visible' viewBox='0 0 100 30' preserveAspectRatio='none'>"
                "<path d='M2 18 C25 8 55 26 98 10' fill='none' stroke='#E0B46A' stroke-width='3' vector-effect='non-scaling-stroke' stroke-linecap='round'/></svg></div>"
                + (f"<div class='p' style='margin-top:24px;font-size:36px;color:#F3EEE4'>{lux.md(sub)}</div>" if sub else "")
                + "</div>" + self._foot())
        self.items.append(dict(kind="cover", role="ОБЛОЖКА", html=html, say=say, title=f"{top} {accent}", shots=[]))

    def insert(self, role, say, title, shots, url=None, note=""):
        """shots: [(image, (x0, y0, x1, y1) crop box in image pixels or None)] — shown one after another in the window."""
        html = (self._bg()
                + f"<div class='abs' style='left:70px;right:70px;top:170px'><div class='tag'>{lux.md(self.tag)}</div>"
                f"<div class='h1' style='margin-top:22px;font-size:88px;line-height:1.02'>{lux.md(title)}</div></div>"
                f"<div class='win' style='left:{WX}px;top:{WY}px;width:{WW}px;height:{BAR + CH}px;background:#0e1013'>"
                f"<div class='bar'><i></i><i></i><i></i><span>{url or self.url}</span></div></div>"
                + self._foot())
        self.items.append(dict(kind="insert", role=role, html=html, say=say, title=title, shots=shots, note=note))

    def cta(self, word, when, line, say="", shot=None):
        mock = (f"<div class='shot' style='left:150px;top:300px;width:780px;transform:rotate(-2deg);border-radius:18px'><img src='{lux.f(Path(shot).resolve())}'></div>"
                if shot else "")
        html = (self._bg() + mock
                + f"<div class='abs' style='left:70px;right:70px;top:{860 if shot else 520}px;text-align:center'>"
                f"<div class='serif' style='font-size:66px;font-style:italic'>Пиши в комментариях</div>"
                f"<div class='plaque' style='background:#E0B46A;color:#111;font-family:\"Cormorant Garamond\";font-weight:600;font-size:118px;letter-spacing:2px;"
                f"padding:6px 48px 18px;margin-top:30px;transform:rotate(-1.5deg);box-shadow:0 24px 60px rgba(0,0,0,.6)'>{lux.md(word)}</div>"
                f"<div class='mono' style='margin-top:46px;font-size:30px;letter-spacing:3px;color:#E0B46A'>{lux.md(when)}</div>"
                f"<div class='p' style='margin-top:22px;font-size:36px'>{lux.md(line)}</div></div>" + self._foot())
        self.items.append(dict(kind="cta", role="CTA", html=html, say=say, title=word, shots=[]))

    # ---------- render ----------
    def _render_pngs(self):
        h = self.out / "html"
        h.mkdir(parents=True, exist_ok=True)
        jobs = []
        for i, it in enumerate(self.items, 1):
            p = h / f"{i:02d}-clean.html"
            p.write_text(page(it["html"]), encoding="utf-8")
            jobs.append([str(p), str(h / f"{i:02d}-clean.png"), 0])
            for c, words in enumerate(chunks(it["say"])):
                p = h / f"{i:02d}-sub{c}.html"
                p.write_text(f"<!doctype html><html><head><meta charset='utf-8'><style>{lux.FONTS}{CSS}html,body{{background:transparent}}</style></head>"
                             f"<body>{_sub(' '.join(words))}</body></html>", encoding="utf-8")
                jobs.append([str(p), str(h / f"{i:02d}-sub{c}.png"), 1])
        js = h / "jobs.json"
        js.write_text(json.dumps(jobs))
        script = ("const {chromium}=require('playwright');const jobs=require(process.argv[2]);(async()=>{const b=await chromium.launch();"
                  f"const p=await b.newPage({{viewport:{{width:{FW},height:{FH}}}}});for(const [h,o,tr] of jobs){{await p.goto('file://'+h);"
                  "await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(150);await p.screenshot({path:o,omitBackground:!!tr});}await b.close();})();")
        sp = h / "render.cjs"
        sp.write_text(script)
        subprocess.run(["node", str(sp), str(js)], check=True)

    def _content(self, shots, d, out):
        """Window content: each still cropped, fit to the window width, then scrolled (tall) or slowly zoomed (short)."""
        part = d / len(shots)
        segs = []
        for k, (img, box) in enumerate(shots):
            img = Path(img).resolve()
            seg = out.with_name(f"{out.stem}-{k}.mp4")
            crop = f"crop={box[2] - box[0]}:{box[3] - box[1]}:{box[0]}:{box[1]}," if box else ""
            w, hgt = (box[2] - box[0], box[3] - box[1]) if box else _size(img)
            sh = round(hgt * WW / w)
            if sh > CH + 60:   # tall: smooth scroll top → bottom
                vf = f"{crop}scale={WW}:-2,crop={WW}:{CH}:0:'(ih-{CH})*min(t/{part:.3f},1)'"
            elif sh < CH * .92 and w / hgt < 1.8:   # wide: fill the window height, pan left → right
                vf = f"{crop}scale=-2:{CH},crop={WW}:{CH}:'(iw-{WW})*0.4*min(t/{part:.3f},1)':0"
            else:              # fits: pad, slow push-in
                vf = (f"{crop}scale={WW}:-2,pad={WW}:{CH}:0:(oh-ih)/2:0x0e1013,"
                      f"scale=w='{WW}*(1+0.06*t/{part:.3f})':h=-2:eval=frame,crop={WW}:{CH}")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-t", f"{part:.3f}", "-i", str(img),
                            "-vf", vf + ",setsar=1,format=yuv420p", "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", str(seg)], check=True)
            segs.append(seg)
        _concat(segs, out)
        for s in segs:
            s.unlink()

    def build(self):
        self._render_pngs()
        h, ins = self.out / "html", self.out / "inserts"
        ins.mkdir(parents=True, exist_ok=True)
        clips, t, timeline = {"clean": [], "sub": []}, 0.0, []
        for i, it in enumerate(self.items, 1):
            d = dur(it["say"]) if it["say"] else 2.0
            slug = re.sub(r"[^0-9A-Za-zА-Яа-яЁё]+", "-", it["role"]).strip("-").lower()
            content = None
            if it["shots"]:
                content = ins / f"_c{i:02d}.mp4"
                self._content(it["shots"], d, content)
            o = ins / f"{i:02d}-{slug}.mp4"
            cmd = ["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-t", f"{d:.3f}", "-i", str(h / f"{i:02d}-clean.png")]
            if content:
                cmd += ["-i", str(content), "-filter_complex", f"[0][1]overlay={WX}:{WY + BAR}:shortest=1,format=yuv420p"]
            else:
                cmd += ["-vf", "scale=w='1080*(1+0.04*t/" + f"{d:.3f}" + ")':h=-2:eval=frame,crop=1080:1920,format=yuv420p"]
            cmd += ["-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-movflags", "+faststart", str(o)]
            subprocess.run(cmd, check=True)
            clips["clean"].append(o)
            parts = chunks(it["say"])
            if parts:   # subtitle chunks, each on screen for its share of words
                total, acc, fc, prev = sum(len(c) for c in parts), 0, [], "0:v"
                cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(o)]
                for c, words in enumerate(parts):
                    a, acc = acc, acc + len(words)
                    cmd += ["-i", str(h / f"{i:02d}-sub{c}.png")]
                    fc.append(f"[{prev}][{c + 1}:v]overlay=0:0:enable='between(t,{d * a / total:.3f},{d * acc / total:.3f})'[s{c}]")
                    prev = f"s{c}"
                sub = h / f"{i:02d}-sub.mp4"
                cmd += ["-filter_complex", ";".join(fc), "-map", f"[{prev}]", "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", str(sub)]
                subprocess.run(cmd, check=True)
                clips["sub"].append(sub)
            else:
                clips["sub"].append(o)
            if content:
                content.unlink()
            timeline.append(f"{_tc(t)}–{_tc(t + d)}  {it['role']:<14} {it['title'].replace('*', '')}\n    реплика: {it['say']}\n    вставка: {self.out.name}/inserts/{i:02d}-{slug}.mp4"
                            + (f" · {it['note']}" if it.get("note") else ""))
            t += d
        _concat(clips["sub"], self.out / "animatic.mp4")
        for c in clips["sub"]:
            if c.parent == h:
                c.unlink()
        (self.out / "timeline.txt").write_text("\n".join(timeline) + f"\n\nИтого: {_tc(t)}\n", encoding="utf-8")
        cover = h / "01-clean.png"
        if self.items and self.items[0]["kind"] == "cover":
            (self.out / "cover.png").write_bytes(cover.read_bytes())
        return t


def chunks(text, n=6):
    """Subtitle chunks: up to n words, broken after punctuation when possible."""
    out, cur = [], []
    for w in text.split():
        cur.append(w)
        if len(cur) >= n or (len(cur) >= 3 and w[-1] in ".,:;!?—»"):
            out.append(cur); cur = []
    if cur:
        out.append(cur)
    return out


def _size(img):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(img)],
                       capture_output=True, text=True, check=True)
    w, h = r.stdout.strip().split(",")
    return int(w), int(h)


def _concat(parts, out):
    lst = out.with_suffix(".txt")
    lst.write_text("".join(f"file '{Path(p).resolve()}'\n" for p in parts))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", "-movflags", "+faststart", str(out)], check=True)
    lst.unlink()


def _tc(s):
    return f"{int(s // 60)}:{s % 60:04.1f}"
