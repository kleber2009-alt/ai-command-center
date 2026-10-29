#!/usr/bin/env python3
"""Шаг 4. Расшифровать оригинал → transcript.json / transcript.txt в папке задачи

  python3 transcribe.py <slug> [--file <другое видео>] [--engine auto|style|elevenlabs|openai|local]

auto — по очереди, до первого успешного:
  style       stt.py из установленного скилла монтажа (glass / panel / business): движок из профиля автора —
              ElevenLabs Scribe по ключу из профиля оболочки или локально через HyperFrames. Тот же, что у «Студии Кадрика».
  elevenlabs  ELEVENLABS_API_KEY напрямую (Scribe v2 → v1)
  openai      OPENAI_API_KEY, whisper-1 с таймкодами слов
  local       faster-whisper, если установлен (модель WHISPER_MODEL, по умолчанию large-v3-turbo)
Печатает: движок, длительность, слов в секунду, долю речи и кодовое слово из речи (если в подписи его не было).
"""
import argparse, importlib.util, json, os, subprocess, sys, uuid
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # и под python3 -I
from common import FFMPEG, HTTPError, code_word, config, http_json, job_dir, probe, read_json, secret, write_json

STYLE_SKILLS = ("glass-explainer-reel", "explainer-panel-reel", "business-short-form-reels")


def audio_of(src: Path, work: Path) -> Path:
    out = work / f"{src.stem}.16k.wav"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", str(out)], check=True, timeout=300)
    return out


def words_of(raw: list) -> list:
    out = []
    for w in raw or []:
        t = (w.get("text") or w.get("word") or "").strip()
        if t and w.get("type", "word") == "word":
            out.append({"text": t, "start": round(float(w.get("start", 0)), 2), "end": round(float(w.get("end", 0)), 2)})
    return out


