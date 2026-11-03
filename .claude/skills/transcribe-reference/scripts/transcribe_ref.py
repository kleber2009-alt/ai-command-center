#!/usr/bin/env python3
"""Транскрибатор офиса: ссылка на ролик (Instagram, YouTube, TikTok, VK…) или файл → расшифровка речи.

  python3 transcribe_ref.py <ссылка или файл> [<ссылка или файл> …] --out <папка> [--lang ru|auto]

На каждый источник в папке --out:
  transcript-<n>.md    заголовок, автор, подпись, ссылка, цифры, движок и сам текст (для людей и агентов)
  transcript-<n>.json  то же + слова с таймкодами
Последней строкой печатает JSON: {"ok": true, "items": [...]} или {"ok": false, "error": "..."}.

Скачивание: yt-dlp (бинарь или модуль python), для Instagram запасной путь — Apify (APIFY_TOKEN).
Расшифровка, до первого успешного: ElevenLabs Scribe (ELEVENLABS_API_KEY) → OpenAI whisper-1
(OPENAI_API_KEY) → stt.py установленного скилла монтажа → faster-whisper, если установлен.
Ключи — из окружения или из ~/.bashrc / ~/.profile / ~/.zshrc (как у remake-top-reel). Только стандартная библиотека.
"""
import argparse
import importlib.util
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import uuid
from pathlib import Path

RC = (".zshrc", ".zprofile", ".zshenv", ".bash_profile", ".bashrc", ".profile")
MEDIA = (".mp4", ".mov", ".webm", ".mkv", ".m4v", ".mp3", ".m4a", ".wav", ".ogg", ".oga", ".opus", ".aac", ".flac")
STYLE_SKILLS = ("glass-explainer-reel", "explainer-panel-reel", "business-short-form-reels")


def keys_file():
    p = Path(os.path.expanduser(os.environ.get("HQ_KEYS_FILE", "~/hq-runner/keys.env")))
    out = {}
    if p.exists():
        for line in p.read_text(errors="ignore").splitlines():
            m = re.match(r"\s*([A-Z0-9_]+)=(.*)$", line)
            if m:
                out[m.group(1)] = m.group(2).strip().strip("'\"")
    return out


def secret(name):
    v = (os.environ.get(name) or keys_file().get(name) or "").strip().strip("'\"")
    if v:
        return v
    for rc in RC:
        p = Path.home() / rc
        if not p.exists():
            continue
        last = ""
        try:
            for line in p.read_text(errors="ignore").splitlines():
                m = re.match(rf"\s*(?:export\s+)?{name}=(.*)", line)
                if m:
                    last = m.group(1).strip()
        except OSError:
            continue
        if last[:1] in ("'", '"'):
            end = last.find(last[0], 1)
            last = last[1:end] if end > 0 else last[1:]
        else:
            last = re.split(r"[\s;#]", last, maxsplit=1)[0]
        if last and not last.startswith(("$", "`")):
            return last
    return ""


def _ctx():
    for f in (os.environ.get("SSL_CERT_FILE"), os.environ.get("REQUESTS_CA_BUNDLE"), "/etc/ssl/cert.pem"):
        if f and os.path.exists(f):
            return ssl.create_default_context(cafile=f)
    return ssl.create_default_context()


def http(url, method="GET", headers=None, data=None, timeout=120):
    req = urllib.request.Request(url, data=data, method=method, headers={"User-Agent": "aicex-hq-transcriber", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ctx()) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read()[:300].decode('utf-8', 'replace')}") from None


def say(text):
    print("STEP " + text, flush=True)


# ---------- 1. скачать ----------

def ytdlp_cmd():
    if shutil.which("yt-dlp"):
        return ["yt-dlp"]
    if importlib.util.find_spec("yt_dlp"):
        return [sys.executable, "-m", "yt_dlp"]
    return None


