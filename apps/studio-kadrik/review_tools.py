"""Инструменты разбора рилса для Кадрика — отдельный процесс в своём окружении (.review-venv: faster-whisper, Pillow),
чтобы тяжёлые библиотеки не жили в боте.

  python review_tools.py prep <видео> <папка>   → hook.jpg (первые 3 с), sheet.jpg (весь ролик), meta.json, transcript.json
  python review_tools.py card <review.json> <out.jpg>   → карточка 1080×1920 для сторис

Транскрипт — faster-whisper (модель WHISPER_MODEL, по умолчанию large-v3-turbo), только первые 90 с и только если
свободной памяти хватает: сервер общий с монтажом, лучше разбор без текста, чем убитый рендер.
"""
import json, os, re, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FONTS = HERE / "assets" / "fonts"
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or str(Path(FFMPEG).with_name("ffprobe"))
MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
MIN_FREE_MB = int(os.environ.get("WHISPER_MIN_FREE_MB", 1800))
LISTEN_SEC = 90


def run(args, timeout=120):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def probe(src: str) -> dict:
    r = run([FFPROBE, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", src], 60)
    d = json.loads(r.stdout or "{}")
    v = next((s for s in d.get("streams", []) if s.get("codec_type") == "video"), {})
    a = next((s for s in d.get("streams", []) if s.get("codec_type") == "audio"), None)
    num, _, den = (v.get("avg_frame_rate") or "0/1").partition("/")
    rot = int((v.get("tags") or {}).get("rotate", 0) or 0)
    w, h = int(v.get("width", 0)), int(v.get("height", 0))
    if abs(rot) in (90, 270):
        w, h = h, w
    return {"duration": round(float(d.get("format", {}).get("duration", 0) or 0), 2), "width": w, "height": h,
            "fps": round(float(num) / float(den or 1), 2) if float(den or 1) else 0, "audio": bool(a)}


def tile(src: str, times: list, cols: int, out: Path):
    """Кадры в моменты times одной картинкой cols×N, ширина кадра 300."""
    frames = []
    for i, t in enumerate(times):
        f = out.with_name(f".f{i}.jpg")
        run([FFMPEG, "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", src, "-frames:v", "1", "-vf", "scale=300:-2", "-q:v", "4", str(f)], 60)
        if f.exists():
            frames.append(f)
    if not frames:
        return False
    rows = (len(frames) + cols - 1) // cols
    inputs = sum([["-i", str(f)] for f in frames], [])
    pos ="|".join(("+".join(["w0"] * (i % cols)) or "0") + "_" + ("+".join(["h0"] * (i // cols)) or "0") for i in range(len(frames)))
    fl = f"xstack=inputs={len(frames)}:layout={pos}:fill=black" if len(frames) > 1 else "null"
    run([FFMPEG, "-v", "error", "-y", *inputs, "-filter_complex", fl, "-q:v", "4", str(out)], 60)
    for f in frames:
        f.unlink(missing_ok=True)
    return out.exists()


def mem_free_mb() -> int:
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) // 1024
    except OSError:
        pass
    return 1 << 20  # не Linux (Mac) — считаем, что хватает


def transcribe(src: str, work: Path) -> dict:
    if mem_free_mb() < MIN_FREE_MB:
        return {"skipped": "мало свободной памяти на сервере"}
    wav = work / ".audio.wav"
    run([FFMPEG, "-v", "error", "-y", "-i", src, "-t", str(LISTEN_SEC), "-vn", "-ac", "1", "-ar", "16000", str(wav)], 120)
    if not wav.exists():
        return {"skipped": "нет звука"}
    try:
        import wave
        import numpy as np
        from faster_whisper import WhisperModel
        with wave.open(str(wav)) as w:  # сами читаем 16 кГц моно: декодер faster-whisper (PyAV) ломается на новых версиях av
            audio = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768.0
        m = WhisperModel(MODEL, device="cpu", compute_type="int8", cpu_threads=2)
        segs, info = m.transcribe(audio, vad_filter=True, beam_size=1)
        out = {"language": info.language, "segments": [{"start": round(s.start, 1), "end": round(s.end, 1), "text": s.text.strip()} for s in segs]}
    except Exception as e:
        out = {"skipped": f"распознавание не удалось: {e}"[:200]}
    finally:
        wav.unlink(missing_ok=True)
    return out


def loudness(src: str) -> dict:
    r = run([FFMPEG, "-v", "info", "-t", str(LISTEN_SEC), "-i", src, "-af", "volumedetect", "-vn", "-f", "null", "-"], 120)
    g = lambda k: (re.search(rf"{k}:\s*(-?[\d.]+) dB", r.stderr) or [None, None])[1]
    return {"mean_db": float(g("mean_volume")) if g("mean_volume") else None, "max_db": float(g("max_volume")) if g("max_volume") else None}


def prep(src: str, work: str):
    w = Path(work)
    w.mkdir(parents=True, exist_ok=True)
    meta = probe(src)
    d = meta["duration"] or 1
    tile(src, [min(t, max(d - 0.1, 0)) for t in (0.0, 0.8, 1.6, 2.6)], 4, w / "hook.jpg")
    tile(src, [d * (i + 0.5) / 8 for i in range(8)], 4, w / "sheet.jpg")
    if meta["audio"]:
        meta.update(loudness(src))
    (w / "meta.json").write_text(json.dumps(meta, ensure_ascii=False))
    tr = transcribe(src, w) if meta["audio"] else {"skipped": "нет звуковой дорожки"}
    (w / "transcript.json").write_text(json.dumps(tr, ensure_ascii=False))
    print(json.dumps({"ok": True, **meta, "speech": bool(tr.get("segments"))}, ensure_ascii=False))


# ---------- карточка для сторис ----------
COPPER, INK, MUTED, BG = (209, 122, 60), (244, 238, 230), (160, 150, 140), (10, 9, 8)


def font(name: str, size: int, weight: str = ""):
    from PIL import ImageFont
    f = ImageFont.truetype(str(FONTS / name), size)
    if weight:
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
    return f


def wrap(draw, text: str, f, width: int, lines: int) -> list:
    out, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= width:
            cur = t
        else:
            if cur:
                out.append(cur)
            cur = w
    if cur:
        out.append(cur)
    if len(out) > lines:
        out = out[:lines]
        while out[-1] and draw.textlength(out[-1] + "…", font=f) > width:
            out[-1] = out[-1][:-1]
        out[-1] = out[-1].rstrip(" ,.") + "…"
    return out


def card(review: str, out: str):
    from PIL import Image, ImageDraw, ImageFilter
    r = json.loads(Path(review).read_text())
    W, H = 1080, 1920
    img = Image.new("RGB", (W, H), BG)
    glow = Image.new("RGB", (W, H), BG)
    ImageDraw.Draw(glow).ellipse((-200, 260, W + 200, 1250), fill=(92, 48, 22))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(220)), 1.0)
    d = ImageDraw.Draw(img)
    serif, italic = "PlayfairDisplay-Upright.ttf", "PlayfairDisplay-Italic.ttf"
    sans = "Inter.ttf"
    x = 96
    d.ellipse((x, 214, x + 14, 228), fill=COPPER)
    d.text((x + 30, 204), "РАЗБОР РИЛСА · КАДРИК", font=font(sans, 34, "SemiBold"), fill=COPPER)
    d.text((x, 290), "Мой рилс", font=font(serif, 104), fill=INK)
    d.text((x, 410), "у Кадрика", font=font(italic, 104), fill=COPPER)
    score = f"{float(r.get('score', 0)):.1f}".replace(".", ",")
    fs = font(serif, 330)
    d.text((x - 10, 540), score, font=fs, fill=INK)
    sw = d.textlength(score, font=fs)
    d.text((x + sw + 10, 760), "/10", font=font(italic, 110), fill=COPPER)
    y = 970
    for line in wrap(d, r.get("verdict", ""), font(sans, 46), W - 2 * x, 3):
        d.text((x, y), line, font=font(sans, 46), fill=INK)
        y += 64
    y = max(y + 40, 1200)
    for key, label in (("hook", "Хук"), ("pace", "Темп"), ("subs", "Субтитры")):
        v = max(0, min(10, int((r.get(key) or {}).get("score", 0))))
        d.text((x, y), label, font=font(sans, 40, "Medium"), fill=MUTED)
        d.text((W - x - 70, y), f"{v}/10", font=font(sans, 40, "SemiBold"), fill=INK)
        d.rounded_rectangle((x, y + 66, W - x, y + 82), 8, fill=(40, 36, 32))
        d.rounded_rectangle((x, y + 66, x + max(16, (W - 2 * x) * v // 10), y + 82), 8, fill=COPPER)
        y += 136
    d.rounded_rectangle((x, H - 250, W - x, H - 130), 60, fill=COPPER)
    t = "Разбери свой → @studio_kadrik_bot"
    ft = font(sans, 42, "SemiBold")
    d.text(((W - d.textlength(t, font=ft)) / 2, H - 215), t, font=ft, fill=BG)
    img.save(out, "JPEG", quality=88)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "prep" and len(sys.argv) == 4:
        prep(sys.argv[2], sys.argv[3])
    elif cmd == "card" and len(sys.argv) == 4:
        card(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
