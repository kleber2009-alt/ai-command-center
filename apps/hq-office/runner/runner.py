#!/usr/bin/env python3
"""Исполнитель рабочего стола офиса hq2.aicex.club: берёт задачи агентам и делает их Claude Code
со скиллами команды — на том же сервере и под тем же пользователем, что боты монтажа и Кадрика.

Цикл: claim → папка задачи (in/ — материалы владельца, out/ — результат) → общий слот тяжёлых
задач (~/.heavy-slot.lock, как у ботов) → `claude -p` (stream-json) → шаги в офис → файлы out/
на сервер офиса → finish: review (RESULT: …), need (NEED: …) или error.
Правка и ответ на вопрос продолжают ту же сессию Claude (--resume).

Только стандартная библиотека Python. Переменные (runner.env, пишет deploy/server.sh):
  HQ_DESK_RUNNER_TOKEN  общий секрет с сервером офиса (обязательно)
  HQ_DESK_API           https://hq2.aicex.club/api/assistant/desk
  CLAUDE_BIN            ~/.local/bin/claude      CLAUDE_MODEL  claude-opus-5-5     CLAUDE_EFFORT  high
  HQ_RUNNER_JOBS        ~/hq-runner/jobs         HQ_RUNNER_LIMIT_MIN  60
  HQ_MCP_CONFIG         ~/hq-runner/mcp.json — подключения к внешним системам (ChatPlace, Windsor, HeyGen…):
                        {"mcpServers": {...как у Claude Code...}, "policy": {"<сервер>": {"read": [...], "write": [...]}}}

Подключения (MCP): инструменты на чтение разрешены в каждой задаче; инструменты, которые меняют данные
(рассылка, бюджет, публикация), — только в задаче kind=execute, после «Выполнить» владельца на рабочем столе.
Чтение/запись — по policy, иначе по readOnlyHint инструмента, иначе по имени (get/list/search… — чтение).

Каждый запуск Claude сдаёт в офис usage: стоимость, время, число ходов и токены (событие result).

Потоки (HQ_RUNNER_WORKERS, по умолчанию 2): первый берёт любые задачи, остальные — только лёгкие (без рендера видео),
чтобы ответ, правка, проверка и расшифровка не ждали часового монтажа. Общий слот тяжёлых задач (~/.heavy-slot.lock) —
только для задач с heavy (видео). Папки задач, закрытых давно, офис присылает в purge — они удаляются; для правки
такой задачи офис присылает restore — принятый результат скачивается обратно в out/.

Права: Claude Code и скрипты получают окружение без токена офиса; запрещены sudo/ssh/git push/docker/systemctl и
чтение ключей (DENIED_TOOLS); служба systemd закрывает ~/.ssh и другие файлы ключей (hq-runner.service).
"""
import fcntl
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HOME = Path.home()
API = os.environ.get("HQ_DESK_API", "https://hq2.aicex.club/api/assistant/desk").rstrip("/")
TOKEN = os.environ.get("HQ_DESK_RUNNER_TOKEN", "")
CLAUDE = os.environ.get("CLAUDE_BIN") or str(HOME / ".local/bin/claude")
MODEL = os.environ.get("CLAUDE_MODEL", "").strip() or "claude-opus-5-5"
EFFORT = os.environ.get("CLAUDE_EFFORT", "").strip() or "high"
JOBS = Path(os.environ.get("HQ_RUNNER_JOBS") or HOME / "hq-runner/jobs")
LIMIT = int(os.environ.get("HQ_RUNNER_LIMIT_MIN", "60")) * 60
SKILLS = HOME / ".claude/skills"
ALLOWED_TOOLS = ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Skill", "TodoWrite", "WebFetch", "WebSearch"]
QA_TOOLS = ["Bash", "Read", "Glob", "Grep", "WebFetch"]
# что агенту нельзя ни при каких указаниях из чужого текста (страницы, расшифровки, файлы): права сервера и ключи
DENIED_TOOLS = ["Bash(sudo:*)", "Bash(su:*)", "Bash(ssh:*)", "Bash(scp:*)", "Bash(sftp:*)", "Bash(rsync:*)", "Bash(git push:*)",
                "Bash(docker:*)", "Bash(systemctl:*)", "Bash(crontab:*)", "Bash(pkill:*)", "Bash(killall:*)", "Bash(shutdown:*)", "Bash(reboot:*)",
                "Read(~/.ssh/**)", "Read(~/hq-runner/*.env)", "Read(~/hq-runner/mcp*.json)", "Read(~/.claude/.credentials.json)", "Read(**/.env)"]
