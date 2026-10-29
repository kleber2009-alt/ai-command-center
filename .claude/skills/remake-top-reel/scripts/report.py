#!/usr/bin/env python3
"""Сайт-пульт: собрать документ прогона для страницы «Ремейк залёта» → <задача>/run.json

  python3 report.py <slug> [--title T] [--status running|waiting|done|failed] [--headline "что сейчас"]
                           [--step <id> <run|done|wait|fail|skip> ["заметка"]] ... [--log "событие"] ...
                           [--asset ключ=asset_id ...] [--media ключ=файл ...] [--data-source "…"]
                           [--push] [--export <папка>]

Шаги: scan pick grab transcribe script check avatar montage deliver. Статусы и журнал копятся в <задача>/site_state.json,
всё остальное берётся из файлов задачи: source.json, _scan/candidates.json, transcript.json, script.txt, check.json,
heygen.json, caption.txt. Свободные поля (разбор сценария, «почему этот», образ аватара, стиль) — из
<задача>/site_extra.json, он сливается поверх. Картинки и видео на странице — только загруженные в артефакт:
--asset sheet=<id> thumb=<id> avatar=<id> final=<id> thumb_<rank>=<id>.

Два места показа:
  страница в claude.ai (site.url) — Claude пишет run.json в её базу: ArtifactData set, collection "runs", doc_id = slug,
    file_path = run.json (и один раз за прогон — doc "remake/state" = {"current": slug}); картинки — --asset (id хранилища);
  сайт remake.aicex.club (site.public_url) — --push: файлы из --media (thumb, sheet, avatar, final, thumb_<rank>) уходят
    в PUT /api/media, документ site-run.json — в PUT /api/runs/<slug>. Нужен REMAKE_SITE_TOKEN (окружение или профиль
    оболочки); без него --push пропускается с пометкой. --export <папка> — то же, но в файлы (стартовые данные сайта:
    apps/remake-site/seed).
"""
import argparse, datetime, json, os, re, shutil, sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # и под python3 -I
from common import SCAN, HTTPError, _merge, config, http, job_dir, read_json, secret, write_json

STEPS = ("scan", "pick", "grab", "transcribe", "script", "check", "avatar", "montage", "deliver")
LOG_MAX = 80


def now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def text(p) -> str:
    try:
        return open(p).read().strip()
    except OSError:
        return ""


