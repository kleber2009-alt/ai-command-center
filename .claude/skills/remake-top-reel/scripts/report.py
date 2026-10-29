#!/usr/bin/env python3
"""Сайт-пульт: собрать документ прогона для страницы «Ремейк залёта» → <задача>/run.json

  python3 report.py <slug> [--title T] [--status running|waiting|done|failed] [--headline "что сейчас"]
                           [--step <id> <run|done|wait|fail|skip> ["заметка"]] ... [--log "событие"] ...
                           [--asset ключ=asset_id ...] [--data-source "…"]

Шаги: scan pick grab transcribe script check avatar montage deliver. Статусы и журнал копятся в <задача>/site_state.json,
всё остальное берётся из файлов задачи: source.json, _scan/candidates.json, transcript.json, script.txt, check.json,
heygen.json, caption.txt. Свободные поля (разбор сценария, «почему этот», образ аватара, стиль) — из
<задача>/site_extra.json, он сливается поверх. Картинки и видео на странице — только загруженные в артефакт:
--asset sheet=<id> thumb=<id> avatar=<id> final=<id> thumb_<rank>=<id>.

Дальше Claude пишет run.json в базу страницы: ArtifactData set, collection "runs", doc_id = slug, file_path = run.json
(и один раз за прогон — doc "remake/state" = {"current": slug}). Адрес страницы — site.url в config.json.
"""
import argparse, datetime, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # и под python3 -I
from common import SCAN, _merge, job_dir, read_json, write_json

STEPS = ("scan", "pick", "grab", "transcribe", "script", "check", "avatar", "montage", "deliver")
LOG_MAX = 80


def now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def text(p) -> str:
    try:
        return open(p).read().strip()
    except OSError:
        return ""


def build(job, st: dict) -> dict:
    src, tr = read_json(job / "source.json", {}), read_json(job / "transcript.json", {})
    chk, hg = read_json(job / "check.json", {}), read_json(job / "heygen.json", {})
    assets = st.get("assets", {})
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
    ap.add_argument("--data-source")
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
    write_json(sp, st)
    run = build(job, st)
    write_json(job / "run.json", run)
    size = (job / "run.json").stat().st_size
    print(json.dumps({"ok": True, "file": str(job / "run.json"), "bytes": size, "status": run["status"],
                      "steps": {k: v.get("state") for k, v in run["steps"].items()}}, ensure_ascii=False))
    if size > 240_000:
        print("WARN run.json больше 240 КБ — база страницы принимает до 256 КБ на документ; сократи расшифровку или журнал")


if __name__ == "__main__":
    main()
