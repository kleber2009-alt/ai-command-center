"""
ai-py (spec §1, §2): FastAPI microservice for heavy AI work that doesn't belong
in the Node workers — Whisper Large v3 fallback transcription and batch
embeddings. The Node pipeline calls this only when the primary providers
(Deepgram, OpenAI) are unavailable. GPU-backed model loading is wired in deploy.
"""

from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="viral-platform ai-py", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class TranscribeRequest(BaseModel):
    audio_url: str
    language: str | None = None


class Word(BaseModel):
    word: str
    start_ms: int
    end_ms: int


class TranscribeResponse(BaseModel):
    language: str
    words: list[Word]


@app.post("/transcribe", response_model=TranscribeResponse)
def transcribe(req: TranscribeRequest) -> TranscribeResponse:
    # TODO: load faster-whisper / whisper-large-v3 on GPU and transcribe
    # req.audio_url, returning word-level timings to match the Node Transcript
    # shape (packages/shared types.ts). Stubbed until the GPU image is built.
    raise NotImplementedError("whisper fallback not yet wired")


class EmbedRequest(BaseModel):
    texts: list[str]


class EmbedResponse(BaseModel):
    vectors: list[list[float]]


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    # TODO: batch-embed via a local model (e.g. Voyage/bge) for cost control.
    raise NotImplementedError("batch embeddings not yet wired")