VERSION = "11"
WORKERS = max(1, int(os.environ.get("HQ_RUNNER_WORKERS", "2") or 2))
# окружение для Claude Code и скриптов: без токена офиса (им нельзя сдавать задачи от имени исполнителя)
CHILD_ENV = {k: v for k, v in os.environ.items() if k not in ("HQ_DESK_RUNNER_TOKEN",)}
DISK_LOCK = threading.Lock()
RUNNING = set()   # id задач в работе у потоков этого исполнителя — их папки не удаляются
MCP_FILE = Path(os.environ.get("HQ_MCP_CONFIG") or HOME / "hq-runner/mcp.json")
MCP_CLAUDE = HOME / "hq-runner/mcp.claude.json"
READ_RE = re.compile(r"(^|[_-])(get|list|search|query|read|fetch|status|analytics|report|reports|stats|estimate|predict|balance|describe|show|find|lookup|explore|view|count|check|whoami|me|options|fields|connectors|dashboard)([_-]|$)", re.I)
# расшифровка референсов (агент «Транскрибатор»): скрипт скилла transcribe-reference, выкладывается рядом с runner.py
BALANCES = SKILLS / "service-balances/scripts/balances.py"
TRANSCRIBER = next((p for p in (Path(__file__).with_name("transcribe_ref.py"), SKILLS / "transcribe-reference/scripts/transcribe_ref.py") if p.exists()), None)
FILE_LIMIT = 300_000_000
# диск: перед задачей исполнитель проверяет свободное место; если меньше DISK_LOW — сам удаляет свои старые папки задач
# (самые старые первыми, кроме тех, что в работе) и кэши; если и после этого меньше DISK_MIN — задача не начинается,
# а возвращается с понятной ошибкой (раньше Claude Code падал посреди работы с «No space left on device»)
DISK_LOW = int(float(os.environ.get("HQ_RUNNER_DISK_LOW_GB", "8") or 8) * 1e9)
DISK_MIN = int(float(os.environ.get("HQ_RUNNER_DISK_MIN_GB", "2") or 2) * 1e9)
DISK_KEEP_H = float(os.environ.get("HQ_RUNNER_DISK_KEEP_H", "6") or 6)   # папки моложе — не трогаются
CACHES = [HOME / ".cache/pip", HOME / ".cache/yt-dlp", HOME / ".npm/_cacache"]
NOSPACE = ("На сервере кончилось место на диске{}. Исполнитель уже удалил свои старые папки задач и кэши — "
           "освободите место на сервере (workflow cleanup-studio-kadrik или hq-runner-diagnose покажет, что занимает диск) и нажмите «Повторить».")


def log(*a):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


def usage_of(ev, started):
    """Стоимость и время одного запуска Claude Code — из события result (stream-json)."""
    u = (ev or {}).get("usage") or {}
    return {
        "cost": round(float((ev or {}).get("total_cost_usd") or 0), 4),
        "ms": int((ev or {}).get("duration_ms") or (time.time() - started) * 1000),
        "turns": int((ev or {}).get("num_turns") or 0),
        "tin": int(u.get("input_tokens") or 0) + int(u.get("cache_read_input_tokens") or 0) + int(u.get("cache_creation_input_tokens") or 0),
        "tout": int(u.get("output_tokens") or 0),
    }


def redact(text):
    return re.sub(r"(sk-ant-[a-z]+\d*-)[A-Za-z0-9_-]+", r"\1***", str(text))


def auth_source():
    """Откуда у Claude Code вход — только название источника, без значений."""
    if os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return "CLAUDE_CODE_OAUTH_TOKEN (claude.env)"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "ANTHROPIC_API_KEY (claude.env)"
    if (HOME / ".claude/.credentials.json").exists():
        return "~/.claude/.credentials.json"
    return "не найден"


def claude_error(text):
    """Строка ошибки Claude Code из лога: результат с is_error или последняя строка stderr."""
    err = ""
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except ValueError:
            err = line
            continue
        if isinstance(ev, dict) and ev.get("type") == "result" and ev.get("is_error"):
            err = str(ev.get("result") or ev.get("subtype") or "ошибка")
    return redact(err)[:300]


def selftest():
    """Короткий запуск Claude при старте — вход, модель и флаги те же, что у задач."""
    try:
        r = subprocess.run([CLAUDE, "-p", "Ответь одним словом: готов", "--output-format", "stream-json", "--verbose",
                            "--model", MODEL, "--effort", "low", "--max-turns", "1"],
                           cwd=JOBS, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=180, env=CHILD_ENV)
    except Exception as e:
        return {"ok": False, "error": redact(e)[:300]}
    ok = r.returncode == 0 and '"is_error":false' in r.stdout.replace(" ", "")
    return {"ok": ok, "error": "" if ok else (claude_error(r.stdout + "\n" + r.stderr) or f"код {r.returncode}")}


