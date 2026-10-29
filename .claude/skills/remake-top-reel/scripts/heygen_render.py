#!/usr/bin/env python3
"""Шаг 6. Аватар HeyGen говорит новый сценарий голосом Ильи → <задача>/<slug>.mp4

  python3 heygen_render.py <slug> [--dry-run] [--look ID] [--voice ID] [--no-wait] [--force]   REST (HEYGEN_API_KEY)
  python3 heygen_render.py <slug> --resume                                                    дождаться уже отправленного
  python3 heygen_render.py <slug> --fetch <video_url> [--id <video_id>]                       забрать результат из MCP HeyGen

Без --force не отправляет, если check.json последней проверки с FAIL. Образ и голос — avatar.look_id / avatar.voice_id
из config.json (личные правки — settings.py). Один вызов ждёт до --wait-min минут (по умолчанию 9 — влезает в лимит
команды Bash у Claude), опрос раз в 20 с; не успел — код выхода 3, повтори --resume. --no-wait — только отправить. Готовое видео: <задача>/<slug>.mp4 (это «сырьё» для скилла монтажа) и avatar_sheet.jpg.
"""
import argparse, datetime, json, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # и под python3 -I
from common import HTTPError, avatar_engine, config, download, http_json, job_dir, probe, read_json, secret, sheet, write_json

API = "https://api.heygen.com"


def key() -> str:
    k = secret("HEYGEN_API_KEY")
    if not k:
        sys.exit("нет HEYGEN_API_KEY (окружение или профиль оболочки). В чате с Claude — путь через MCP HeyGen, см. SKILL.md шаг 6.")
    return k


def quota(k: str):
    try:
        d = http_json(f"{API}/v2/user/remaining_quota", headers={"X-Api-Key": k}, timeout=30)
        return (d.get("data") or {}).get("remaining_quota")
    except (HTTPError, OSError):
        return None


def finish(job, slug: str, url: str, state: dict):
    out = job / f"{slug}.mp4"
    download(url, out)
    meta = probe(out)
    sheet(out, job / "avatar_sheet.jpg")
    state.update(status="completed", video_url=url, file=str(out), duration=meta["duration"], done_at=datetime.datetime.now().isoformat(timespec="seconds"))
    write_json(job / "heygen.json", state)
    print(json.dumps({"ok": True, "file": str(out), "duration": meta["duration"], "audio": meta["audio"],
                      "size": f"{meta['width']}x{meta['height']}", "sheet": str(job / "avatar_sheet.jpg")}, ensure_ascii=False))
    if not meta["audio"]:
        sys.exit("WARN у видео аватара нет звука — проверь голос в HeyGen")


def poll(job, slug: str, k: str, state: dict, limit_min: float = 9):
    vid, t0 = state["video_id"], time.time()
    last = ""
    while time.time() - t0 < limit_min * 60:
        try:
            d = (http_json(f"{API}/v1/video_status.get?video_id={vid}", headers={"X-Api-Key": k}, timeout=30).get("data") or {})
        except (HTTPError, OSError) as e:
            print(f"NOTE опрос не удался ({e}) — пробую ещё")
            time.sleep(20)
            continue
        st = d.get("status", "unknown")
        if st != last:
            print(f"STATUS {st} · {int(time.time() - t0)} с")
            last = st
        if st == "completed" and d.get("video_url"):
            return finish(job, slug, d["video_url"], state)
        if st == "failed":
            err = d.get("error") or {}
            msg = err.get("detail") or err.get("message") or json.dumps(err, ensure_ascii=False)
            state.update(status="failed", error=msg)
            write_json(job / "heygen.json", state)
            hint = (" — закончились кредиты HeyGen: пополни на app.heygen.com/settings/subscriptions" if "credit" in msg.lower() else
                    " — исчерпан лимит голоса у провайдера: попробуй другой голос-клон или позже" if "quota" in msg.lower() else "")
            sys.exit(f"HeyGen: видео не собралось: {msg}{hint}")
        time.sleep(20)
    print(f"PENDING HeyGen ещё рендерит ({last or 'нет статуса'}) — повтори: heygen_render.py {slug} --resume")
    sys.exit(3)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("job")
    ap.add_argument("--look")
    ap.add_argument("--voice")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-wait", action="store_true")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--wait-min", type=float, default=9)
    ap.add_argument("--fetch", help="video_url готового видео (путь через MCP HeyGen)")
    ap.add_argument("--id", help="video_id из MCP — для истории")
    a = ap.parse_args()

    job = job_dir(a.job)
    slug = job.name
    av = config()["avatar"]
    look, voice = a.look or av["look_id"], a.voice or av["voice_id"]
    state = read_json(job / "heygen.json", {})

    if a.fetch:
        state.update(route="mcp", video_id=a.id or state.get("video_id"), look_id=look, voice_id=voice,
                     engine=state.get("engine") or avatar_engine())
        return finish(job, slug, a.fetch, state)
    if a.resume:
        if not state.get("video_id"):
            sys.exit("нечего ждать: в heygen.json нет video_id")
        return poll(job, slug, key(), state, a.wait_min)

    script = (job / "script.txt").read_text().strip()
    chk = read_json(job / "check.json", {})
    if chk.get("fail") and not a.force:
        sys.exit("последняя check_script.py — FAIL. Исправь сценарий и проверь снова (или --force, если осознанно)")
    body = {"video_inputs": [{"character": {"type": "avatar", "avatar_id": look, "avatar_style": "normal"},
                              "voice": {"type": "text", "input_text": script, "voice_id": voice, "speed": av.get("speed", 1.0)}}],
            "dimension": {"width": 1080, "height": 1920}, "title": f"Ремейк · {slug}"}
    if a.dry_run:
        print(json.dumps(body, ensure_ascii=False, indent=1))
        return
    k = key()
    est = round(len(script.split()) / config()["script"]["words_per_sec"])
    q = quota(k)
    if q is not None:
        print(f"HeyGen: осталось квоты {q} (нужно ≈ {est} с видео)")
        if isinstance(q, (int, float)) and q < est:
            sys.exit(f"мало квоты HeyGen ({q} < {est}) — пополни на app.heygen.com/settings/subscriptions")
    try:
        d = http_json(f"{API}/v2/video/generate", method="POST", data=body, headers={"X-Api-Key": k}, timeout=60)
    except HTTPError as e:
        sys.exit(f"HeyGen не принял задачу: {e}")
    vid = (d.get("data") or {}).get("video_id")
    if not vid:
        sys.exit(f"HeyGen не вернул video_id: {json.dumps(d, ensure_ascii=False)[:300]}")
    state = {"route": "rest", "video_id": vid, "look_id": look, "voice_id": voice, "status": "submitted",
             "submitted_at": datetime.datetime.now().isoformat(timespec="seconds"), "est_sec": est}
    write_json(job / "heygen.json", state)
    print(f"SUBMITTED {vid} · ≈{est} с видео")
    if not a.no_wait:
        poll(job, slug, k, state, a.wait_min)


if __name__ == "__main__":
    main()