def build(job, st: dict, site: bool = False) -> dict:
    """Документ прогона. site=False — картинки как id хранилища артефакта, site=True — как media/<файл> сайта."""
    src, tr = read_json(job / "source.json", {}), read_json(job / "transcript.json", {})
    chk, hg = read_json(job / "check.json", {}), read_json(job / "heygen.json", {})
    assets = {k: "media/" + m["name"] for k, m in st.get("media", {}).items()} if site else st.get("assets", {})
    cands = []
    for r in (read_json(SCAN / "candidates.json", {}) or {}).get("items", []):
        cands.append({"rank": r.get("rank"), "url": r.get("url"), "date": r.get("date"), "code": r.get("code"),
                      "views": r.get("views"), "comments": r.get("comments"), "shares": r.get("spread"), "leads": r.get("leads"),
                      "likes": r.get("likes"), "score": r.get("score"), "caption": " ".join((r.get("caption") or "").split())[:160],
                      "thumb": assets.get(f"thumb_{r.get('rank')}"),
                      "chosen": bool(src) and (r.get("url") == src.get("url") or str(r.get("id")) == str(src.get("id")))})
    lines = [{"kind": k, "text": t} for k in ("fail", "warn", "ok") for t in chk.get(k, [])]
    shares = [x for x in (src.get("shares"), src.get("reposts")) if x is not None]
    run = {
        "slug": job.name, "title": st.get("title") or job.name, "status": st.get("status", "running"),
        "headline": st.get("headline", ""), "started_at": st.get("started_at") or now(), "updated_at": now(),
        "data_source": st.get("data_source", ""), "steps": st.get("steps", {}), "log": st.get("log", [])[-LOG_MAX:],
        "source": {"url": src.get("url"), "date": src.get("date"), "caption": src.get("caption"), "code": src.get("code"),
                   "views": src.get("views"), "comments": src.get("comments"), "shares": sum(shares) if shares else None,
                   "leads": src.get("leads"), "likes": src.get("likes"), "duration": src.get("duration"),
                   "thumb": assets.get("thumb"), "sheet": assets.get("sheet")},
        "candidates": cands,
        "transcript": {k: tr.get(k) for k in ("text", "engine", "wps", "speech_ratio", "duration")} if tr else {},
        "script": {"original": text(job / "transcript.txt"), "remake": text(job / "script.txt")},
        "check": {"result": ("FAIL" if chk.get("fail") else "PASS"), "overlap": chk.get("overlap"), "common_run": chk.get("common_run"),
                  "est_sec": chk.get("est_sec"), "words": chk.get("words"), "lines": lines} if chk else {},
        "avatar": {"video": assets.get("avatar"), "video_id": hg.get("video_id"), "duration": hg.get("duration")},
        "montage": {"video": assets.get("final")},
        "caption": text(job / "caption.txt"),
    }
    if tr:
        sr, wps = tr.get("speech_ratio") or 0, tr.get("wps") or 0
        run["transcript"]["verdict"] = "говорящая голова" if sr >= 0.6 and wps >= 1.5 else "мало речи"
    extra = read_json(job / "site_extra.json", {})
    return _merge(run, extra) if extra else run


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("job")
    ap.add_argument("--title")
    ap.add_argument("--status", choices=("running", "waiting", "done", "failed"))
    ap.add_argument("--headline")
    ap.add_argument("--step", nargs="+", action="append", default=[], metavar="ШАГ СОСТОЯНИЕ [ЗАМЕТКА]")
    ap.add_argument("--log", action="append", default=[])
    ap.add_argument("--asset", nargs="+", default=[])
    ap.add_argument("--media", nargs="+", default=[], help="ключ=путь к jpg/png/webp/mp4 для сайта")
    ap.add_argument("--data-source")
    ap.add_argument("--push", action="store_true", help="отправить прогон на сайт (REMAKE_SITE_TOKEN)")
    ap.add_argument("--export", help="записать прогон и его файлы в папку (runs/, media/) — стартовые данные сайта")
    a = ap.parse_args()

    job = job_dir(a.job, create=True)
    sp = job / "site_state.json"
    st = read_json(sp, {}) or {}
    st.setdefault("started_at", now())
    for k in ("title", "status", "headline", "data_source"):
        if getattr(a, k) is not None:
            st[k] = getattr(a, k)
    for step in a.step:
        sid, state, note = step[0], (step[1] if len(step) > 1 else "run"), " ".join(step[2:])
        if sid not in STEPS or state not in ("todo", "run", "done", "wait", "fail", "skip"):
            sys.exit(f"--step: шаг из {', '.join(STEPS)} и состояние run|done|wait|fail|skip — получил {step}")
        cur = st.setdefault("steps", {}).get(sid, {})
        cur.update(state=state, at=now())
        if note:
            cur["note"] = note
        st["steps"][sid] = cur
    for line in a.log:
        st.setdefault("log", []).append({"at": now(), "text": line})
    for kv in a.asset:
        k, _, v = kv.partition("=")
        if not v:
            sys.exit(f"нужно ключ=asset_id: {kv}")
        st.setdefault("assets", {})[k] = v
    for kv in a.media:
        k, _, v = kv.partition("=")
        f = Path(os.path.expanduser(v)).resolve()
        if not v or not f.is_file() or f.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp", ".mp4"):
            sys.exit(f"--media: нужно ключ=путь к jpg/png/webp/mp4: {kv}")
        name = re.sub(r"[^a-z0-9._-]+", "-", f"{job.name}-{k}".lower()) + f.suffix.lower()
        st.setdefault("media", {})[k] = {"src": str(f), "name": name}
    write_json(sp, st)
    run = build(job, st)
    write_json(job / "run.json", run)
    write_json(job / "site-run.json", build(job, st, site=True))
    if a.export:
        out = Path(os.path.expanduser(a.export))
        for k, m in st.get("media", {}).items():
            (out / "media").mkdir(parents=True, exist_ok=True)
            shutil.copy2(m["src"], out / "media" / m["name"])
        (out / "runs").mkdir(parents=True, exist_ok=True)
        shutil.copy2(job / "site-run.json", out / "runs" / f"{job.name}.json")
        print(f"EXPORT {out}: runs/{job.name}.json + {len(st.get('media', {}))} файл(ов) в media/")
    if a.push:
        push(job, st, sp)
    size = (job / "run.json").stat().st_size
    print(json.dumps({"ok": True, "file": str(job / "run.json"), "bytes": size, "status": run["status"],
                      "steps": {k: v.get("state") for k, v in run["steps"].items()}}, ensure_ascii=False))
    if size > 240_000:
        print("WARN run.json больше 240 КБ — база страницы принимает до 256 КБ на документ; сократи расшифровку или журнал")


def push(job, st: dict, sp):
    base = (os.environ.get("REMAKE_SITE_URL") or config().get("site", {}).get("public_url", "")).rstrip("/")
    token = secret("REMAKE_SITE_TOKEN")
    if not base or not token:
        print("NOTE сайт пропущен: нет " + ("REMAKE_SITE_TOKEN" if base else "site.public_url / REMAKE_SITE_URL"))
        return
    auth = {"Authorization": f"Bearer {token}"}
    types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4"}
    try:
        for k, m in st.get("media", {}).items():
            f = Path(m["src"])
            stamp = f"{f.stat().st_size}:{int(f.stat().st_mtime)}"
            if m.get("pushed") == stamp:
                continue  # этот файл сайт уже получил
            http(f"{base}/api/media/{m['name']}", method="PUT", data=f.read_bytes(),
                 headers={**auth, "Content-Type": types[f.suffix.lower()]}, timeout=600)
            m["pushed"] = stamp
        write_json(sp, st)
        http(f"{base}/api/runs/{job.name}", method="PUT", data=(job / "site-run.json").read_bytes(),
             headers={**auth, "Content-Type": "application/json"}, timeout=60)
        print(f"PUSH {base}/#{job.name}")
    except (HTTPError, OSError) as e:
        print(f"WARN сайт не принял прогон: {e} — прогон продолжается, повтори --push позже")


if __name__ == "__main__":
    main()