def multipart(fields: list, file_field: str, path: Path):
    b = uuid.uuid4().hex
    parts = []
    for k, v in fields:
        parts.append(f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    parts.append(f"--{b}\r\nContent-Disposition: form-data; name=\"{file_field}\"; filename=\"{path.name}\"\r\n"
                 f"Content-Type: audio/wav\r\n\r\n".encode() + path.read_bytes() + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={b}"


def eng_style(audio: Path, lang: str):
    home = Path(os.path.expanduser("~/.claude/skills"))
    for s in STYLE_SKILLS:
        p = home / s / "scripts" / "stt.py"
        if not p.exists():
            continue
        spec = importlib.util.spec_from_file_location("stt_" + s.replace("-", "_"), p)
        m = importlib.util.module_from_spec(spec)
        sys.path.insert(0, str(p.parent))
        spec.loader.exec_module(m)
        fn = getattr(m, "transcribe_studio", None)
        if fn:
            res, note = fn(str(audio), language=lang)
            if note:
                print("NOTE", note)
        else:
            res = m.transcribe(str(audio), language=lang)
        return words_of(res.get("words")), res.get("_engine") or f"stt.py ({s})"
    raise RuntimeError("скиллы монтажа не установлены — их stt.py нет")


def eng_elevenlabs(audio: Path, lang: str):
    key = secret("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("нет ELEVENLABS_API_KEY")
    err = None
    for model in ("scribe_v2", "scribe_v1"):
        body, ct = multipart([("model_id", model), ("language_code", lang), ("timestamps_granularity", "word"),
                              ("tag_audio_events", "false")], "file", audio)
        try:
            d = http_json("https://api.elevenlabs.io/v1/speech-to-text", method="POST", data=body,
                          headers={"xi-api-key": key, "Content-Type": ct}, timeout=600)
            return words_of(d.get("words")), f"elevenlabs {model}"
        except HTTPError as e:
            err = e
    raise RuntimeError(f"ElevenLabs: {err}")


def eng_openai(audio: Path, lang: str):
    key = secret("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("нет OPENAI_API_KEY")
    body, ct = multipart([("model", "whisper-1"), ("language", lang), ("response_format", "verbose_json"),
                          ("timestamp_granularities[]", "word")], "file", audio)
    d = http_json("https://api.openai.com/v1/audio/transcriptions", method="POST", data=body,
                  headers={"Authorization": f"Bearer {key}", "Content-Type": ct}, timeout=600)
    return [{"text": w["word"].strip(), "start": round(w["start"], 2), "end": round(w["end"], 2)} for w in d.get("words", [])], "openai whisper-1"


def eng_local(audio: Path, lang: str):
    import wave
    import numpy as np
    from faster_whisper import WhisperModel
    with wave.open(str(audio)) as w:  # сами читаем 16 кГц моно: декодер faster-whisper (PyAV) ломается на новых версиях av
        pcm = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768.0
    name = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
    try:
        model = WhisperModel(name, device="cpu", compute_type="int8")
    except Exception as e:  # HuggingFace не отдал модель (429, нет сети) — берём ту, что уже скачана
        cached = [m for m in ("large-v3-turbo", "medium", "small", "base") if m != name and _cached(m)]
        if not cached:
            raise
        print(f"NOTE модель {name} не скачалась ({str(e)[:80]}) — беру скачанную {cached[0]}")
        name = cached[0]
        model = WhisperModel(name, device="cpu", compute_type="int8", local_files_only=True)
    segs, _ = model.transcribe(pcm, language=lang, vad_filter=True, word_timestamps=True)
    out = [{"text": w.word.strip(), "start": round(w.start, 2), "end": round(w.end, 2)} for s in segs for w in (s.words or [])]
    return out, f"faster-whisper {name}"


def _cached(name: str) -> bool:
    hub = Path(os.path.expanduser(os.environ.get("HF_HOME", "~/.cache/huggingface"))) / "hub"
    return any(hub.glob(f"models--*--faster-whisper-{name}"))


ENGINES = {"style": eng_style, "elevenlabs": eng_elevenlabs, "openai": eng_openai, "local": eng_local}


def stats(words: list, duration: float) -> dict:
    if not words:
        return {"words": 0, "wps": 0, "speech_ratio": 0}
    talk = 0.0
    for a, b in zip(words, words[1:] + [None]):
        talk += max(a["end"] - a["start"], 0) + (min(b["start"] - a["end"], 0.7) if b and b["start"] > a["end"] else 0)
    return {"words": len(words), "wps": round(len(words) / max(duration, 1), 2), "speech_ratio": round(min(talk / max(duration, 1), 1), 2)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("job")
    ap.add_argument("--file", help="расшифровать другой файл (например, готовый аватар) — в transcript-<имя>.json")
    ap.add_argument("--engine", default="auto", choices=("auto",) + tuple(ENGINES))
    a = ap.parse_args()

    job = job_dir(a.job)
    src = Path(a.file).expanduser() if a.file else job / "sources" / "original.mp4"
    lang = config().get("language", "ru")
    audio = audio_of(src, job / "work")
    order = list(ENGINES) if a.engine == "auto" else [a.engine]
    words, engine, fails = [], "", []
    for e in order:
        try:
            words, engine = ENGINES[e](audio, lang)
            if words:
                break
            fails.append(f"{e}: пусто")
        except (Exception, SystemExit) as x:  # stt.py сообщает о неудаче через SystemExit
            fails.append(f"{e}: {str(x)[:160]}")
    if not words:
        sys.exit("расшифровать не вышло: " + " | ".join(fails))

    dur = probe(src)["duration"]
    text = " ".join(w["text"] for w in words)
    st = stats(words, dur)
    tag = "" if not a.file else "-" + src.stem
    write_json(job / f"transcript{tag}.json", {"engine": engine, "language": lang, "duration": dur, "text": text, "words": words, **st})
    (job / f"transcript{tag}.txt").write_text(text + "\n")
    spoken = code_word(text)
    if not a.file:
        info = read_json(job / "source.json", {})
        info.update(spoken_code=spoken, code=info.get("code") or spoken, **st)
        write_json(job / "source.json", info)
    head = "похоже на говорящую голову" if st["speech_ratio"] >= 0.6 and st["wps"] >= 1.5 else "МАЛО РЕЧИ — вряд ли говорящая голова"
    print(json.dumps({"ok": True, "engine": engine, "duration": dur, **st, "spoken_code": spoken, "verdict": head,
                      "file": str(job / f"transcript{tag}.txt")}, ensure_ascii=False))
    for f in fails:
        print("NOTE не сработал", f)


if __name__ == "__main__":
    main()
