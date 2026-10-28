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
"""
import fcntl
import json
import os
import re
import shutil
import subprocess
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
VERSION = "1"
FILE_LIMIT = 300_000_000


def log(*a):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


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
    if name == "TodoWrite":
        todos = inp.get("todos") or []
        cur = next((t.get("activeForm") or t.get("content") for t in todos if t.get("status") == "in_progress"), "")
        return f"План: {cur}" if cur else ""
    return ""


# ---------- одна задача ----------

def run_job(job):
    jid, kind = job["id"], job["kind"]
    d = JOBS / jid
    (d / "in").mkdir(parents=True, exist_ok=True)
    out = d / "out"
    if kind == "run" and out.exists():
        shutil.rmtree(out)
    out.mkdir(exist_ok=True)
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

    busy = slot_busy()
    if busy:
        step(f"Ждёт очереди сервера: сейчас работает {busy}.", force=True)
    with HeavySlot("офис hq2: " + job.get("title", "")[:60]):
        step("Начал работу.", force=True)
        if cancelled.is_set():
            log(jid, "cancelled before start")
            return
        args = [CLAUDE, "-p", job["prompt"], "--output-format", "stream-json", "--verbose",
                "--permission-mode", "acceptEdits", "--allowedTools", *ALLOWED_TOOLS,
                "--add-dir", str(d), str(SKILLS), "--model", MODEL, "--effort", EFFORT]
        if job.get("session"):
            args += ["--resume", job["session"]]
        logf = open(d / "claude.log", "a", encoding="utf-8")
        p = proc["p"] = subprocess.Popen(args, cwd=d, stdout=subprocess.PIPE, stderr=logf, text=True, bufsize=1)
        timer = threading.Timer(LIMIT, p.kill)
        timer.start()
        threading.Thread(target=poll, daemon=True).start()
        session, final, started = job.get("session", ""), "", time.time()
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
                if ev.get("type") == "assistant":
                    for item in (ev.get("message") or {}).get("content") or []:
                        step(describe(item))
                elif ev.get("type") == "result":
                    final = ev.get("result") or ""
            p.wait()
        finally:
            timer.cancel()
            stop.set()
            logf.close()

    if cancelled.is_set():
        log(jid, "cancelled by the owner")
        return
    mins = (time.time() - started) / 60
    need = re.search(r"^NEED:\s*(.+)$", final, re.M)
    res = re.search(r"^RESULT:\s*(\S+)", final, re.M)
    hist = re.search(r"^SUMMARY:\s*(.+)$", final, re.M)
    summary = re.sub(r"^(RESULT|NEED|SUMMARY):.*$", "", final, flags=re.M).strip()[-1200:]
    if need and not res:
        call_retry("POST", f"/runner/{jid}/finish", {"result": "need", "question": need.group(1).strip(), "session": session})
        log(jid, "need:", need.group(1)[:80])
        return
    files = [f for f in sorted(out.rglob("*")) if f.is_file() and not any(x.startswith(".") for x in f.relative_to(out).parts)]
    if p.returncode != 0 and not files:
        tail = (d / "claude.log").read_text(encoding="utf-8", errors="ignore")[-600:]
        call_retry("POST", f"/runner/{jid}/finish", {"result": "error", "session": session,
             "error": f"Агент не закончил ({mins:.0f} мин, код {p.returncode})." + (" Превышен лимит времени." if mins * 60 >= LIMIT - 5 else ""), "log": tail})
        log(jid, "error code", p.returncode)
        return
    step(f"Отправляет результат: {len(files)} файл(ов).", force=True)
    for f in files[:300]:
        size = f.stat().st_size
        if size > FILE_LIMIT:
            continue
        rel = f.relative_to(out).as_posix()
        call_retry("PUT", f"/runner/{jid}/file?path={urllib.parse.quote(rel)}", file=f, timeout=900)
    main = res.group(1).strip() if res else ""
    call_retry("POST", f"/runner/{jid}/finish", {"result": "review", "main": main, "summary": summary, "history": hist.group(1).strip() if hist else "", "session": session})
    log(jid, f"review in {mins:.1f} min, {len(files)} files, main {main}")


def main():
    if not TOKEN:
        raise SystemExit("HQ_DESK_RUNNER_TOKEN is not set")
    JOBS.mkdir(parents=True, exist_ok=True)
    log(f"hq runner {VERSION}: api {API}, claude {CLAUDE} ({'есть' if Path(CLAUDE).exists() else 'НЕ НАЙДЕН'}), skills {len(list(SKILLS.glob('*/SKILL.md'))) if SKILLS.exists() else 0}, model {MODEL}")
    while True:
        try:
            call("POST", "/runner/hello", {"version": VERSION})
            break
        except Exception as e:
            log("hello:", e)
            time.sleep(15)
    while True:
        try:
            status, job = call("POST", "/runner/claim", {})
        except urllib.error.HTTPError as e:
            log("claim:", e.code)
            time.sleep(30)
            continue
        except Exception as e:
            log("claim:", e)
            time.sleep(15)
            continue
        if status == 204 or not job:
            time.sleep(5)
            continue
        log("job", job["id"], job["kind"], job.get("agent"), job.get("title", "")[:60])
        try:
            run_job(job)
        except Exception as e:
            log("job failed:", repr(e))
            try:
                call("POST", f"/runner/{job['id']}/finish", {"result": "error", "error": "Исполнитель упал: " + str(e)[:300]})
            except Exception:
                pass


if __name__ == "__main__":
    main()
