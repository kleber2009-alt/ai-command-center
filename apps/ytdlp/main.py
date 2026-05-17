import base64
import ipaddress
import os
import socket
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, HttpUrl
import yt_dlp

app = FastAPI(title="ytdlp-extractor", version="1.0.0")

API_KEY = os.environ.get("YTDLP_SERVICE_API_KEY")
# Opt-out for local development. In production, leaving API_KEY unset
# would otherwise silently disable auth and turn this service into an
# open proxy for anyone who finds it. Require an explicit env flag
# instead — fail closed.
ALLOW_NO_AUTH = os.environ.get("YTDLP_ALLOW_NO_AUTH", "").lower() in {"1", "true", "yes"}

if not API_KEY and not ALLOW_NO_AUTH:
    raise RuntimeError(
        "YTDLP_SERVICE_API_KEY is not set. Refusing to start without auth. "
        "Set the env var, or pass YTDLP_ALLOW_NO_AUTH=1 for local development."
    )

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

    b64 = os.environ.get("INSTAGRAM_COOKIES_B64") or os.environ.get("COOKIES_B64")
    if b64:
        try:
            decoded = base64.b64decode(b64)
            tmp = Path(tempfile.gettempdir()) / "ytdlp_cookies.txt"
            tmp.write_bytes(decoded)
            _COOKIES_FILE_PATH = tmp
            return tmp
        except Exception as e:
            print(f"[ytdlp] Failed to decode cookies: {e}")

    return None


def check_auth(authorization: str | None) -> None:
    if not API_KEY:
        # Reachable only when YTDLP_ALLOW_NO_AUTH=1 was set at startup.
        return
    expected = f"Bearer {API_KEY}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


def assert_public_url(url: str) -> None:
    """Reject URLs that resolve to private / loopback / link-local /
    metadata IPs. Without this, yt-dlp will dutifully fetch e.g.
    http://169.254.169.254/latest/meta-data/ (AWS metadata endpoint)
    or http://localhost:6379/ (internal Redis). SSRF risk if the
    service is reachable from a private network.

    Resolves the hostname once and checks every returned address.
    Not bulletproof — yt-dlp follows redirects internally — but
    blocks the obvious cases.
    """
    parsed = urlparse(url)
    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=400, detail="URL has no host")
    try:
        addrinfo = socket.getaddrinfo(host, None)
    except socket.gaierror as e:
        raise HTTPException(status_code=400, detail=f"DNS lookup failed: {e}")
    for family, _, _, _, sockaddr in addrinfo:
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise HTTPException(
                status_code=400,
                detail=f"URL resolves to non-public address {ip_str}",
            )


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
    assert_public_url(str(body.url))

    opts = {
        "format": "bestaudio[ext=m4a]/bestaudio/best[height<=720]/best",
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": False,
        # Try multiple player clients to bypass YouTube anti-bot
        "extractor_args": {
            "youtube": {"player_client": ["ios", "android", "web"]},
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
