#!/usr/bin/env python3
"""«Карусель Люкс» — дизайн-система каруселей @ilia.paliy в редакционной подаче (по разбору каруселей Лизы Ткачук,
переведённой в мужской стиль): кинопортрет на обложке, тонкая антиква + золотой курсив, фактурный фон на карусель,
настоящие скрины в окнах браузера, рукописные стрелки, стекло, бумага на скотче, карточки чата Claude, мокап материала в CTA.

Модуль — библиотека компонентов. Карусель — функция, которая возвращает (slug, title, [html слайдов], подпись).
Пример на 10 каруселей — examples/lisa10.py. Сборка: build([...]) → html/*.html + jobs.json → node scripts/render.mjs."""
import html, json, re
from pathlib import Path

import os

SKILL = Path(__file__).resolve().parent.parent
ASSETS = Path(os.environ.get("LUX_ASSETS", SKILL / "assets"))
A = ASSETS / "ilia"        # скрины и иконки из каруселей Ильи (профиль, статистика, Директ, монтаж…)
G = ASSETS                 # covers/ — кинопортреты, textures/ — фоны
S = ASSETS / "sites"       # скрины сайтов нейросетей


def _fonts_dir():
    for d in [os.environ.get("LUX_FONTS"), Path.cwd() / "node_modules/@fontsource", SKILL / "node_modules/@fontsource",
              SKILL.parent.parent.parent / "node_modules/@fontsource"]:
        if d and (Path(d) / "cormorant-garamond").exists():
            return Path(d)
    raise SystemExit("нет шрифтов: npm i @fontsource/cormorant-garamond @fontsource/manrope @fontsource/jetbrains-mono @fontsource/oswald "
                     "(в текущей папке) или LUX_FONTS=<путь к node_modules/@fontsource>")


F = _fonts_dir()

FACES = [("Cormorant Garamond", "cormorant-garamond", w, st) for w in (400, 500, 600, 700) for st in ("normal", "italic")] + \
        [("Manrope", "manrope", w, "normal") for w in (300, 400, 500, 600, 700, 800)] + \
        [("JetBrains Mono", "jetbrains-mono", w, "normal") for w in (400, 500, 700)] + \
        [("Oswald", "oswald", w, "normal") for w in (400, 500, 600)]


def fonts():
    out = []
    for fam, slug, w, st in FACES:
        for sub in ("latin", "cyrillic"):
            p = F / slug / "files" / f"{slug}-{sub}-{w}-{st}.woff2"
            if p.exists():
                out.append(f"@font-face{{font-family:'{fam}';font-weight:{w};font-style:{st};src:url('file://{p}') format('woff2');}}")
    return "\n".join(out)


