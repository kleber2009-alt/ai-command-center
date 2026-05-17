"""
Batch-транскрибатор твоих подкастов через faster-whisper.

Использование:
    cd ~/ai-sales-system/code
    source venv/bin/activate
    python -m utils.voice_transcribe                     # обработать всё в voice-input/audio/
    python -m utils.voice_transcribe --file pod-01.mp3   # один файл
    python -m utils.voice_transcribe --model small       # модель (tiny|base|small|medium|large-v3)
    python -m utils.voice_transcribe --lang en           # язык (default: ru)

Что делает:
- читает все аудио из voice-input/audio/
- транскрибирует каждый файл через faster-whisper (локально, без интернета после первого запуска)
- сохраняет .txt (plain text) + .srt (с таймкодами) в voice-input/transcripts/
- пропускает файлы которые уже обработаны (resumable)

Модели и качество:
    tiny     ~75MB    очень быстро, средне на русском
    base     ~150MB   быстро, ок на русском
    small    ~500MB   баланс — рекомендую для пробы
    medium   ~1.5GB   точно для русского, медленнее (default)
    large-v3 ~3GB     максимум точности, медленно
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[2]  # ai-sales-system/
AUDIO_DIR = ROOT / "voice-input" / "audio"
TRANSCRIPTS_DIR = ROOT / "voice-input" / "transcripts"

AUDIO_EXTENSIONS = {".mp3", ".m4a", ".mp4", ".ogg", ".oga", ".wav", ".flac", ".webm", ".aac"}


def find_audio_files(audio_dir: Path) -> list[Path]:
    if not audio_dir.exists():
        return []
    return sorted(
        p for p in audio_dir.rglob("*")
        if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS
    )


def already_done(audio_path: Path, transcripts_dir: Path) -> bool:
    txt = transcripts_dir / (audio_path.stem + ".txt")
    return txt.exists() and txt.stat().st_size > 0


def _format_timestamp(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def transcribe_one(audio_path: Path, model, language: str, transcripts_dir: Path) -> dict:
    """Транскрибировать один файл. Возвращает summary dict."""
    print(f"\n→ {audio_path.name}")
    start = time.time()

    segments_gen, info = model.transcribe(
        str(audio_path),
        language=language,
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )

    # Собрать сегменты в список
    segments = []
    for seg in segments_gen:
        segments.append({"start": seg.start, "end": seg.end, "text": seg.text.strip()})
        # Прогресс — показываем каждые 60с
        if int(seg.end) % 60 == 0 and int(seg.start) % 60 != 0:
            elapsed = time.time() - start
            speed = seg.end / elapsed if elapsed else 0
            print(f"  ... {int(seg.end)}s обработано · {speed:.2f}x realtime")

    elapsed = time.time() - start
    duration = info.duration if info else (segments[-1]["end"] if segments else 0)
    speed = duration / elapsed if elapsed else 0

    # Сохранить .txt (plain text, чистая транскрипция)
    txt_path = transcripts_dir / (audio_path.stem + ".txt")
    plain = "\n\n".join(s["text"] for s in segments)
    txt_path.write_text(plain, encoding="utf-8")

    # Сохранить .srt (с таймкодами для субтитров)
    srt_lines = []
    for i, s in enumerate(segments, 1):
        srt_lines.append(str(i))
        srt_lines.append(f"{_format_timestamp(s['start'])} --> {_format_timestamp(s['end'])}")
        srt_lines.append(s["text"])
        srt_lines.append("")
    srt_path = transcripts_dir / (audio_path.stem + ".srt")
    srt_path.write_text("\n".join(srt_lines), encoding="utf-8")

    # Сохранить .json (полная инфа — пригодится для анализа)
    json_path = transcripts_dir / (audio_path.stem + ".json")
    json_path.write_text(
        json.dumps(
            {
                "source": audio_path.name,
                "language": language,
                "duration_seconds": duration,
                "elapsed_seconds": elapsed,
                "realtime_speed": speed,
                "segments_count": len(segments),
                "segments": segments,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(
        f"✓ {audio_path.name}: {len(segments)} сегментов, "
        f"{duration:.0f}s аудио → {elapsed:.0f}s обработки ({speed:.2f}x realtime)"
    )

    return {
        "file": audio_path.name,
        "segments": len(segments),
        "duration_s": duration,
        "elapsed_s": elapsed,
        "speed_x": speed,
        "txt": str(txt_path),
    }


def main():
    parser = argparse.ArgumentParser(description="Batch voice transcription via faster-whisper")
    parser.add_argument("--file", help="Один конкретный файл из voice-input/audio/")
    parser.add_argument(
        "--model",
        default="medium",
        choices=["tiny", "base", "small", "medium", "large-v2", "large-v3"],
        help="Модель whisper (default: medium)",
    )
    parser.add_argument("--lang", default="ru", help="Язык (default: ru)")
    parser.add_argument("--force", action="store_true", help="Перетранскрибировать даже если .txt уже есть")
    parser.add_argument("--compute-type", default="int8", help="int8 (default) / int8_float16 / float16")
    args = parser.parse_args()

    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

    # Определить список файлов
    if args.file:
        target = AUDIO_DIR / args.file
        if not target.exists():
            print(f"✕ Файл не найден: {target}", file=sys.stderr)
            sys.exit(1)
        files = [target]
    else:
        files = find_audio_files(AUDIO_DIR)

    if not files:
        print(
            f"⚠ Нет аудиофайлов в {AUDIO_DIR}.\n"
            f"  Положи .mp3/.m4a/.mp4/.ogg/.wav файлы туда и запусти снова.",
            file=sys.stderr,
        )
        sys.exit(0)

    # Отфильтровать уже сделанные
    if not args.force:
        before = len(files)
        files = [f for f in files if not already_done(f, TRANSCRIPTS_DIR)]
        skipped = before - len(files)
        if skipped:
            print(f"⊘ Пропущено {skipped} уже транскрибированных файлов (флаг --force чтобы перезаписать)")

    if not files:
        print("✓ Всё уже транскрибировано.")
        return

    print(f"→ Обрабатываю {len(files)} файлов через модель `{args.model}` ({args.lang})")
    print(f"  (первый запуск скачает модель — может занять 5-15 минут)\n")

    # Загрузить модель
    from faster_whisper import WhisperModel  # type: ignore

    print(f"… загружаю модель {args.model} (compute_type={args.compute_type}) ...")
    t0 = time.time()
    model = WhisperModel(args.model, device="cpu", compute_type=args.compute_type)
    print(f"  Модель загружена за {time.time() - t0:.1f}s\n")

    # Транскрибировать
    results = []
    for f in files:
        try:
            r = transcribe_one(f, model, args.lang, TRANSCRIPTS_DIR)
            results.append(r)
        except Exception as e:
            print(f"✕ Ошибка на {f.name}: {e}", file=sys.stderr)

    # Итог
    print("\n" + "=" * 60)
    print(f"ГОТОВО: {len(results)} файлов транскрибировано")
    total_dur = sum(r["duration_s"] for r in results)
    total_elapsed = sum(r["elapsed_s"] for r in results)
    print(f"Аудио общая: {total_dur / 60:.1f} мин")
    print(f"Время обработки: {total_elapsed / 60:.1f} мин")
    if total_elapsed:
        print(f"Средняя скорость: {total_dur / total_elapsed:.2f}x realtime")
    print(f"\n→ Транскрипты в: {TRANSCRIPTS_DIR}")
    print("\nДальше: напиши Claude «транскрипты готовы» — он проанализирует.")


if __name__ == "__main__":
    main()