def call(method, path, body=None, raw=None, headers=None, timeout=60):
    """Запрос к серверу офиса. body — JSON, raw — файл (bytes или открытый файл с длиной в headers)."""
    h = {"authorization": "Bearer " + TOKEN, **(headers or {})}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h["content-type"] = "application/json"
    elif raw is not None:
        data = raw
        h.setdefault("content-type", "application/octet-stream")
    req = urllib.request.Request(API + path, data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        text = r.read()
        return r.status, (json.loads(text) if text and r.headers.get("content-type", "").startswith("application/json") else None)


def call_retry(method, path, body=None, file=None, timeout=60):
    """Сдача результата переживает перезапуск сервера офиса (он пересоздаётся при каждой выкладке)."""
    for attempt in range(8):
        try:
            if file is None:
                return call(method, path, body, timeout=timeout)
            with open(file, "rb") as fh:
                return call(method, path, raw=fh, headers={"content-length": str(file.stat().st_size)}, timeout=timeout)
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == 7:
                raise
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            if attempt == 7:
                raise
        time.sleep(min(30, 3 * (attempt + 1)))


def oom_kills():
    """Сколько процессов службы ядро убило за нехватку памяти (memory.events своей cgroup v2)."""
    try:
        rel = Path("/proc/self/cgroup").read_text().strip().split("::", 1)[1]
        for line in (Path("/sys/fs/cgroup" + rel) / "memory.events").read_text().splitlines():
            k, v = line.split()
            if k == "oom_kill":
                return int(v)
    except (OSError, IndexError, ValueError):
        pass
    return 0


OOM_HINT = "Не хватило памяти сервера на рендер — процесс убит. Поставьте по одному видео на задачу или нажмите «Повторить»."


# ---------- подключения к внешним системам (MCP): чтение сразу, действия — после разрешения владельца ----------

def _rpc(url, headers, method, params=None, sid="", rid=1):
    body = {"jsonrpc": "2.0", "method": method, "params": params or {}}
    if rid is not None:
        body["id"] = rid
    # своё имя клиента: часть серверов (ChatPlace) отвечает 403 на стандартный User-Agent Python-urllib
    h = {"content-type": "application/json", "accept": "application/json, text/event-stream", "user-agent": f"hq-runner/{VERSION}", **headers}
    if sid:
        h["mcp-session-id"] = sid
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        sid = r.headers.get("mcp-session-id") or sid
        ctype, raw = r.headers.get("content-type", ""), r.read().decode("utf-8", "replace")
    if rid is None:
        return None, sid
    msgs = []
    if "text/event-stream" in ctype:
        for line in raw.splitlines():
            if line.startswith("data:"):
                try:
                    msgs.append(json.loads(line[5:].strip()))
                except ValueError:
                    pass
    elif raw.strip():
        j = json.loads(raw)
        msgs = j if isinstance(j, list) else [j]
    for m in msgs:
        if isinstance(m, dict) and m.get("id") == rid:
            if m.get("error"):
                raise RuntimeError(str((m["error"] or {}).get("message") or m["error"])[:200])
            return m.get("result") or {}, sid
    raise RuntimeError("сервер не ответил на " + method)


def _expand(v):
    if isinstance(v, str):
        return os.path.expandvars(v)
    if isinstance(v, dict):
        return {k: _expand(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_expand(x) for x in v]
    return v


def mcp_tools(cfg):
    """Список инструментов HTTP-сервера MCP: имя и readOnlyHint."""
    url, headers = cfg.get("url", ""), {k: str(v) for k, v in (cfg.get("headers") or {}).items()}
    _, sid = _rpc(url, headers, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                               "clientInfo": {"name": "hq-runner", "version": VERSION}})
    try:
        _rpc(url, headers, "notifications/initialized", sid=sid, rid=None)
    except Exception:  # noqa: BLE001 — уведомление без ответа, сервер может закрыть поток
        pass
    tools, cursor = [], None
    for page in range(20):
        res, sid = _rpc(url, headers, "tools/list", {"cursor": cursor} if cursor else {}, sid=sid, rid=page + 2)
        tools += res.get("tools") or []
        cursor = res.get("nextCursor")
        if not cursor:
            break
    return tools


# пакеты, которые uvx ставит с плавающими зависимостями: heygen-mcp 0.0.3 просит mcp>=1.6, а mcp 2.x убрал FastMCP —
# сервер падает на старте, и Claude Code видит «Connection closed». Держим совместимую ветку, пока пакет не обновят.
UVX_PINS = {"heygen-mcp": ["mcp[cli]<2"]}


def _pin_uvx(cfg):
    """uvx <пакет> → uvx --with <совместимая зависимость> <пакет>, если владелец не задал --with сам."""
    if not isinstance(cfg, dict) or os.path.basename(str(cfg.get("command") or "")) != "uvx":
        return cfg
    args = [str(a) for a in (cfg.get("args") or [])]
    pkg = next((a for a in args if not a.startswith("-")), "")
    pins = UVX_PINS.get(re.split(r"[=<>@\[]", pkg)[0]) if pkg else None
    if not pins or "--with" in args:
        return cfg
    extra = [x for pin in pins for x in ("--with", pin)]
    return {**cfg, "args": extra + args}


def load_mcp():
    """mcp.json → файл для --mcp-config (только mcpServers) и списки инструментов на чтение и на запись."""
    if not MCP_FILE.exists():
        return {"config": "", "servers": []}
    try:
        raw = json.loads(MCP_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        log("mcp.json:", e)
        return {"config": "", "servers": [], "error": "mcp.json не читается"}
    servers, policy = raw.get("mcpServers") or {}, raw.get("policy") or {}
    if not servers:
        return {"config": "", "servers": []}
    servers = {name: _pin_uvx(cfg) for name, cfg in servers.items()}
    MCP_CLAUDE.write_text(json.dumps({"mcpServers": servers}), encoding="utf-8")
    os.chmod(MCP_CLAUDE, 0o600)
    out = []
    for name, cfg in servers.items():
        key = re.sub(r"[^A-Za-z0-9_-]", "_", name)
        pol, read, write, err = policy.get(name) or {}, [], [], ""
        try:
            tools = mcp_tools(_expand(cfg)) if (cfg.get("type") in ("http", "streamable-http") or (cfg.get("url") and cfg.get("type") != "sse")) else []
        except Exception as e:  # noqa: BLE001
            tools, err = [], redact(e)[:200]
        names = {t.get("name") for t in tools if t.get("name")} | set(pol.get("read") or []) | set(pol.get("write") or [])
        hints = {t.get("name"): (t.get("annotations") or {}) for t in tools}
        for n in sorted(names):
            ro = n in (pol.get("read") or []) or (n not in (pol.get("write") or []) and (
                hints.get(n, {}).get("readOnlyHint") is True or (hints.get(n, {}).get("readOnlyHint") is None and bool(READ_RE.search(n)))))
            (read if ro else write).append(f"mcp__{key}__{n}")
        out.append({"name": name, "read": read, "write": write, "error": err})
        log(f"mcp {name}: чтение {len(read)}, действия {len(write)}" + (f", ошибка: {err}" if err else ""))
    return {"config": str(MCP_CLAUDE), "servers": out}


MCP = {"config": "", "servers": []}


# ---------- общий слот тяжёлых задач (как heavy_slot.py у ботов, только синхронно) ----------

class HeavySlot:
    def __init__(self, owner):
        self.owner, self.f = owner, None

    def __enter__(self):
        self.f = open(HOME / ".heavy-slot.lock", "a+")
        while True:
            try:
                fcntl.flock(self.f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                time.sleep(5)
        (HOME / ".heavy-slot.owner").write_text(self.owner, encoding="utf-8")
        return self

    def __exit__(self, *a):
        try:
            fcntl.flock(self.f, fcntl.LOCK_UN)
        finally:
            self.f.close()


def slot_busy():
    with open(HOME / ".heavy-slot.lock", "a+") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(f, fcntl.LOCK_UN)
            return ""
        except BlockingIOError:
            try:
                return (HOME / ".heavy-slot.owner").read_text(encoding="utf-8").strip() or "другой бот"
            except OSError:
                return "другой бот"


# ---------- шаги: что агент делает прямо сейчас, человеческим языком ----------

def describe(item):
    if item.get("type") == "text":
        line = next((x.strip() for x in item.get("text", "").splitlines() if x.strip() and not x.startswith(("RESULT:", "NEED:", "SUMMARY:"))), "")
        return line[:220] if len(line) > 12 else ""
    if item.get("type") != "tool_use":
        return ""
    name, inp = item.get("name", ""), item.get("input") or {}
    base = lambda p: Path(str(p)).name
    if name == "Skill":
        return f"Открыл скилл {inp.get('skill') or inp.get('name') or ''}".strip()
    if name in ("Write", "Edit"):
        return f"Пишет {base(inp.get('file_path', ''))}"
    if name == "Read":
        return f"Читает {base(inp.get('file_path', ''))}"
    if name == "Bash":
        return "Выполняет: " + re.sub(r"\s+", " ", inp.get("description") or inp.get("command", ""))[:120]
    if name == "WebSearch":
        return f"Ищет в интернете: {inp.get('query', '')[:100]}"
    if name == "WebFetch":
        return f"Читает страницу {urllib.parse.urlparse(inp.get('url', '')).netloc}"
    if name.startswith("mcp__"):
        _, server, tool = (name.split("__", 2) + ["", ""])[:3]
        return f"Обращается к {server}: {tool}"
    if name == "TodoWrite":
        todos = inp.get("todos") or []
        cur = next((t.get("activeForm") or t.get("content") for t in todos if t.get("status") == "in_progress"), "")
        return f"План: {cur}" if cur else ""
    return ""


# ---------- Транскрибатор: ссылки и видео → расшифровка (без Claude, сразу скриптом) ----------

def page_of(items, mds):
    """out/index.html для владельца, когда расшифровка — сам результат задачи."""
    esc = lambda x: str(x).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    blocks = "".join(f"<article><pre>{esc(md)}</pre></article>" for md in mds)
    return ("<!doctype html><html lang=ru><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            "<title>Расшифровка</title><style>:root{color-scheme:light dark}body{margin:0;padding:24px 16px;font:16px/1.6 Manrope,system-ui,sans-serif;"
            "background:#0e1016;color:#e8eaf0}main{max-width:760px;margin:auto}h1{font-size:22px}article{background:#171a23;border:1px solid #262b38;"
            "border-radius:14px;padding:18px;margin:16px 0}pre{white-space:pre-wrap;font:inherit;margin:0}</style><main>"
            f"<h1>Транскрибатор: {len(items)} расшифровк{'а' if len(items) == 1 else 'и'}</h1>{blocks}</main></html>")


def run_transcribe(job):
    """kind=transcribe — этап связки: расшифровка уходит на сервер как материалы следующему агенту.
    kind=run у агента transcriber — расшифровка и есть результат: out/ + страница index.html на проверку."""
    jid, final = job["id"], job["kind"] == "run"
    d = JOBS / jid
    (d / "in").mkdir(parents=True, exist_ok=True)
    dest = d / ("out" if final else "transcripts")
    shutil.rmtree(dest, ignore_errors=True)
    dest.mkdir(parents=True)
    media = []
    for name in job.get("files") or []:
        target = d / "in" / Path(name).name
        if Path(name).suffix.lower() not in (".mp4", ".mov", ".webm", ".mkv", ".m4v", ".mp3", ".m4a", ".wav", ".ogg", ".oga", ".opus", ".aac", ".flac"):
            continue
        if not target.exists():
            req = urllib.request.Request(f"{API}/runner/{jid}/input/{urllib.parse.quote(name)}", headers={"authorization": "Bearer " + TOKEN})
            with urllib.request.urlopen(req, timeout=600) as r, open(target, "wb") as f:
                shutil.copyfileobj(r, f)
        media.append(str(target))
    sources = [*(job.get("sources") or []), *media][:5]

    def step(text):
        try:
            call("POST", f"/runner/{jid}/step", {"text": text})
        except Exception as e:  # noqa: BLE001
            log("step:", e)

    if not TRANSCRIBER:
        return call_retry("POST", f"/runner/{jid}/finish", {"result": "error", "error": "Транскрибатор не установлен на сервере: нет transcribe_ref.py рядом с исполнителем и скилла transcribe-reference."})
    if not sources:
        return call_retry("POST", f"/runner/{jid}/finish", {"result": "need", "question": "Пришлите ссылку на ролик или само видео — без него расшифровывать нечего."})
    step(f"Транскрибатор взял {len(sources)} источник(а) — скачивает и расшифровывает.")
    started = time.time()
    p = subprocess.Popen([sys.executable, "-I", str(TRANSCRIBER), *sources, "--out", str(dest)], cwd=d, stdin=subprocess.DEVNULL, env=CHILD_ENV,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    timer = threading.Timer(30 * 60, p.kill)
    timer.start()
    res, tail = {}, []
    try:
        for line in p.stdout:
            line = line.strip()
            tail = (tail + [line])[-20:]
            if line.startswith("STEP "):
                step(line[5:])
            elif line.startswith("{"):
                try:
                    res = json.loads(line)
                except ValueError:
                    pass
        p.wait()
    finally:
        timer.cancel()
    items = res.get("items") or []
    if not items:
        return call_retry("POST", f"/runner/{jid}/finish", {"result": "error", "error": "Транскрибатор: " + str(res.get("error") or "расшифровать не вышло")[:700],
                                                          "log": redact("\n".join(tail))[-1500:]})
    mds = [(dest / it["file"]).read_text(encoding="utf-8") for it in items]
    note = "; ".join(f"«{it['title'] or it['author'] or it['source'][:60]}» — {it['words']} слов" for it in items)
    if res.get("errors"):
        note += ". Не вышло: " + "; ".join(res["errors"])[:400]
    if final:
        (dest / "index.html").write_text(page_of(items, mds), encoding="utf-8")
    files = [f for f in sorted(dest.iterdir()) if f.is_file()]
    for f in files:
        call_retry("PUT", f"/runner/{jid}/file?path={urllib.parse.quote(f.name)}", file=f, timeout=600)
    if final:
        mats = "\n".join([f"- out/index.html — страница со всеми расшифровками"] + [f"- out/{it['file']} — текст ролика {it['n']}: {it['title'] or it['author'] or it['source'][:60]}" for it in items])
        report = (f"## Что сделано\nРасшифровал {len(items)} ролик(ов) — текст, подпись к публикации, автор и цифры.\n\n## Главное\n"
                  + "\n".join(f"- «{it['title'] or it['author'] or it['source'][:60]}» — {it['words']} слов, {it['engine']}" for it in items)
                  + (f"\n- Не вышло: {'; '.join(res['errors'])[:400]}" if res.get("errors") else "") + f"\n\n## Материалы\n{mats}")
        call_retry("POST", f"/runner/{jid}/finish", {"result": "review", "main": "index.html", "summary": report, "usage": {"ms": int((time.time() - started) * 1000)},
                                                     "history": f"Расшифровка {len(items)} ролик(ов) по ссылке — текст для сценариев и разборов."})
    else:
        call_retry("POST", f"/runner/{jid}/finish", {"result": "transcribed", "summary": note, "files": [f.name for f in files if f.suffix == ".md"],
                                                     "usage": {"ms": int((time.time() - started) * 1000)}})
    log(jid, f"transcribed {len(items)} source(s)")


# ---------- Балансы и подписки: проверка скриптом (без Claude), каждое утро по расписанию офиса ----------

def run_balances(job):
    jid = job["id"]
    out = JOBS / jid / "out"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    if not BALANCES.exists():
        return call_retry("POST", f"/runner/{jid}/finish", {"result": "error", "error": "Скилл service-balances не установлен на сервере исполнителя."})
    try:
        call("POST", f"/runner/{jid}/step", {"text": "Проверяет балансы и подписки сервисов по API."})
    except Exception as e:  # noqa: BLE001
        log("step:", e)
    started = time.time()
    r = subprocess.run([sys.executable, "-I", str(BALANCES), "--out", str(out)], cwd=out.parent, stdin=subprocess.DEVNULL, env=CHILD_ENV,
                       capture_output=True, text=True, timeout=600)
    res = {}
    for line in reversed(r.stdout.splitlines()):
        if line.startswith("{"):
            try:
                res = json.loads(line)
                break
            except ValueError:
                pass
    if not res.get("ok") or not (out / "index.html").exists():
        return call_retry("POST", f"/runner/{jid}/finish", {"result": "error", "error": "Проверка балансов не удалась.", "log": redact(r.stdout + r.stderr)[-1500:]})
    for f in sorted(out.iterdir()):
        call_retry("PUT", f"/runner/{jid}/file?path={urllib.parse.quote(f.name)}", file=f, timeout=300)
    crit, warn = res.get("critical") or [], res.get("warn") or []
    summary = (f"## Что сделано\nПроверил балансы, лимиты и подписки: {res.get('items', 0)} проверок.\n\n## Главное\n"
               + ("\n".join([f"- **Срочно:** {x}" for x in crit] + [f"- Скоро: {x}" for x in warn]) or "- Всё в порядке — офис работает без перебоев.")
               + "\n\n## Материалы\n- out/index.html — светофор по всем сервисам\n- out/balances.json — те же данные для разбора")
    call_retry("POST", f"/runner/{jid}/finish", {"result": "review", "main": "index.html", "summary": summary[:4000],
                                                 "history": "Проверка балансов и подписок сервисов офиса.", "alerts": {"critical": crit, "warn": warn},
                                                 "usage": {"ms": int((time.time() - started) * 1000)}})
    log(jid, f"balances: {len(crit)} critical, {len(warn)} warn")


# ---------- одна задача ----------

def free_bytes():
    try:
        return shutil.disk_usage(JOBS).free
    except OSError:
        return 0


def _size(p):
    n = 0
    for root, _, files in os.walk(p):
        for f in files:
            try:
                n += os.lstat(os.path.join(root, f)).st_size
            except OSError:
                pass
    return n


def _newest(p):
    t = p.stat().st_mtime
    for root, dirs, files in os.walk(p):
        for f in files + dirs:
            try:
                t = max(t, os.lstat(os.path.join(root, f)).st_mtime)
            except OSError:
                pass
    return t


def tidy_disk(need=DISK_LOW, keep=()):
    """Мало места: кэши, затем свои папки задач — самые старые первыми, пока свободно меньше need.
    Папки задач в работе и тронутые за DISK_KEEP_H часов остаются. Удалённую папку офис восстановит
    при правке (restore — принятый результат скачивается обратно в out/). Возвращает освобождённые байты."""
    if free_bytes() >= need:
        return 0
    freed = 0
    for c in CACHES:
        if c.exists():
            n = _size(c)
            shutil.rmtree(c, ignore_errors=True)
            freed += n
            log(f"disk: cache {c} removed, {n / 1e6:.0f} MB")
    if free_bytes() >= need:
        return freed
    edge = time.time() - DISK_KEEP_H * 3600
    dirs = []
    for d in JOBS.iterdir() if JOBS.exists() else []:
        if not d.is_dir() or d.name in RUNNING or d.name in keep:
            continue
        try:
            t = _newest(d)
        except OSError:
            continue
        if t < edge:
            dirs.append((t, d))
    for _, d in sorted(dirs):
        if free_bytes() >= need:
            break
        n = _size(d)
        shutil.rmtree(d, ignore_errors=True)
        freed += n
        log(d.name, f"disk: folder removed for space, {n / 1e6:.0f} MB")
    log(f"disk: freed {freed / 1e9:.1f} GB, free {free_bytes() / 1e9:.1f} GB")
    return freed


def is_nospace(e):
    return getattr(e, "errno", None) == 28 or "No space left on device" in str(e)


def run_job(job):
    if job["kind"] == "transcribe" or (job["kind"] == "run" and job.get("agent") == "transcriber"):
        return run_transcribe(job)
    if job["kind"] == "run" and job.get("agent") == "billing":
        return run_balances(job)
    jid, kind = job["id"], job["kind"]
    d = JOBS / jid
    (d / "in").mkdir(parents=True, exist_ok=True)
    out = d / "out"
    if kind == "run" and out.exists():
        shutil.rmtree(out)
    out.mkdir(exist_ok=True)
    for rel in job.get("restore") or []:
        target = out / rel
        if target.exists() or ".." in Path(rel).parts:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(f"{API}/runner/{jid}/result/{urllib.parse.quote(rel)}", headers={"authorization": "Bearer " + TOKEN})
        try:
            with urllib.request.urlopen(req, timeout=600) as r, open(target, "wb") as f:
                shutil.copyfileobj(r, f)
        except urllib.error.HTTPError as e:
            target.unlink(missing_ok=True)
            log(jid, "restore", rel, e.code)
    for name in job.get("files") or []:
        target = d / "in" / Path(name).name
        if not target.exists():
            req = urllib.request.Request(f"{API}/runner/{jid}/input/{urllib.parse.quote(name)}", headers={"authorization": "Bearer " + TOKEN})
            with urllib.request.urlopen(req, timeout=600) as r, open(target, "wb") as f:
                shutil.copyfileobj(r, f)

    cancelled, stop, lock = threading.Event(), threading.Event(), threading.Lock()
    last = {"at": 0.0, "text": "", "pending": "", "ping": time.time()}
    proc = {}

    # не чаще шага в 4 секунды; придержанный шаг уходит позже, а не теряется
    def step(text, force=False):
        text = (text or "").strip()
        with lock:
            if not text or text == last["text"]:
                return
            if not force and time.time() - last["at"] < 4:
                last["pending"] = text
                return
            last.update(at=time.time(), text=text, pending="")
        send(text)

    def send(text):
        last["ping"] = time.time()
        try:
            _, r = call("POST", f"/runner/{jid}/step", {"text": text} if text else {})
            if r and r.get("cancelled"):
                cancelled.set()
                if proc.get("p"):
                    proc["p"].kill()
        except Exception as e:  # шаг не дошёл — не страшно, работа идёт
            log("step:", e)

    # придержанные шаги и отмена владельцем — и тогда, когда агент долго молчит (рендер, установка)
    def poll():
        while not stop.wait(1.5):
            if last["pending"] and time.time() - last["at"] >= 4:
                step(last["pending"])
            elif time.time() - last["ping"] > 20:
                send("")

    # инструменты: контролёр только читает; действия во внешних системах — только после «Выполнить» владельца
    qa = kind == "qa"
    tools = list(QA_TOOLS if qa else ALLOWED_TOOLS)
    for sv in MCP["servers"]:
        tools += sv["read"] + (sv["write"] if kind == "execute" else [])
    args = [CLAUDE, "-p", job["prompt"], "--output-format", "stream-json", "--verbose",
            "--permission-mode", "default" if qa else "acceptEdits", "--allowedTools", *tools,
            "--disallowedTools", *DENIED_TOOLS,
            "--add-dir", str(d), str(SKILLS), "--model", MODEL, "--effort", job.get("effort") or EFFORT]
    if MCP["config"]:
        args += ["--mcp-config", MCP["config"]]
    if job.get("session"):
        args += ["--resume", job["session"]]

    # общий слот тяжёлых задач — только рендеру видео (heavy от офиса; старый офис без поля — как раньше, всем, кроме проверки)
    heavy = job.get("heavy", True) and not qa
    busy = slot_busy() if heavy else ""
    if busy:
        step(f"Ждёт очереди сервера: сейчас работает {busy}.", force=True)
    slot = HeavySlot("офис hq2: " + job.get("title", "")[:60]) if heavy else None
    if slot:
        slot.__enter__()
    try:
        step("Проверяет результат." if qa else "Начал работу.", force=True)
        if cancelled.is_set():
            log(jid, "cancelled before start")
            return
        logf = open(d / "claude.log", "a", encoding="utf-8")
        p = proc["p"] = subprocess.Popen(args, cwd=d, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=logf, text=True, bufsize=1, env=CHILD_ENV)
        timer = threading.Timer(LIMIT, p.kill)
        timer.start()
        threading.Thread(target=poll, daemon=True).start()
        session, final, started, ooms, result_ev = job.get("session", ""), "", time.time(), oom_kills(), None
        try:
            for line in p.stdout:
                logf.write(line)
                if cancelled.is_set():
                    p.kill()
                    break
                try:
                    ev = json.loads(line)
                except ValueError:
                    continue
                session = ev.get("session_id") or session
                if oom_kills() > ooms and not proc.get("oom"):
                    proc["oom"] = True
                    step("Не хватило памяти — ядро убило тяжёлый процесс, агент пробует продолжить.", force=True)
                if ev.get("type") == "assistant":
                    for item in (ev.get("message") or {}).get("content") or []:
                        step(describe(item))
                elif ev.get("type") == "result":
                    final, result_ev = ev.get("result") or "", ev
            p.wait()
        finally:
            timer.cancel()
            stop.set()
            logf.close()
    finally:
        if slot:
            slot.__exit__()

    if cancelled.is_set():
        log(jid, "stopped by the owner (cancel or pause)")
        # на паузе сервер хранит сессию, чтобы «Продолжить» шло с того же места
        sid = locals().get("session") or job.get("session") or ""
        if sid:
            try:
                call("POST", f"/runner/{jid}/session", {"session": sid})
            except Exception as e:
                log("session:", e)
        return
    usage = usage_of(result_ev, started)
    mins = (time.time() - started) / 60
    oom = oom_kills() > ooms

    if qa:
        verdict = re.search(r"^QA:\s*(ok|fix)\b", final, re.M | re.I)
        notes = re.sub(r"^QA:.*$", "", final, flags=re.M).strip()[-3000:]
        if p.returncode != 0 and not verdict:
            why = claude_error((d / "claude.log").read_text(encoding="utf-8", errors="ignore")[-20000:])
            return call_retry("POST", f"/runner/{jid}/finish", {"result": "error", "error": f"Контролёр не смог проверить (код {p.returncode}). {why}".strip(), "usage": usage})
        call_retry("POST", f"/runner/{jid}/finish", {"result": "qa", "verdict": (verdict.group(1).lower() if verdict else "ok"), "notes": notes, "usage": usage})
        log(jid, "qa:", verdict.group(1) if verdict else "no verdict", f"{mins:.1f} min")
        return

    need = re.search(r"^NEED:\s*(.+)$", final, re.M)
    res = re.search(r"^RESULT:\s*(\S+)", final, re.M)
    hist = re.search(r"^SUMMARY:\s*(.+)$", final, re.M)
    approve = [] if kind == "execute" else [m.strip() for m in re.findall(r"^APPROVE:\s*(.+)$", final, re.M) if m.strip()][:10]
    summary = re.sub(r"^(RESULT|NEED|SUMMARY|APPROVE):.*$", "", final, flags=re.M).strip()[-8000:]
    if need and not res and not approve:
        call_retry("POST", f"/runner/{jid}/finish", {"result": "need", "question": need.group(1).strip(), "session": session, "usage": usage})
        log(jid, "need:", need.group(1)[:80])
        return
    files = [f for f in sorted(out.rglob("*")) if f.is_file() and not any(x.startswith(".") for x in f.relative_to(out).parts)]
    if p.returncode != 0 and not files and not approve:
        text = (d / "claude.log").read_text(encoding="utf-8", errors="ignore")
        why = claude_error(text[-20000:])
        call_retry("POST", f"/runner/{jid}/finish", {"result": "error", "session": session, "usage": usage,
             "error": f"Агент не закончил ({mins:.0f} мин, код {p.returncode})." + (" " + OOM_HINT if oom else " Превышен лимит времени." if mins * 60 >= LIMIT - 5 else f" Claude Code: {why}" if why else ""),
             "log": redact(text[-1500:])})
        log(jid, "error code", p.returncode, "oom" if oom else "")
        return
    if files:
        step(f"Отправляет результат: {len(files)} файл(ов).", force=True)
    for f in files[:300]:
        size = f.stat().st_size
        if size > FILE_LIMIT:
            continue
        rel = f.relative_to(out).as_posix()
        call_retry("PUT", f"/runner/{jid}/file?path={urllib.parse.quote(rel)}", file=f, timeout=900)
    main = res.group(1).strip() if res else ""
    body = {"main": main, "summary": summary, "history": hist.group(1).strip() if hist else "", "session": session, "usage": usage}
    if approve:
        call_retry("POST", f"/runner/{jid}/finish", {"result": "approve", "actions": approve, **body})
        log(jid, f"approve: {len(approve)} action(s), {mins:.1f} min")
        return
    call_retry("POST", f"/runner/{jid}/finish", {"result": "review", **body})
    log(jid, f"review in {mins:.1f} min, {len(files)} files, main {main}, ${usage['cost']}")

def skills_report():
    """Все скиллы этого сервера (~/.claude/skills): имя, описание из шапки SKILL.md и сам текст — двойнику в офисе."""
    out = []
    for f in sorted(SKILLS.glob("*/SKILL.md")) if SKILLS.exists() else []:
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        name, desc = f.parent.name, ""
        m = re.match(r"^---\s*\n(.*?)\n---", text, re.S)
        if m:
            head = m.group(1)
            n = re.search(r"^name:\s*(.+)$", head, re.M)
            if n:
                name = n.group(1).strip().strip("'\"")
            d = re.search(r"^description:\s*(.*(?:\n[ \t]+.*)*)", head, re.M)
            if d:
                desc = re.sub(r"\s+", " ", d.group(1).lstrip(">|-").strip()).strip("'\"")
        out.append({"name": name, "description": desc[:600], "text": text[:20000]})
    return out


def main():
    if not TOKEN:
        raise SystemExit("HQ_DESK_RUNNER_TOKEN is not set")
    JOBS.mkdir(parents=True, exist_ok=True)
    log(f"hq runner {VERSION}: api {API}, claude {CLAUDE} ({'есть' if Path(CLAUDE).exists() else 'НЕ НАЙДЕН'}), skills {len(list(SKILLS.glob('*/SKILL.md'))) if SKILLS.exists() else 0}, model {MODEL}")
    global MCP
    MCP = load_mcp()
    check = selftest()
    check["auth"] = auth_source()
    log(f"вход Claude: {check['auth']}")
    tidy_disk()
    log(f"диск: свободно {free_bytes() / 1e9:.1f} ГБ")
    log("проверка Claude: " + ("ок" if check["ok"] else "ошибка — " + check["error"]))
    while True:
        try:
            call("POST", "/runner/hello", {"version": VERSION, "claude": check,
                                           "mcp": [{"name": x["name"], "read": len(x["read"]), "write": len(x["write"]), "error": x["error"]} for x in MCP["servers"]]})
            break
        except Exception as e:
            log("hello:", e)
            time.sleep(15)
    try:
        sk = skills_report()
        call("POST", "/runner/skills", {"skills": sk}, timeout=120)
        log(f"скиллы отправлены в офис: {len(sk)}")
    except Exception as e:
        log("skills:", e)
    workers = [threading.Thread(target=worker, args=(i,), daemon=True, name=f"w{i}") for i in range(WORKERS)]
    for w in workers:
        w.start()
    log(f"потоков: {WORKERS} (первый — любые задачи, остальные — лёгкие)")
    for w in workers:
        w.join()


KEYS_FILE = Path(os.path.expanduser(os.environ.get("HQ_KEYS_FILE") or str(HOME / "hq-runner/keys.env")))
KEYS_LOCK = threading.Lock()


def update_keys(keys):
    """Токены Instagram/Threads, которые офис продлевает сам (assistant/tokens.mjs), — в keys.env для скриптов аналитики."""
    if not isinstance(keys, dict) or not keys:
        return
    with KEYS_LOCK:
        try:
            lines = KEYS_FILE.read_text().splitlines() if KEYS_FILE.exists() else []
            have = {l.split("=", 1)[0]: l.split("=", 1)[1] for l in lines if "=" in l}
            new = {k: str(v).strip() for k, v in keys.items() if re.fullmatch(r"[A-Z0-9_]{2,40}", str(k)) and v and "\n" not in str(v)}
            if all(have.get(k) == v for k, v in new.items()):
                return
            out = [l for l in lines if l.split("=", 1)[0] not in new] + [f"{k}={v}" for k, v in new.items()]
            KEYS_FILE.parent.mkdir(parents=True, exist_ok=True)
            tmp = KEYS_FILE.with_suffix(".tmp")
            tmp.write_text("\n".join(out) + "\n")
            os.chmod(tmp, 0o600)
            tmp.replace(KEYS_FILE)
            log("keys:", ", ".join(sorted(new)), "обновлены")
        except Exception as e:
            log("keys:", e)


def purge(ids):
    """Папки задач, закрытых давно: офис хранит их результат сам, исполнителю они больше не нужны."""
    for jid in ids or []:
        d = JOBS / Path(str(jid)).name
        if jid in RUNNING or not d.is_dir():
            continue
        shutil.rmtree(d, ignore_errors=True)
        log(jid, "folder purged")


def worker(i):
    wid = f"{socket.gethostname()}-{os.getpid()}-{i}"
    light = i > 0
    while True:
        try:
            # первый поток при лёгких соседях сначала берёт рендер — лёгкая работа уходит им параллельно
            status, job = call("POST", "/runner/claim", {"worker": wid, "light": light, "prefer_heavy": not light and WORKERS > 1})
        except urllib.error.HTTPError as e:
            log("claim:", e.code)
            time.sleep(30)
            continue
        except Exception as e:
            log("claim:", e)
            time.sleep(15)
            continue
        if job:
            purge(job.get("purge"))
            update_keys(job.get("keys"))
        if status == 204 or not job or job.get("idle"):
            time.sleep(5 if not light else 3)
            continue
        log(f"[{i}] job", job["id"], job["kind"], job.get("agent"), job.get("title", "")[:60], "heavy" if job.get("heavy") else "light")
        RUNNING.add(job["id"])
        try:
            with DISK_LOCK:
                tidy_disk(DISK_LOW, keep=(job["id"],))
                left = free_bytes()
            if left < DISK_MIN:
                log(job["id"], f"disk: only {left / 1e9:.1f} GB free — not started")
                call_retry("POST", f"/runner/{job['id']}/finish", {"result": "error", "error": NOSPACE.format(f" (свободно {left / 1e9:.1f} ГБ)")})
                continue
            run_job(job)
        except Exception as e:
            log("job failed:", repr(e))
            if is_nospace(e):
                with DISK_LOCK:
                    tidy_disk(DISK_LOW, keep=(job["id"],))
                err = NOSPACE.format("")
            else:
                err = "Исполнитель упал: " + str(e)[:300]
            try:
                call("POST", f"/runner/{job['id']}/finish", {"result": "error", "error": err})
            except Exception:
                pass
        finally:
            RUNNING.discard(job["id"])


if __name__ == "__main__":
    main()
