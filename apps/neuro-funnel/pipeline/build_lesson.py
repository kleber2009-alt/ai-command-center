#!/usr/bin/env python3
"""Склеить урок:  python3 build_lesson.py ../lessons/01 [--only 1,2] [--burn]

Берёт <урок>/build/slides/NN.png (render_slides.mjs) и <урок>/build/avatar/NN.mp4 (HeyGen, 9:16) и собирает
<урок>/build/lesson-NN.mp4 1920x1080: слайд на всю длину своего сегмента, аватар в круге справа внизу
(геометрия — как .av в slides.html), пауза PAUSE после сегмента, громкость по EBU R128.
Субтитры — lesson-NN.srt (время по долям текста внутри сегмента, написание — словарь `spell` урока);
--burn прожигает их в видео. --only собирает часть слайдов (пилот).
"""
import argparse, json, re, subprocess, sys
from pathlib import Path

AV_X, AV_Y, AV_D = 1410, 590, 400   # same as .av in slides.html
CROP_W, CROP_TOP = 0.72, 0.11         # square crop of the 9:16 avatar: side = CROP_W of its width, top at CROP_TOP of its height
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

    mask = b / "mask.png"
    if not mask.exists():
        r = AV_D / 2
        run("ffmpeg", "-y", "-f", "lavfi", "-i", f"color=black:s={AV_D}x{AV_D}", "-vf",
            f"format=gray,geq=lum='if(lte((X-{r})*(X-{r})+(Y-{r})*(Y-{r}),{(r-1)**2}),255,0)'", "-frames:v", "1", str(mask))

    segs, srt, t = [], [], 0.0
    for i in idx:
        nn = f"{i:02}"
        slide, av = b / "slides" / f"{nn}.png", b / "avatar" / f"{nn}.mp4"
        for f in (slide, av):
            if not f.exists():
                sys.exit(f"нет {f}")
        out = seg_dir / f"{nn}.mp4"
        speak = duration(av)
        fc = (f"[1:v]fps={FPS},crop=iw*{CROP_W}:iw*{CROP_W}:iw*{(1-CROP_W)/2}:ih*{CROP_TOP},scale={AV_D}:{AV_D},format=rgba[a];"
              f"[2:v]format=gray,scale={AV_D}:{AV_D}[m];[a][m]alphamerge[c];"
              f"[0:v]fps={FPS},format=rgba[s];[s][c]overlay={AV_X}:{AV_Y}:shortest=1,"
              f"tpad=stop_mode=clone:stop_duration={PAUSE},format=yuv420p[v];"
              f"[1:a]aresample=48000,apad=pad_dur={PAUSE}[aout]")
        run("ffmpeg", "-y", "-loop", "1", "-i", str(slide), "-i", str(av), "-loop", "1", "-i", str(mask),
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
    vf = ["-vf", f"subtitles={b / (name + '.srt')}:force_style='FontName=Manrope,FontSize=15,MarginV=40,MarginL=120,MarginR=560,Alignment=1,Outline=1,Shadow=0'"] if a.burn else []
    run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), *vf,
        *(["-c:v", "libx264", "-crf", "20"] if a.burn else ["-c:v", "copy"]),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final))
    print(f"готово: {final} · {duration(final):.1f} с")


if __name__ == "__main__":
    main()