FONTS = fonts()

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden;background:#0c0c0c}
body{position:relative;font-variant-numeric:lining-nums;font-feature-settings:'lnum' 1;color:#F3EEE4;font-family:'Manrope',sans-serif;-webkit-font-smoothing:antialiased}
.abs{position:absolute}
.bg{position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover}
.shade{position:absolute;inset:0}
.grain{position:absolute;inset:0;opacity:.11;mix-blend-mode:overlay;pointer-events:none}
.serif,.it,.h1,.num{font-feature-settings:'lnum' 1}
.serif{font-family:'Cormorant Garamond',serif}
.mono{font-family:'JetBrains Mono',monospace}
.osw{font-family:'Oswald',sans-serif}
.gold{color:#E0B46A}
.it{font-family:'Cormorant Garamond',serif;font-style:italic;color:#E0B46A}
b{font-weight:700}
.foot{position:absolute;left:64px;right:64px;bottom:40px;display:flex;justify-content:space-between;align-items:center;
 font-family:'Manrope';font-size:21px;color:rgba(243,238,228,.62);letter-spacing:.3px}
.dots{display:flex;gap:9px}.dots i{width:8px;height:8px;border-radius:50%;background:rgba(243,238,228,.28)}.dots i.on{background:#E0B46A}
.tag{display:inline-block;font-family:'JetBrains Mono';font-size:22px;letter-spacing:3px;text-transform:uppercase;color:#E0B46A}
.h1{font-family:'Cormorant Garamond';font-weight:600;font-size:84px;line-height:.98;letter-spacing:-.5px}
.h2{font-family:'Manrope';font-weight:700;font-size:48px;line-height:1.12;letter-spacing:-.6px}
.p{font-family:'Manrope';font-weight:400;font-size:31px;line-height:1.42;color:rgba(243,238,228,.88)}
.glass{background:linear-gradient(160deg,rgba(255,255,255,.14),rgba(255,255,255,.05));border:1.5px solid rgba(255,255,255,.32);
 border-radius:22px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 30px 80px rgba(0,0,0,.45)}
.paper{background:#F1EBDF;color:#151311;border-radius:6px;box-shadow:0 30px 70px rgba(0,0,0,.55),0 2px 0 rgba(0,0,0,.08)}
.win{position:absolute;border-radius:16px;overflow:hidden;background:#111;box-shadow:0 50px 120px rgba(0,0,0,.65),0 0 0 1.5px rgba(255,255,255,.12)}
.win .bar{height:44px;background:#1c1c1e;display:flex;align-items:center;gap:9px;padding:0 18px}
.win .bar i{width:13px;height:13px;border-radius:50%;background:#ff5f57}.win .bar i:nth-child(2){background:#febc2e}.win .bar i:nth-child(3){background:#28c840}
.win .bar span{margin-left:16px;flex:1;height:26px;border-radius:7px;background:#2c2c2e;font-family:'Manrope';font-size:16px;color:#aaa;display:flex;align-items:center;justify-content:center}
.win img{display:block;width:100%}
.shot{position:absolute;border-radius:20px;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.6),0 0 0 1.5px rgba(255,255,255,.12)}
.shot img{display:block;width:100%}
.plaque{display:inline-block;padding:10px 26px 12px;font-family:'Oswald';font-weight:500;font-size:30px;letter-spacing:3px;text-transform:uppercase}
.card{border-radius:24px;padding:34px 38px}
.num{font-family:'Cormorant Garamond';font-style:italic;font-weight:500;color:#E0B46A}
.chip{display:inline-flex;align-items:center;gap:10px;padding:10px 20px;border-radius:40px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.2);
 font-family:'Manrope';font-weight:700;font-size:24px}
"""

GRAIN = ("<svg class='grain' width='1080' height='1350'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/>"
         "<feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>")


def md(s):
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"\*(.+?)\*", r"<span class='it'>\1</span>", s)
    return s.replace("\n", "<br>")


def f(p):
    return f"file://{p}"


def page(inner):
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{FONTS}{CSS}</style></head><body>{inner}{GRAIN}</body></html>"


# ---------- hand-drawn bits ----------
def arrow(x, y, w=150, rot=0, color="#F3EEE4", flip=False):
    sx = -1 if flip else 1
    return (f"<svg class='abs' style='left:{x}px;top:{y}px;width:{w}px;height:{w}px;transform:rotate({rot}deg) scaleX({sx});overflow:visible' viewBox='0 0 150 150'>"
            f"<path d='M20 12 C70 4 105 30 90 60 C78 84 42 78 52 56 C62 36 104 52 108 90 C111 112 100 128 86 138' fill='none' stroke='{color}' stroke-width='3.2' stroke-linecap='round'/>"
            f"<path d='M70 126 L86 139 L94 118' fill='none' stroke='{color}' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/></svg>")


def arrow2(x, y, w=200, rot=0, color="#F3EEE4"):
    return (f"<svg class='abs' style='left:{x}px;top:{y}px;width:{w}px;transform:rotate({rot}deg);overflow:visible' viewBox='0 0 200 80'>"
            f"<path d='M6 52 C50 20 110 70 186 34' fill='none' stroke='{color}' stroke-width='3.2' stroke-linecap='round'/>"
            f"<path d='M164 26 L187 33 L174 54' fill='none' stroke='{color}' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/></svg>")


def oval(x, y, w, h, color="#E0B46A", sw=3):
    return (f"<svg class='abs' style='left:{x}px;top:{y}px;width:{w}px;height:{h}px;overflow:visible' viewBox='0 0 {w} {h}' preserveAspectRatio='none'>"
            f"<path d='M{w*.08} {h*.62} C{w*.02} {h*.12} {w*.62} {-h*.05} {w*.9} {h*.22} C{w*1.04} {h*.38} {w*.94} {h*.98} {w*.48} {h*.97} "
            f"C{w*.12} {h*.95} {-w*.02} {h*.6} {w*.2} {h*.24}' fill='none' stroke='{color}' stroke-width='{sw}' stroke-linecap='round'/></svg>")


def underline(x, y, w, color="#E0B46A"):
    return (f"<svg class='abs' style='left:{x}px;top:{y}px;width:{w}px;height:24px;overflow:visible' viewBox='0 0 {w} 24' preserveAspectRatio='none'>"
            f"<path d='M2 14 C{w*.3} 4 {w*.6} 22 {w-2} 8' fill='none' stroke='{color}' stroke-width='4' stroke-linecap='round'/></svg>")


def strike(x, y, w, color="#C2412D"):
    return (f"<svg class='abs' style='left:{x}px;top:{y}px;width:{w}px;height:60px;overflow:visible' viewBox='0 0 {w} 60' preserveAspectRatio='none'>"
            f"<path d='M4 40 C{w*.3} 22 {w*.7} 30 {w-4} 14' fill='none' stroke='{color}' stroke-width='16' stroke-linecap='round' opacity='.9'/></svg>")


def tape(x, y, w=150, rot=-6):
    return (f"<div class='abs' style='left:{x}px;top:{y}px;width:{w}px;height:42px;transform:rotate({rot}deg);"
            f"background:linear-gradient(90deg,rgba(236,226,200,.78),rgba(222,210,182,.7));box-shadow:0 4px 10px rgba(0,0,0,.25)'></div>")


def clip(x, y):
    return (f"<svg class='abs' style='left:{x}px;top:{y}px;width:180px;height:200px;overflow:visible' viewBox='0 0 180 200'>"
            f"<path d='M50 10 L50 96' stroke='#d9d9d9' stroke-width='7' fill='none' stroke-linecap='round'/>"
            f"<path d='M130 10 L130 96' stroke='#bdbdbd' stroke-width='7' fill='none' stroke-linecap='round'/>"
            f"<path d='M50 10 C50 -6 130 -6 130 10' stroke='#e5e5e5' stroke-width='7' fill='none'/>"
            f"<path d='M14 96 L166 96 L150 176 L30 176 Z' fill='#141414' stroke='#2f2f2f' stroke-width='2'/>"
            f"<path d='M22 104 L158 104' stroke='#3a3a3a' stroke-width='3'/></svg>")


# ---------- frame pieces ----------
def bg(tex, shade="rgba(0,0,0,.45)", extra=""):
    return f"<img class='bg' src='{f(G / tex)}'><div class='shade' style='background:{shade}'></div>{extra}"


def foot(i, n, light=False):
    c = "rgba(20,19,17,.6)" if light else None
    st = f" style='color:{c}'" if c else ""
    dots = "".join(f"<i class='{'on' if k == i else ''}'></i>" for k in range(1, n + 1))
    nxt = "Листай дальше →" if i < n else "Сохрани, чтобы не потерять"
    return f"<div class='foot'{st}><span>@ilia.paliy</span><span class='dots'>{dots}</span><span>{nxt}</span></div>"


def window(x, y, w, img, url, crop=None):
    return (f"<div class='win' style='left:{x}px;top:{y}px;width:{w}px'><div class='bar'><i></i><i></i><i></i><span>{url}</span></div>"
            f"<img src='{f(img)}' style='{crop or ''}'></div>")


def shot(x, y, w, img, rot=0, radius=20):
    return f"<div class='shot' style='left:{x}px;top:{y}px;width:{w}px;transform:rotate({rot}deg);border-radius:{radius}px'><img src='{f(img)}'></div>"


def cover(photo, top, accent, sub="", size=150, accent_size=104, pos="50% 30%", lift=0, badge=""):
    """Lisa-style cover: cinematic portrait, huge thin serif caps, gold italic line in a hand-drawn oval."""
    b = f"<div class='plaque' style='background:#E0B46A;color:#111;font-size:26px;margin-bottom:26px'>{md(badge)}</div><br>" if badge else ""
    return (f"<img class='bg' src='{f(G / photo)}' style='object-position:{pos}'>"
            f"<div class='shade' style='background:linear-gradient(180deg,rgba(0,0,0,.25) 0,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 46%,rgba(0,0,0,.82) 72%,rgba(0,0,0,.95) 100%)'></div>"
            f"<div class='abs' style='left:56px;right:56px;bottom:{120 + lift}px'>{b}"
            f"<div class='serif' style='font-weight:500;font-size:{size}px;line-height:.9;letter-spacing:-1px;text-transform:uppercase;color:#F6F1E7'>{md(top)}</div>"
            f"<div style='position:relative;display:inline-block;margin-top:18px;padding:6px 0 18px 0'>"
            f"<span class='it' style='font-size:{accent_size}px;line-height:1;font-weight:500'>{md(accent)}</span>"
            f"<svg class='abs' style='left:20px;bottom:-6px;width:calc(100% - 10px);height:30px;overflow:visible' viewBox='0 0 100 30' preserveAspectRatio='none'>"
            f"<path d='M2 18 C25 8 55 26 98 10' fill='none' stroke='#E0B46A' stroke-width='3' vector-effect='non-scaling-stroke' stroke-linecap='round'/></svg>"
            f"<svg class='abs' style='right:-70px;bottom:6px;width:80px;height:60px;overflow:visible' viewBox='0 0 80 60'>"
            f"<path d='M4 40 C20 10 44 54 70 22' fill='none' stroke='#F3EEE4' stroke-width='3' stroke-linecap='round'/><path d='M56 18 L71 21 L66 36' fill='none' stroke='#F3EEE4' stroke-width='3' stroke-linecap='round'/></svg></div>"
            + (f"<div class='p' style='margin-top:22px;font-size:30px;color:#F3EEE4'>{md(sub)}</div>" if sub else "")
            + "</div>"
            f"<div class='abs mono' style='right:56px;bottom:52px;font-size:22px;letter-spacing:3px;color:rgba(243,238,228,.8)'>ЛИСТАЙ →</div>"
            f"<div class='abs mono' style='left:56px;bottom:52px;font-size:22px;letter-spacing:2px;color:rgba(243,238,228,.6)'>@ilia.paliy</div>")


def leadmag(x, y, title, sub, w=330, rot=-4, photo="covers/c01.jpg"):
    """Lead-magnet mockup: dark cover card with portrait strip and gold foil title."""
    return (f"<div class='abs' style='left:{x}px;top:{y}px;width:{w}px;height:{int(w*1.32)}px;transform:rotate({rot}deg);border-radius:14px;overflow:hidden;"
            f"box-shadow:0 40px 90px rgba(0,0,0,.7),0 0 0 1.5px rgba(224,180,106,.55);background:#0e0d0c'>"
            f"<img src='{f(G / photo)}' style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 20%;opacity:.55'>"
            f"<div style='position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.92) 70%)'></div>"
            f"<div style='position:absolute;left:24px;right:24px;bottom:26px'>"
            f"<div class='mono' style='font-size:15px;letter-spacing:3px;color:#E0B46A'>{md(sub)}</div>"
            f"<div class='serif' style='font-weight:600;font-size:{int(w*.13)}px;line-height:1;margin-top:10px;text-transform:uppercase;color:#F6F1E7'>{md(title)}</div>"
            f"<div style='height:2px;background:#E0B46A;margin-top:14px;width:60%'></div></div></div>")


def cta(i, n, tex, word, before, after, mag_title, mag_sub, proof=None, photo="covers/c01.jpg", shade="rgba(0,0,0,.55)"):
    p = ""
    if proof:
        p = (f"<div class='abs' style='left:64px;right:64px;top:110px'><div class='h2' style='font-size:44px'>{md(proof)}</div></div>"
             + shot(64, 300, 560, A / "profile.jpg", rot=-2, radius=14) + shot(120, 500, 520, A / "stats.jpg", rot=2, radius=14))
    return (bg(tex, shade) + p
            + leadmag(680, 300 if proof else 170, mag_title, mag_sub, w=330, rot=5, photo=photo)
            + arrow(560, 720, 140, rot=-30, color="#E0B46A")
            + f"<div class='abs' style='left:64px;right:64px;top:{800 if proof else 700}px;text-align:center'>"
              f"<div class='serif' style='font-size:58px;font-style:italic'>{md(before)}</div>"
              f"<div style='display:inline-block;margin:16px 0 18px;padding:10px 46px 22px;background:#E0B46A;color:#111;transform:rotate(-1.5deg);box-shadow:0 20px 50px rgba(0,0,0,.5)'>"
              f"<span class='serif' style='font-weight:600;font-size:{150 if len(word) < 7 else 118}px;line-height:1'>«{md(word)}»</span></div>"
              f"<div class='p' style='font-size:31px'>{md(after)}</div></div>"
            + foot(i, n))



def build(carousels, out="out"):
    """carousels: функции → html/<slug>-NN.html, jobs.json (для render.mjs), meta.json (подписи)."""
    import json
    out = Path(out); (out / "html").mkdir(parents=True, exist_ok=True)
    jobs, meta = [], []
    for k, fn in enumerate(carousels, 1):
        slug, title, slides, cap = fn()
        for i, inner in enumerate(slides, 1):
            p = out / "html" / f"{slug}-{i:02d}.html"
            p.write_text(page(inner), encoding="utf-8")
            jobs.append([str(p.resolve()), str((out / slug / f"slide-{i:02d}.png").resolve())])
        meta.append({"n": k, "slug": slug, "title": title, "slides": len(slides), "caption": cap})
    (out / "jobs.json").write_text(json.dumps(jobs), encoding="utf-8")
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    for m in meta:
        (out / m["slug"]).mkdir(exist_ok=True)
        (out / m["slug"] / "podpis.txt").write_text(m["caption"] + "\n", encoding="utf-8")
    print(len(jobs), "slides →", out / "jobs.json")
    return jobs
