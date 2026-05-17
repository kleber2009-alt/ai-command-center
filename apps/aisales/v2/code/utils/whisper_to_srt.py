"""
Whisper API → SRT генератор для субтитров.

Usage:
    python -m utils.whisper_to_srt input.mp4
    python -m utils.whisper_to_srt input.mp4 --lang ru --out subtitles.srt

Получаемый SRT-файл можно:
1. Загрузить в Submagic / Captions / Veed как импорт субтитров
2. Подмонтировать ffmpeg'ом: ffmpeg -i video.mp4 -vf subtitles=subtitles.srt out.mp4
3. Использовать в YouTube напрямую
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import timedelta
from pathlib import Path


def _format_timestamp(seconds: float) -> str:
    """SRT format: HH:MM:SS,mmm"""
    td = timedelta(seconds=seconds)
    total = int(td.total_seconds())
    h, m, s = total // 3600, (total % 3600) // 60, total % 60
    ms = int((seconds - total) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def segments_to_srt(segments: list[dict]) -> str:
    """
    Преобразовать список сегментов Whisper в SRT-строку.
    Каждый segment: {start: float, end: float, text: str}
    """
    lines: list[str] = []
    for i, seg in enumerate(segments, 1):
        lines.append(str(i))
        lines.append(f"{_format_timestamp(seg['start'])} --> {_format_timestamp(seg['end'])}")
        lines.append(seg["text"].strip())
        lines.append("")
    return "\n".join(lines)


def transcribe(audio_path: Path, language: str = "ru") -> list[dict]:
    """
    Транскрипция через OpenAI Whisper API.
    Возвращает список сегментов.
    """
    if os.getenv("AISALES_MOCK", "0") == "1":
        # Мок-сегменты для теста
        return [
            {"start": 0.0, "end": 2.5, "text": "Я уволил четырёх продажников."},
            {"start": 2.5, "end": 5.0, "text": "И за два месяца вырос на тридцать процентов."},
            {"start": 5.0, "end": 10.0, "text": "Сейчас расскажу как — и сразу спойлер: дело не в AI."},
            {"start": 10.0, "end": 15.0, "text": "Дело в том, что я понял три вещи про продажи."},
        ]

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set. Export it or use --mock for testing.")

    try:
        from openai import OpenAI  # type: ignore
    except ImportError:
        raise RuntimeError("`pip install openai` required for real transcription")

    client = OpenAI(api_key=api_key)
    with audio_path.open("rb") as f:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            language=language,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )

    return [
        {"start": s.start, "end": s.end, "text": s.text}
        for s in response.segments  # type: ignore
    ]


def main():
    parser = argparse.ArgumentParser(description="Whisper → SRT generator")
    parser.add_argument("input", help="Audio/video file (mp3/mp4/m4a/wav)")
    parser.add_argument("--lang", default="ru", help="Language code (default: ru)")
    parser.add_argument("--out", help="Output SRT path (default: same name .srt)")
    parser.add_argument("--mock", action="store_true", help="Use mock data without API call")
    args = parser.parse_args()

    if args.mock:
        os.environ["AISALES_MOCK"] = "1"

    input_path = Path(args.input)
    if not input_path.exists() and not args.mock:
        print(f"✕ File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    out_path = Path(args.out) if args.out else input_path.with_suffix(".srt")

    print(f"→ Transcribing {input_path} ...")
    segments = transcribe(input_path, language=args.lang)

    srt = segments_to_srt(segments)
    out_path.write_text(srt, encoding="utf-8")

    print(f"✓ {len(segments)} segments → {out_path}")
    print(f"\n--- First 200 chars ---\n{srt[:200]}\n---")


if __name__ == "__main__":
    main()
