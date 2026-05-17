import base64
import os
import tempfile
from pathlib import Path
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, HttpUrl
import yt_dlp

app = FastAPI(title="ytdlp-extractor", version="1.0.0")

API_KEY = os.environ.get("YTDLP_SERVICE_API_KEY")

# Optional cookies for sites that gate scraping (Instagram, Facebook,
# some YouTube videos). Provide the contents of a cookies.txt file
# (Netscape format) as base64 in INSTAGRAM_COOKIES_B64 / COOKIES_B64,
# OR mount a file at COOKIES_FILE.
_COOKIES_FILE_PATH: Path | None = None


def _load_cookies() -> Path | None:
    global _COOKIES_FILE_PATH
    if _COOKIES_FILE_PATH and _COOKIES_FILE_PATH.exists():
        return _COOKIES_FILE_PATH

    cookies_path = os.environ.get("COOKIES_FILE")
    if cookies_path and Path(cookies_path).exists():
        _COOKIES_FILE_PATH = Path(cookies_path)
        return _COOKIES_FILE_PATH

    # Merge INSTAGRAM_COOKIES_B64 and COOKIES_B64 into a single Netscape
    # cookies.txt — yt-dlp accepts multiple domains in one file and
    # picks the right ones based on the URL host.
    sources = []
    for var in ("INSTAGRAM_COOKIES_B64", "COOKIES_B64"):
        b64 = os.environ.get(var)
        if not b64:
            continue
        try:
            decoded = base64.b64decode(b64).decode("utf-8", errors="replace")
        except Exception as e:
            print(f"[ytdlp] Failed to decode {var}: {e}")
            continue
        # Strip the Netscape header from secondary files so it doesn't repeat.
        if sources:
            decoded = "\n".join(
                line for line in decoded.splitlines() if not line.startswith("#")
            )
        sources.append(decoded.rstrip())

    if not sources:
        return None

    merged = "# Netscape HTTP Cookie File\n" + "\n".join(sources) + "\n"
    tmp = Path(tempfile.gettempdir()) / "ytdlp_cookies.txt"
    tmp.write_text(merged, encoding="utf-8")
    _COOKIES_FILE_PATH = tmp
    return tmp


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


@app.get("/diag")
def diag(url: str, authorization: str | None = Header(default=None)):
    """Debug endpoint: returns yt-dlp version, cookie file info, and the
    raw format list yt-dlp can see for the given URL. Useful for diagnosing
    'Requested format is not available' without an SSH session."""
    check_auth(authorization)
    cf = _load_cookies()
    cookie_domains: list[str] = []
    if cf and cf.exists():
        for line in cf.read_text(encoding="utf-8", errors="replace").splitlines():
            if line and not line.startswith("#") and "\t" in line:
                cookie_domains.append(line.split("\t")[0])
    result: dict = {
        "yt_dlp_version": getattr(yt_dlp.version, "__version__", "unknown"),
        "cookies_file": str(cf) if cf else None,
        "cookies_size": cf.stat().st_size if cf and cf.exists() else 0,
        "cookies_domains": sorted(set(cookie_domains))[:10],
    }
    try:
        opts = {"quiet": True, "no_warnings": True, "skip_download": True,
                "extractor_args": {"youtube": {"player_client": ["tv_simply", "mweb", "web"]}}}
        if cf:
            opts["cookiefile"] = str(cf)
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            formats = info.get("formats") or []
            result["formats_count"] = len(formats)
            result["formats_sample"] = [
                {"format_id": f.get("format_id"), "ext": f.get("ext"),
                 "acodec": f.get("acodec"), "vcodec": f.get("vcodec"),
                 "abr": f.get("abr"), "tbr": f.get("tbr")}
                for f in formats[:20]
            ]
            result["title"] = info.get("title")
            result["duration"] = info.get("duration")
    except Exception as e:
        result["error"] = str(e)[:500]
    return result


@app.post("/extract", response_model=ExtractResponse)
def extract(body: ExtractRequest, authorization: str | None = Header(default=None)):
    check_auth(authorization)

    opts = {
        # Permissive: any audio, any container; fall back to best video+audio.
        # Specific selectors like bestaudio[ext=m4a] fail when YouTube doesn't
        # return that container for a given video.
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": False,
        # Multiple player clients improve odds when YouTube changes API:
        # tv_simply currently returns the most formats anonymously,
        # mweb is a good fallback, ios/android are deprecated by yt-dlp as
        # of 2026 but still occasionally help for cookie-authed requests.
        "extractor_args": {
            "youtube": {"player_client": ["tv_simply", "mweb", "web", "ios"]},
        },
    }

    cookies_file = _load_cookies()
    if cookies_file:
        opts["cookiefile"] = str(cookies_file)

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(str(body.url), download=False)
    except yt_dlp.utils.DownloadError as e:
        msg = str(e)
        hint = ""
        lower = msg.lower()
        if "requested format is not available" in lower or "no video formats" in lower:
            hint = (
                " (hint: YouTube блокирует анонимный доступ — добавьте YouTube cookies "
                "в COOKIES_B64 на Railway)"
            )
        elif "login required" in lower or "rate-limit" in lower or "private" in lower:
            hint = " (hint: добавьте cookies для этого сайта в COOKIES_B64)"
        raise HTTPException(status_code=400, detail=msg + hint)
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
