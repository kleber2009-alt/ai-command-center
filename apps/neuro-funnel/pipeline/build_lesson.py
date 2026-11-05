#!/usr/bin/env python3
"""Склеить урок:  python3 build_lesson.py ../lessons/01 [--only 1,2] [--burn]

Берёт <урок>/build/slides/NN.png (render_slides.mjs) и <урок>/build/avatar/NN.mp4 (HeyGen, 9:16) и собирает
<урок>/build/lesson-NN.mp4 1920x1080: экран делится 35/65 — слева аватар (AV_W x 1080, кадр 9:16 по ширине,
обрезка по высоте с отступом CROP_TOP), справа слайд 1248x1080; слайд с "full": true — перебивка на весь кадр
(медленный наезд 1.04→1.10, как в скилле монтажа), звучит голос аватара; пауза PAUSE после сегмента, громкость по EBU R128.
Субтитры — lesson-NN.srt (время по долям текста внутри сегмента, написание — словарь `spell` урока);
--burn прожигает их в видео. --only собирает часть слайдов (пилот).
"""
import argparse, json, re, subprocess, sys
from pathlib import Path

AV_W, SLIDE_W, H = 672, 1248, 1080   # 35 / 65 split of 1920x1080; slides.html renders SLIDE_W x H
CROP_TOP = 0.08                       # share of the leftover height cut above the avatar (0 = keep top, 0.5 = center)
PAUSE = 0.45
FPS = 30


def run(*cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def duration(f: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                         check=True, capture_output=True, text=True).stdout
    return float(out.strip())


def ts(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def respell(text: str, spell: dict) -> str:
    for k, v in sorted(spell.items(), key=lambda kv: -len(kv[0])):
        text = re.sub(rf"(?<![\w]){re.escape(k)}(?![\w])", v, text)
    return text


def cues(say: str, start: float, length: float, spell: dict):
    """Split into ≤ 9-word chunks and spread over the segment by character share."""
    out = []
    for ph in re.split(r"(?<=[.!?])\s+", say.strip()):
        w = ph.split()
        for i in range(0, len(w), 9):
            out.append(" ".join(w[i:i + 9]))
    total = sum(len(c) for c in out) or 1
    t, res = start, []
    for c in out:
        d = length * len(c) / total
        res.append((t, t + d, respell(c, spell)))
        t += d
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("lesson")
    ap.add_argument("--only")
    ap.add_argument("--burn", action="store_true")
    a = ap.parse_args()
    d = Path(a.lesson).resolve()
    lesson = json.loads((d / "lesson.json").read_text())
    b = d / "build"
    seg_dir = b / "segments"
    seg_dir.mkdir(parents=True, exist_ok=True)
    idx = [int(x) for x in a.only.split(",")] if a.only else list(range(1, len(lesson["slides"]) + 1))


    segs, srt, t = [], [], 0.0
    for i in idx:
        nn = f"{i:02}"
        slide, av = b / "slides" / f"{nn}.png", b / "avatar" / f"{nn}.mp4"
        for f in (slide, av):
            if not f.exists():
                sys.exit(f"нет {f}")
        out = seg_dir / f"{nn}.mp4"
        speak = duration(av)
        full = lesson["slides"][i - 1].get("full")
        zc = lesson.get("avatar_crop")  # {"w": share of avatar width kept, "y": top as share of height} — tighter framing
        avcrop = (f"crop=iw*{zc['w']}:iw*{zc['w']}*{H}/{AV_W}:iw*{(1 - zc['w']) / 2}:ih*{zc['y']}," if zc
                  else f"scale={AV_W}:-2,crop={AV_W}:{H}:0:(ih-{H})*{CROP_TOP},")  # cutaway: slide on the whole frame, avatar voice only
        vid = (f"[0:v]fps={FPS},scale=1920:{H},zoompan=z='1.04+0.06*on/({FPS}*{speak + PAUSE:.2f})':d=1:s=1920x{H}:fps={FPS}[st];[st]"
               if full else
               f"[1:v]fps={FPS},{avcrop}scale={AV_W}:{H}[a];"
               f"[0:v]fps={FPS},scale={SLIDE_W}:{H}[s];[a][s]hstack=inputs=2:shortest=1,")
        fc = (vid + f"tpad=stop_mode=clone:stop_duration={PAUSE},format=yuv420p[v];"
              f"[1:a]aresample=48000,apad=pad_dur={PAUSE}[aout]")
        run("ffmpeg", "-y", "-loop", "1", "-i", str(slide), "-i", str(av),
            "-filter_complex", fc, "-map", "[v]", "-map", "[aout]", "-t", f"{speak + PAUSE:.3f}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", str(FPS),
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", str(out))
        srt += cues(lesson["slides"][i - 1]["say"], t, speak, lesson.get("spell", {}))
        t += duration(out)
        segs.append(out)
        print(f"сегмент {nn}: {speak:.1f} с")

    name = f"lesson-{lesson['n']:02}" + ("-pilot" if a.only else "")
    (b / f"{name}.srt").write_text("\n".join(f"{k}\n{ts(s)} --> {ts(e)}\n{txt}\n" for k, (s, e, txt) in enumerate(srt, 1)))
    lst = b / "concat.txt"
    lst.write_text("".join(f"file '{s}'\n" for s in segs))
    final = b / f"{name}.mp4"
    vf = ["-vf", f"subtitles={b / (name + '.srt')}:force_style='FontName=Manrope,FontSize=15,MarginV=36,MarginL=440,MarginR=40,Alignment=2,Outline=1,Shadow=0'"] if a.burn else []
    run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), *vf,
        *(["-c:v", "libx264", "-crf", "20"] if a.burn else ["-c:v", "copy"]),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final))
    print(f"готово: {final} · {duration(final):.1f} с")


if __name__ == "__main__":
    main()
