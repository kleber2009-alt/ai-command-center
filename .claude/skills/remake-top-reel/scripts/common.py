#!/usr/bin/env python3
"""Общее для скриптов «Ремейка залёта»: пути, настройки, ключи, HTTP, кодовое слово, история.

Папки (переопределяются переменными окружения):
  REMAKE_HOME  ~/.claude/creator-profile/remake   личные настройки (config.json) и история (history.jsonl)
  REMAKE_WORK  ~/reel-work/remake                 задачи: <slug>/ — исходник, транскрипт, сценарий, аватар, монтаж
                                                   _scan/ — последняя выгрузка рилсов и кандидаты
Задачу скрипты принимают как slug (папка в REMAKE_WORK) или как путь к папке.
Ключи (HEYGEN_API_KEY, APIFY_TOKEN, IG_ACCESS_TOKEN, ELEVENLABS_API_KEY, OPENAI_API_KEY) берутся из окружения,
иначе из последней строки `export NAME=...` в профиле оболочки. Ключи никогда не печатаются.
Только стандартная библиотека Python (Pillow — по желанию, для листа обложек).
"""
import datetime, json, os, re, shutil, ssl, subprocess, sys, time
from pathlib import Path
from urllib import error as _er, request as _rq

SKILL = Path(__file__).resolve().parent.parent
HOME_DIR = Path(os.path.expanduser(os.environ.get("REMAKE_HOME", "~/.claude/creator-profile/remake")))
WORK_ROOT = Path(os.path.expanduser(os.environ.get("REMAKE_WORK", "~/reel-work/remake")))
SCAN = WORK_ROOT / "_scan"
HISTORY = HOME_DIR / "history.jsonl"
RC = (".zshrc", ".zprofile", ".zshenv", ".bash_profile", ".bashrc", ".profile")
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or str(Path(FFMPEG).with_name("ffprobe"))


# ---------- настройки: config.json скилла, поверх — личный REMAKE_HOME/config.json ----------
def _merge(a: dict, b: dict) -> dict:
    out = dict(a)
    for k, v in b.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def config() -> dict:
    base = json.loads((SKILL / "config.json").read_text())
    over = HOME_DIR / "config.json"
    if over.exists():
        try:
            base = _merge(base, json.loads(over.read_text()))
        except ValueError:
            print(f"WARN {over} не читается как JSON — беру настройки скилла по умолчанию")
    return base


def set_override(path: str, value):
    """Записать одно значение в личный config.json: set_override("avatar.look_id", "...")."""
    over = HOME_DIR / "config.json"
    d = json.loads(over.read_text()) if over.exists() else {}
    node = d
    keys = path.split(".")
    for k in keys[:-1]:
        node = node.setdefault(k, {})
    node[keys[-1]] = value
    HOME_DIR.mkdir(parents=True, exist_ok=True)
    over.write_text(json.dumps(d, ensure_ascii=False, indent=1))


# ---------- ключи ----------
def secret(name: str) -> str:
    v = (os.environ.get(name) or "").strip().strip("'\"")
    if v:
        return v
    home = os.path.expanduser("~")
    for rc in RC:
        p = os.path.join(home, rc)
        if not os.path.exists(p):
            continue
        last = ""
        try:
            for line in open(p, errors="ignore"):
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


# ---------- задачи ----------
def job_dir(arg: str, create: bool = False) -> Path:
    p = Path(os.path.expanduser(arg))
    if "/" not in arg and not p.is_absolute():
        p = WORK_ROOT / arg
    if create:
        (p / "sources").mkdir(parents=True, exist_ok=True)
        (p / "work").mkdir(parents=True, exist_ok=True)
    elif not p.is_dir():
        sys.exit(f"нет папки задачи {p}")
    return p


def read_json(p: Path, default=None):
    try:
        return json.loads(Path(p).read_text())
    except (OSError, ValueError):
        return default


def write_json(p: Path, data):
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    Path(p).write_text(json.dumps(data, ensure_ascii=False, indent=1))


# ---------- HTTP (urllib; прокси из окружения подхватывается сам) ----------
def _ctx():
    c = ssl.create_default_context()
    for f in (os.environ.get("SSL_CERT_FILE"), os.environ.get("REQUESTS_CA_BUNDLE"), "/etc/ssl/cert.pem"):
        if f and os.path.exists(f):
            try:
                c.load_verify_locations(f)
            except (OSError, ssl.SSLError):
                pass
    try:
        import certifi
        c.load_verify_locations(certifi.where())
    except Exception:
        pass
    return c


class HTTPError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status}: {body[:300]}")
        self.status, self.body = status, body


def http(url: str, method: str = "GET", headers: dict = None, data=None, timeout: int = 60) -> bytes:
    if isinstance(data, (dict, list)):
        data = json.dumps(data).encode()
        headers = {"Content-Type": "application/json", **(headers or {})}
    req = _rq.Request(url, data=data, method=method, headers={"User-Agent": "remake-top-reel/1", **(headers or {})})
    try:
        with _rq.urlopen(req, timeout=timeout, context=_ctx()) as r:
            return r.read()
    except _er.HTTPError as e:
        raise HTTPError(e.code, e.read().decode("utf-8", "replace")) from None


def http_json(url: str, **kw):
    return json.loads(http(url, **kw) or b"{}")