def fetch(url, work):
    """Ссылка → (файл, мета). Сначала yt-dlp, для Instagram запасной Apify."""
    tried = []
    cmd = ytdlp_cmd()
    if cmd:
        args = cmd + ["--no-playlist", "--no-progress", "--no-warnings", "-f", "b[ext=mp4]/bv*+ba/b", "--merge-output-format", "mp4",
                      "--max-filesize", "700M", "--write-info-json", "-o", str(work / "dl.%(ext)s")]
        cookies = Path(os.path.expanduser(os.environ.get("YTDLP_COOKIES", "~/.config/yt-dlp/cookies.txt")))
        if cookies.exists():
            args += ["--cookies", str(cookies)]
        r = subprocess.run(args + ["--", url], capture_output=True, text=True, timeout=900)
        got = next((f for f in sorted(work.iterdir()) if f.name.startswith("dl.") and f.suffix.lower() in MEDIA), None)
        if got:
            info = {}
            try:
                info = json.loads((work / "dl.info.json").read_text())
            except (OSError, ValueError):
                pass
            return got, {"via": "yt-dlp", "title": info.get("title") or "", "caption": info.get("description") or "",
                         "author": info.get("uploader") or info.get("channel") or "", "views": info.get("view_count"),
                         "likes": info.get("like_count"), "comments": info.get("comment_count"), "duration": info.get("duration")}
        err = (re.search(r"ERROR:[^\n]*", r.stderr or "") or [((r.stderr or "").strip().split("\n") or ["не вышло"])[-1]])[0]
        tried.append("yt-dlp: " + str(err)[:200])
    else:
        tried.append("yt-dlp не установлен")
    token = secret("APIFY_TOKEN")
    if "instagram.com/" in url and token:
        try:
            body = json.dumps({"directUrls": [url], "resultsType": "details", "resultsLimit": 1}).encode()
            items = json.loads(http(f"https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token={token}&timeout=120",
                                    "POST", {"content-type": "application/json"}, body, timeout=180))
            it = (items or [{}])[0] if isinstance(items, list) else {}
            if it.get("videoUrl"):
                dest = work / "dl.mp4"
                dest.write_bytes(http(it["videoUrl"], timeout=600))
                return dest, {"via": "apify", "title": "", "caption": it.get("caption") or "", "author": it.get("ownerUsername") or "",
                              "views": it.get("videoPlayCount") or it.get("videoViewCount"), "likes": it.get("likesCount"),
                              "comments": it.get("commentsCount"), "duration": it.get("videoDuration")}
            tried.append("Apify: в ответе нет видео (это карусель или фото?)")
        except Exception as e:  # noqa: BLE001 — любая ошибка Apify идёт в отчёт
            tried.append("Apify: " + str(e)[:200])
    raise RuntimeError("по ссылке не скачалось (" + "; ".join(tried) + "). Пришлите видео файлом.")


# ---------- 2. расшифровать ----------

def audio_of(src, work):
    if not shutil.which("ffmpeg"):
        return src  # ElevenLabs и OpenAI примут и видео
    out = work / "audio.16k.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", str(out)], check=True, timeout=600)
    return out


