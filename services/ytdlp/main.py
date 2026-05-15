import os
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, HttpUrl
import yt_dlp

app = FastAPI(title="ytdlp-extractor", version="1.0.0")

API_KEY = os.environ.get("YTDLP_SERVICE_API_KEY")


def check_auth(authorization: str | None) -> None:
    if not API_KEY:
        return
    expected = f"Bearer {API_KEY}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


class ExtractRequest(BaseModel):
    url: HttpUrl


class ExtractResponse(BaseModel):
    url: str
    title: str | None = None
    duration: float | None = None
    extractor: str | None = None
    ext: str | None = None


def pick_best_audio_url(info: dict) -> str | None:
    # Prefer audio-only formats (smaller, faster for Deepgram)
    formats = info.get("formats") or []
    audio_only = [
        f for f in formats
        if f.get("acodec") not in (None, "none") and f.get("vcodec") in (None, "none")
    ]
    if audio_only:
        # yt-dlp orders worst-to-best; take the last one
        return audio_only[-1].get("url")
    # Fallback: any format with audio
    audio_any = [f for f in formats if f.get("acodec") not in (None, "none")]
    if audio_any:
        return audio_any[-1].get("url")
    # Last resort: top-level url (single-format extractors like some Instagram pages)
    return info.get("url")


@app.get("/")
def root():
    return {"ok": True, "service": "ytdlp-extractor", "version": "1.0.0"}


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/extract", response_model=ExtractResponse)
def extract(body: ExtractRequest, authorization: str | None = Header(default=None)):
    check_auth(authorization)

    opts = {
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": False,
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(str(body.url), download=False)
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")

    if not info:
        raise HTTPException(status_code=404, detail="No info returned")

    # If yt-dlp returned a playlist, take the first entry
    if info.get("_type") == "playlist":
        entries = info.get("entries") or []
        if not entries:
            raise HTTPException(status_code=404, detail="Empty playlist")
        info = entries[0]

    audio_url = pick_best_audio_url(info)
    if not audio_url:
        raise HTTPException(status_code=404, detail="No audio stream found")

    return ExtractResponse(
        url=audio_url,
        title=info.get("title"),
        duration=info.get("duration"),
        extractor=info.get("extractor_key") or info.get("extractor"),
        ext=info.get("ext"),
    )