def download(url: str, dest: Path, timeout: int = 600) -> Path:
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = _rq.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with _rq.urlopen(req, timeout=timeout, context=_ctx()) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)
    tmp.replace(dest)
    return dest


# ---------- видео ----------
def probe(src) -> dict:
    r = subprocess.run([FFPROBE, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(src)],
                       capture_output=True, text=True, timeout=60)
    d = json.loads(r.stdout or "{}")
    v = next((s for s in d.get("streams", []) if s.get("codec_type") == "video"), {})
    a = next((s for s in d.get("streams", []) if s.get("codec_type") == "audio"), None)
    rot = int((v.get("tags") or {}).get("rotate", 0) or 0)
    w, h = int(v.get("width", 0) or 0), int(v.get("height", 0) or 0)
    if abs(rot) in (90, 270):
        w, h = h, w
    return {"duration": round(float(d.get("format", {}).get("duration", 0) or 0), 2), "width": w, "height": h, "audio": bool(a)}


def sheet(src, out, n: int = 8, cols: int = 4, width: int = 270) -> bool:
    """n кадров ролика (равномерно) одной картинкой cols×rows — чтобы глазами проверить «говорящую голову»."""
    dur = probe(src)["duration"] or 1
    rows = (n + cols - 1) // cols
    vf = f"fps={n}/{dur:.3f},scale={width}:-2,tile={cols}x{rows}"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(src), "-vf", vf, "-frames:v", "1", "-q:v", "4", str(out)],
                   capture_output=True, timeout=180)
    return Path(out).exists()


# ---------- кодовое слово ----------
_CUE = r"(?:напиш\w*|пиш\w*|остав\w*|кида\w*|кинь|жми|отправ\w*|став\w*|комм?ент\w*|кодов\w+|слов[оау]\b|директ\w*|в\s*лс)"
_Q = r"[«\"“„']\s*([^»\"”'\n]{1,24}?)\s*[»\"”']"
_WORD = r"([A-Za-zА-Яа-яЁё0-9+]{2,20}|\+)"
_STOP = {"в", "во", "мне", "слово", "слова", "комментарий", "комментарии", "комментариях", "коммент", "коменты", "это", "свой",
         "директ", "директе", "сюда", "ниже", "под", "этим", "постом", "видео", "рилсом", "пиши", "напиши", "и", "я", "тебе",
         "пришлю", "отправлю", "получи", "получить", "кодовое", "lol", "ок"}
_PRON = {"ты", "вы", "мы", "он", "она", "они", "я", "тебя", "вас"}  # «на «ты»» — не кодовое слово даже в кавычках


def code_word(text: str):
    """Кодовое слово призыва из подписи или речи: «Пиши «СКИЛЛ» в комментариях», «напиши в комментариях слово промпт»,
    «кодовое слово — БОТ», «оставь + под видео». Возвращает слово в верхнем регистре или None."""
    if not text:
        return None
    t = text.replace(" ", " ")
    quoted, loose = _PRON, _STOP | _PRON  # слово в кавычках — явный выбор автора («ВИДЕО» тоже слово)
    pats = [
        (rf"{_CUE}[^\n]{{0,60}}?{_Q}", re.I, quoted),                           # пиши ... «СЛОВО»
        (rf"{_Q}[^\n]{{0,40}}?{_CUE}", re.I, quoted),                           # «СЛОВО» в комментарии
        (rf"кодов\w+\s+слов\w*\s*[—–:-]?\s*{_WORD}", re.I, loose),             # кодовое слово — БОТ
        (rf"слов[оа]\s+{_WORD}", re.I, loose),                                 # слово промпт
        (rf"(?:напиш\w*|пиш\w*|остав\w*|кинь|кида\w*)\s+(?:мне\s+)?{_WORD}\s+(?:в|под)\s+(?:\w+\s+)?(?:комм?ент\w*|директ\w*|видео|рилс\w*|пост\w*)", re.I, loose),
        (rf"(?i:{_CUE})[^\n]{{0,40}}?\b([A-ZА-ЯЁ0-9]{{3,20}})\b", 0, loose),   # пиши ... СКИЛЛ (капсом, без кавычек)
    ]
    for p, flags, stop in pats:
        for m in re.finditer(p, t, flags):
            w = m.group(1).strip(" .,!?:;—–-").strip()
            if w and w.lower() not in stop and len(w) <= 24:
                return w.upper()
    return None


# ---------- история ----------
def history() -> list:
    if not HISTORY.exists():
        return []
    out = []
    for line in HISTORY.read_text().splitlines():
        try:
            out.append(json.loads(line))
        except ValueError:
            pass
    return out


def log(entry: dict):
    HOME_DIR.mkdir(parents=True, exist_ok=True)
    entry = {"at": datetime.datetime.now().isoformat(timespec="seconds"), **entry}
    with open(HISTORY, "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def used_sources(days: int) -> set:
    since = datetime.datetime.now() - datetime.timedelta(days=days)
    out = set()
    for h in history():
        try:
            if datetime.datetime.fromisoformat(h["at"]) >= since and h.get("source_id"):
                out.add(str(h["source_id"]))
        except (KeyError, ValueError):
            pass
    return out


def fmt_n(n) -> str:
    if n is None:
        return "—"
    n = float(n)
    return f"{n / 1e6:.1f}M" if n >= 1e6 else f"{n / 1e3:.1f}K" if n >= 1e4 else f"{int(n)}"


def wait(sec: float):
    time.sleep(sec)