def multipart(fields, path):
    b = uuid.uuid4().hex
    parts = [f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode() for k, v in fields]
    parts.append(f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\n"
                 f"Content-Type: application/octet-stream\r\n\r\n".encode() + path.read_bytes() + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={b}"


def words_of(raw):
    out = []
    for w in raw or []:
        t = (w.get("text") or w.get("word") or "").strip()
        if t and w.get("type", "word") == "word":
            out.append({"text": t, "start": round(float(w.get("start", 0)), 2), "end": round(float(w.get("end", 0)), 2)})
    return out


def eng_elevenlabs(audio, lang):
    key = secret("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("нет ELEVENLABS_API_KEY")
    err = None
    for model in ("scribe_v2", "scribe_v1"):
        fields = [("model_id", model), ("timestamps_granularity", "word"), ("tag_audio_events", "false")]
        if lang != "auto":
            fields.append(("language_code", lang))
        body, ct = multipart(fields, audio)
        try:
            d = json.loads(http("https://api.elevenlabs.io/v1/speech-to-text", "POST", {"xi-api-key": key, "Content-Type": ct}, body, timeout=900))
            return d.get("text", "").strip(), words_of(d.get("words")), f"ElevenLabs {model.replace('_', ' ')}", d.get("language_code") or ""
        except RuntimeError as e:
            err = e
            if "HTTP 401" in str(e):
                break
    raise RuntimeError(f"ElevenLabs: {err}")


def eng_openai(audio, lang):
    key = secret("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("нет OPENAI_API_KEY")
    fields = [("model", "whisper-1"), ("response_format", "verbose_json"), ("timestamp_granularities[]", "word")]
    if lang != "auto":
        fields.append(("language", lang))
    body, ct = multipart(fields, audio)
    d = json.loads(http("https://api.openai.com/v1/audio/transcriptions", "POST", {"Authorization": f"Bearer {key}", "Content-Type": ct}, body, timeout=900))
    words = [{"text": w["word"].strip(), "start": round(w["start"], 2), "end": round(w["end"], 2)} for w in d.get("words", [])]
    return d.get("text", "").strip(), words, "OpenAI whisper-1", d.get("language") or ""


def eng_style(audio, lang):
    home = Path.home() / ".claude/skills"
    for s in STYLE_SKILLS:
        p = home / s / "scripts" / "stt.py"
        if not p.exists():
            continue
        spec = importlib.util.spec_from_file_location("stt_" + s.replace("-", "_"), p)
        m = importlib.util.module_from_spec(spec)
        sys.path.insert(0, str(p.parent))
        spec.loader.exec_module(m)
        fn = getattr(m, "transcribe_studio", None)
        res = fn(str(audio), language=None if lang == "auto" else lang)[0] if fn else m.transcribe(str(audio), language=None if lang == "auto" else lang)
        words = words_of(res.get("words"))
        return " ".join(w["text"] for w in words), words, res.get("_engine") or f"stt.py ({s})", lang
    raise RuntimeError("скиллы монтажа со stt.py не установлены")


def eng_local(audio, lang):
    from faster_whisper import WhisperModel  # noqa: PLC0415 — необязательная зависимость
    name = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
    segs, info = WhisperModel(name, device="cpu", compute_type="int8").transcribe(
        str(audio), language=None if lang == "auto" else lang, vad_filter=True, word_timestamps=True)
    words = [{"text": w.word.strip(), "start": round(w.start, 2), "end": round(w.end, 2)} for s in segs for w in (s.words or [])]
    return " ".join(w["text"] for w in words), words, f"faster-whisper {name}", getattr(info, "language", lang)


ENGINES = (eng_elevenlabs, eng_openai, eng_style, eng_local)


def transcribe(audio, lang):
    fails = []
    for e in ENGINES:
        try:
            text, words, engine, language = e(audio, lang)
            if text:
                return text, words, engine, language
            fails.append(f"{e.__name__[4:]}: пусто")
        except (Exception, SystemExit) as x:  # noqa: BLE001 — stt.py сообщает о неудаче через SystemExit
            fails.append(f"{e.__name__[4:]}: {str(x)[:160]}")
    raise RuntimeError("расшифровать не вышло: " + " | ".join(fails))


# ---------- 3. оформить ----------

def paragraphs(words, text):
    """Текст абзацами по паузам речи (≥1,2 с) — читать удобнее, чем одну строку."""
    if not words:
        return text
    out, cur = [], []
    for a, b in zip(words, words[1:] + [None]):
        cur.append(a["text"])
        if b is None or b["start"] - a["end"] >= 1.2 or (len(cur) > 60 and a["text"][-1:] in ".!?"):
            out.append(" ".join(cur))
            cur = []
    return "\n\n".join(out)


def fmt_n(n):
    return "—" if n in (None, "") else f"{int(n):,}".replace(",", " ")


def render_md(i, src, meta, text, words, engine, language):
    dur = meta.get("duration") or (words[-1]["end"] if words else 0)
    lines = [f"# Расшифровка {i}: {meta.get('title') or meta.get('author') or Path(src).name}", "",
             f"- Источник: {src}"]
    if meta.get("author"):
        lines.append(f"- Автор: {meta['author']}")
    if any(meta.get(k) is not None for k in ("views", "likes", "comments")):
        lines.append(f"- Цифры: просмотры {fmt_n(meta.get('views'))} · лайки {fmt_n(meta.get('likes'))} · комментарии {fmt_n(meta.get('comments'))}")
    lines += [f"- Длительность: {float(dur or 0):.0f} с · слов: {len(text.split())} · язык: {language or '—'}", f"- Расшифровал: {engine}"]
    if meta.get("caption"):
        lines += ["", "## Подпись к публикации", "", meta["caption"].strip()]
    lines += ["", "## Текст ролика", "", paragraphs(words, text), ""]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sources", nargs="+")
    ap.add_argument("--out", required=True)
    ap.add_argument("--lang", default=os.environ.get("TRANSCRIBE_LANG", "auto"))
    a = ap.parse_args()
    out = Path(a.out).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    items, errors = [], []
    for i, src in enumerate(a.sources[:5], 1):
        work = Path(tempfile.mkdtemp(prefix="transcribe-"))
        try:
            if re.match(r"^https?://", src):
                say(f"Скачивает ролик {i}: {src[:80]}")
                media, meta = fetch(src, work)
            else:
                media, meta = Path(src).expanduser(), {"via": "file", "title": Path(src).stem}
                if not media.exists():
                    raise RuntimeError(f"нет файла {src}")
            say(f"Расшифровывает речь ролика {i}")
            text, words, engine, language = transcribe(audio_of(media, work), a.lang)
            md = render_md(i, src, meta, text, words, engine, language)
            (out / f"transcript-{i}.md").write_text(md, encoding="utf-8")
            (out / f"transcript-{i}.json").write_text(json.dumps({"source": src, **meta, "engine": engine, "language": language,
                                                                  "text": text, "words": words}, ensure_ascii=False, indent=1), encoding="utf-8")
            items.append({"n": i, "source": src, "title": meta.get("title") or "", "author": meta.get("author") or "",
                          "words": len(text.split()), "engine": engine, "file": f"transcript-{i}.md", "preview": text[:280]})
            say(f"Ролик {i}: {len(text.split())} слов ({engine})")
        except Exception as e:  # noqa: BLE001 — один источник не валит остальные
            errors.append(f"{src[:80]}: {str(e)[:300]}")
        finally:
            shutil.rmtree(work, ignore_errors=True)
    print(json.dumps({"ok": bool(items), "items": items, "errors": errors, **({} if items else {"error": "; ".join(errors)})}, ensure_ascii=False))
    sys.exit(0 if items else 1)


if __name__ == "__main__":
    main()
