#!/usr/bin/env python3
"""Субтитры урока по реальной речи аватара:  python3 subtitles.py ../lessons/vsl [--only 1,2,...]

Для каждого сегмента: faster-whisper (word timestamps) по build/avatar/NN.mp4 → слова сценария `say`
(с написанием из `spell`) получают время ближайших распознанных слов (выравнивание difflib), так что текст —
сценарный, без ошибок распознавания, а тайминг — по губам. Время в ролике = сумма длин сегментов
build/segments/*.mp4 (как склеил build_lesson.py).

Стиль — скилл «Монтаж длинного видео ютуб» §3.5: Montserrat ExtraBold, одна строка по 3–4 слова, разрыв на
. ? ! , и паузе > 0.6 с, цвет #F1F0F4, без обводки, мягкая тень, акцент #4FB2F0 на числах (и словах из ACCENT).
Пишет build/lesson-NN.ass и build/lesson-NN.srt; --burn — ещё build/lesson-NN-subs.mp4 (субтитры в кадре,
шрифт из pipeline/fonts). Запускать после build_lesson.py.
"""
import argparse, difflib, json, re, subprocess
from pathlib import Path

import numpy as np

MAX_WORDS, GAP = 4, 0.6
ACCENT = {"нейроворонка", "нейроворонкой", "нейроворонке", "claude", "heygen", "ии-агент", "ии-агентов", "миллион", "миллионов",
          "двести", "продаж", "оплаты", "оплата", "бесплатно", "кодовое", "директ"}


def norm(w):
    return re.sub(r"[^\wё-]", "", w.lower().replace("ё", "е"))


def duration(f):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                                capture_output=True, text=True, check=True).stdout)


def recognize(model, f):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    segs, _ = model.transcribe(audio, language="ru", word_timestamps=True, vad_filter=False)
    return [(w.word.strip(), w.start, w.end) for s in segs for w in s.words or []]


def respell(text, spell):
    for k, v in sorted(spell.items(), key=lambda kv: -len(kv[0])):
        text = re.sub(rf"(?<![\w]){re.escape(k)}(?![\w])", v, text)
    return text


def align(script_words, rec):
    """Give each script word (start, end) from recognized words; interpolate the gaps."""
    a, b = [norm(w) for w in script_words], [norm(w) for w, _, _ in rec]
    times = [None] * len(a)
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            times[blk.a + k] = (rec[blk.b + k][1], rec[blk.b + k][2])
    end_all = rec[-1][2] if rec else 1.0
    for i, t in enumerate(times):
        if t is None:
            prev = next((times[j][1] for j in range(i - 1, -1, -1) if times[j]), 0.0)
            nxt_i = next((j for j in range(i + 1, len(a)) if times[j]), None)
            nxt = times[nxt_i][0] if nxt_i is not None else end_all
            n = (nxt_i if nxt_i is not None else len(a)) - i
            step = max((nxt - prev) / (n + 1), 0.05)
            times[i] = (prev + step * 0.2, prev + step)
    return times


def lines(words, times):
    out, cur = [], []
    for i, (w, t) in enumerate(zip(words, times)):
        cur.append((w, t))
        nxt_gap = times[i + 1][0] - t[1] if i + 1 < len(times) else 9
        if len(cur) >= MAX_WORDS or re.search(r"[.?!,—:]$", w) or nxt_gap > GAP:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def ass_time(t):
    cs = int(round(t * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}"


def srt_time(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def word_ass(w):
    clean = w.rstrip(".,!?:;—").strip()
    if not clean:
        return ""
    accent = bool(re.search(r"\d", clean)) or norm(clean) in ACCENT
    return "{\\c&HF0B24F&}" + clean + "{\\c&HF4F0F1&}" if accent else clean


HEAD = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Montserrat ExtraBold,72,&H00F4F0F1,&H00F4F0F1,&H00000000,&H9E000000,0,0,0,0,100,100,-1,0,1,0,3,2,170,170,118,204

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("lesson")
    ap.add_argument("--only")
    ap.add_argument("--model", default="small")
    ap.add_argument("--burn", action="store_true")
    a = ap.parse_args()
    d = Path(a.lesson).resolve()
    lesson = json.loads((d / "lesson.json").read_text())
    b = d / "build"
    idx = [int(x) for x in a.only.split(",")] if a.only else list(range(1, len(lesson["slides"]) + 1))
    from faster_whisper import WhisperModel  # noqa: PLC0415
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    events, t0 = [], 0.0
    for i in idx:
        nn = f"{i:02}"
        say = re.sub(r"<[^>]+>", " ", lesson["slides"][i - 1]["say"])
        words = respell(say, lesson.get("spell", {})).split()
        rec = recognize(model, b / "avatar" / f"{nn}.mp4")
        times = align(words, rec)
        for ln in lines(words, times):
            s, e = ln[0][1][0], ln[-1][1][1] + 0.30
            events.append([t0 + s, t0 + e, ln, 170 if lesson["slides"][i - 1].get("full") else 712])  # split: center under the slide
        t0 += duration(b / "segments" / f"{nn}.mp4")
        print(f"сегмент {nn}: {len(rec)} слов распознано, {len(words)} в сценарии")
    for k in range(len(events) - 1):          # line ends no later than the next one starts
        events[k][1] = min(events[k][1], events[k + 1][0])
    name = f"lesson-{lesson['n']:02}" + ("-pilot" if a.only else "")
    ass = [HEAD] + [f"Dialogue: 0,{ass_time(s)},{ass_time(e)},Sub,,{ml},0,0,,{' '.join(filter(None, (word_ass(w) for w, _ in ln)))}"
                    for s, e, ln, ml in events]
    (b / f"{name}.ass").write_text("\n".join(ass) + "\n")
    srt = [f"{k}\n{srt_time(s)} --> {srt_time(e)}\n{' '.join(w.rstrip(',') for w, _ in ln)}\n" for k, (s, e, ln, _) in enumerate(events, 1)]
    (b / f"{name}.srt").write_text("\n".join(srt))
    print(f"субтитры: {b / name}.ass · {len(events)} строк")
    if a.burn:
        fonts = Path(__file__).resolve().parent / "fonts"
        out = b / f"{name}-subs.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(b / f"{name}.mp4"), "-vf",
                        f"ass={b / (name + '.ass')}:fontsdir={fonts}", "-c:v", "libx264", "-crf", "18", "-preset", "medium",
                        "-c:a", "copy", "-movflags", "+faststart", str(out)], check=True)
        print(f"с субтитрами: {out}")


if __name__ == "__main__":
    main()
