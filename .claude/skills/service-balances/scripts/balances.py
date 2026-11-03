#!/usr/bin/env python3
"""Балансы и подписки сервисов офиса: где скоро кончатся деньги, лимит или подписка → out/index.html + balances.json.

  python3 balances.py --out out/

Проверяет по API все ключи, которые найдёт (каждый ключ один раз, даже если он записан под разными именами):
  Anthropic   *ANTHROPIC*KEY*        крошечный запрос к Haiku: работает ключ или «credit balance is too low»
  OpenAI      *OPENAI*KEY*           крошечный запрос эмбеддинга: работает или insufficient_quota
  ElevenLabs  *ELEVENLABS*KEY*       подписка, символы до сброса, дата следующего списания
  HeyGen      *HEYGEN*KEY*           остаток квоты
  Apify       *APIFY*TOKEN*          расход за месяц против лимита, конец цикла
  Deepgram    *DEEPGRAM*KEY*         баланс проектов
  kie.ai      *KIE*KEY*              кредиты
  Meta Ads    META_TOKEN + META_AD_ACCOUNT   статус кабинета, лимит расходов, способ оплаты
Подписки без API (сервер, домены, Claude, Higgsfield…) — SUBSCRIPTIONS_JSON:
  [{"name": "Claude Max", "renews": "2026-12-01" | 15 (число месяца), "price": "$200", "url": "…", "note": "…"}]

Ключи и SUBSCRIPTIONS_JSON — из окружения или ~/hq-runner/keys.env (пишет выкладка офиса).
Пороги: подписка через ≤7 дней — внимание, ≤2 — срочно; осталось ≤20 % лимита — внимание, ≤5 % — срочно.
Последняя строка вывода — JSON {"ok", "critical", "warn", "items"}. Только стандартная библиотека.
"""
import argparse
import datetime as dt
import hashlib
import html
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MSK = dt.timezone(dt.timedelta(hours=3))
KEYS_FILE = Path(os.path.expanduser(os.environ.get("HQ_KEYS_FILE", "~/hq-runner/keys.env")))
WARN_DAYS, CRIT_DAYS, WARN_LEFT, CRIT_LEFT = 7, 2, 0.20, 0.05


def env():
    out = {}
    if KEYS_FILE.exists():
        for line in KEYS_FILE.read_text(errors="ignore").splitlines():
            m = re.match(r"\s*([A-Z0-9_]+)=(.*)$", line)
            if m and m.group(2).strip():
                out[m.group(1)] = m.group(2).strip().strip("'\"")
    out.update({k: v for k, v in os.environ.items() if v})
    return out


def keys_of(E, *patterns):
    """[(label, key)] по шаблонам имён, без повторов одного и того же ключа."""
    seen, out = set(), []
    for name in sorted(E):
        if any(re.fullmatch(p, name) for p in patterns):
            v = E[name].strip()
            h = hashlib.sha256(v.encode()).hexdigest()
            if v and h not in seen:
                seen.add(h)
                label = re.sub(r"_?(ANTHROPIC|OPENAI|ELEVENLABS|HEYGEN|APIFY|DEEPGRAM|KIE)_?(API_)?(KEY|TOKEN)_?", "", name).strip("_").lower() or "основной"
                out.append((label, v))
    return out


def _ctx():
    for f in (os.environ.get("SSL_CERT_FILE"), os.environ.get("REQUESTS_CA_BUNDLE"), "/etc/ssl/cert.pem"):
        if f and os.path.exists(f):
            return ssl.create_default_context(cafile=f)
    return ssl.create_default_context()


def req(url, method="GET", headers=None, body=None, timeout=45):
    """→ (status, json|text). Ошибки HTTP возвращаются, а не бросаются: по ним и судим."""
    data = json.dumps(body).encode() if body is not None else None
    h = {"User-Agent": "aicex-hq-balances", **({"content-type": "application/json"} if data else {}), **(headers or {})}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=h), timeout=timeout, context=_ctx()) as r:
            raw = r.read()
            st = r.status
    except urllib.error.HTTPError as e:
        raw, st = e.read(), e.code
    try:
        return st, json.loads(raw or b"null")
    except ValueError:
        return st, raw[:400].decode("utf-8", "replace")


def item(service, label, level, text, **extra):
    return {"service": service, "account": label, "level": level, "text": text, **extra}


def left_level(left):
    return "critical" if left <= CRIT_LEFT else "warn" if left <= WARN_LEFT else "ok"


def days_level(days):
    return "critical" if days <= CRIT_DAYS else "warn" if days <= WARN_DAYS else "ok"


def when(d):
    return d.strftime("%d.%m.%Y")


def err_text(body):
    if isinstance(body, dict):
        e = body.get("error") or body.get("detail") or body
        return str((e.get("message") or json.dumps(e, ensure_ascii=False)) if isinstance(e, dict) else e)[:200] if e else "пустой ответ"
    return str(body)[:200]


# ---------- сервисы ----------

def anthropic(E):
    out = []
    for label, k in keys_of(E, r".*ANTHROPIC.*KEY.*", r"HQ_ANTHROPIC_KEY_CHECK"):
        st, b = req("https://api.anthropic.com/v1/messages", "POST", {"x-api-key": k, "anthropic-version": "2023-06-01"},
                    {"model": "claude-haiku-4-5", "max_tokens": 1, "messages": [{"role": "user", "content": "ok"}]})
        msg = err_text(b) if st >= 400 else ""
        if st == 200:
            out.append(item("Anthropic", label, "ok", "ключ работает, кредиты есть"))
        elif "credit balance" in msg.lower():
            out.append(item("Anthropic", label, "critical", "закончились кредиты — пополните в console.anthropic.com → Billing", url="https://console.anthropic.com/settings/billing"))
        elif st in (401, 403):
            out.append(item("Anthropic", label, "critical", f"ключ не принят ({st}): {msg}"))
        elif st == 429:
            out.append(item("Anthropic", label, "warn", f"упёрлись в лимит запросов: {msg}"))
        else:
            out.append(item("Anthropic", label, "warn", f"не удалось проверить ({st}): {msg}"))
    return out


def openai(E):
    out = []
    for label, k in keys_of(E, r".*OPENAI.*KEY.*"):
        st, b = req("https://api.openai.com/v1/embeddings", "POST", {"Authorization": f"Bearer {k}"}, {"model": "text-embedding-3-small", "input": "ok"})
        msg = err_text(b) if st >= 400 else ""
        if st == 200:
            out.append(item("OpenAI", label, "ok", "ключ работает (остаток денег API не показывает — смотрите platform.openai.com)"))
        elif "insufficient_quota" in json.dumps(b) or "quota" in msg.lower():
            out.append(item("OpenAI", label, "critical", "закончились деньги на счёте — пополните platform.openai.com → Billing", url="https://platform.openai.com/settings/organization/billing"))
        else:
            out.append(item("OpenAI", label, "critical" if st in (401, 403) else "warn", f"ошибка {st}: {msg}"))
    return out


def elevenlabs(E):
    out = []
    for label, k in keys_of(E, r".*ELEVENLABS.*KEY.*"):
        st, b = req("https://api.elevenlabs.io/v1/user/subscription", headers={"xi-api-key": k})
        if st != 200 or not isinstance(b, dict):
            out.append(item("ElevenLabs", label, "critical" if st in (401, 403) else "warn", f"не проверить ({st}): {err_text(b)}"))
            continue
        used, limit = b.get("character_count") or 0, b.get("character_limit") or 0
        left = (limit - used) / limit if limit else 1
        reset = b.get("next_character_count_reset_unix")
        inv = (b.get("next_invoice") or {})
        pay = inv.get("next_payment_attempt_unix")
        lvl, parts = left_level(left), [f"тариф {b.get('tier', '—')}", f"осталось {limit - used:,} из {limit:,} символов ({left:.0%})".replace(",", " ")]
        if reset:
            parts.append(f"сброс {when(dt.datetime.fromtimestamp(reset, MSK))}")
        if pay:
            d = dt.datetime.fromtimestamp(pay, MSK)
            days = (d.date() - dt.datetime.now(MSK).date()).days
            parts.append(f"списание {when(d)}" + (f" — {inv['amount_due_cents'] / 100:.2f} {str(inv.get('currency', 'usd')).upper()}" if inv.get("amount_due_cents") else ""))
            lvl = max(lvl, "warn" if days <= WARN_DAYS else "ok", key=["ok", "warn", "critical"].index)
        status = str(b.get("status") or "")
        if status and status not in ("active", "trialing", "free"):
            lvl, parts = "critical", [f"подписка в статусе {status} — проверьте оплату"] + parts
        out.append(item("ElevenLabs", label, lvl, ", ".join(parts), url="https://elevenlabs.io/app/subscription"))
    return out


def heygen(E):
    out = []
    for label, k in keys_of(E, r".*HEYGEN.*KEY.*"):
        st, b = req("https://api.heygen.com/v2/user/remaining_quota", headers={"X-Api-Key": k})
        if st != 200 or not isinstance(b, dict):
            out.append(item("HeyGen", label, "critical" if st in (401, 403) else "warn", f"не проверить ({st}): {err_text(b)}"))
            continue
        d = b.get("data") or {}
        q = d.get("remaining_quota")
        mins = (q or 0) / 60
        lvl = "critical" if mins < 2 else "warn" if mins < 10 else "ok"
        extra = ", ".join(f"{k2}: {v}" for k2, v in (d.get("details") or {}).items() if isinstance(v, (int, float)))
        out.append(item("HeyGen", label, lvl, f"осталось ≈{mins:.0f} мин видео (квота {q})" + (f"; {extra}" if extra else ""), url="https://app.heygen.com/settings?nav=Subscriptions%20%26%20API"))
    return out


def apify(E):
    out = []
    for label, k in keys_of(E, r".*APIFY.*TOKEN.*", r".*APIFY.*KEY.*"):
        st, b = req(f"https://api.apify.com/v2/users/me/limits?token={urllib.parse.quote(k)}")
        if st != 200 or not isinstance(b, dict):
            out.append(item("Apify", label, "critical" if st in (401, 403) else "warn", f"не проверить ({st}): {err_text(b)}"))
            continue
        d = b.get("data") or {}
        used = (d.get("current") or {}).get("monthlyUsageUsd") or 0
        cap = (d.get("limits") or {}).get("maxMonthlyUsageUsd") or 0
        end = (d.get("monthlyUsageCycle") or {}).get("endAt")
        left = (cap - used) / cap if cap else 1
        txt = f"потрачено ${used:.2f} из ${cap:.0f} за цикл ({1 - left:.0%})" + (f", цикл до {when(dt.datetime.fromisoformat(end.replace('Z', '+00:00')).astimezone(MSK))}" if end else "")
        out.append(item("Apify", label, left_level(left), txt, url="https://console.apify.com/billing"))
    return out


def deepgram(E):
    out = []
    for label, k in keys_of(E, r".*DEEPGRAM.*KEY.*"):
        st, b = req("https://api.deepgram.com/v1/projects", headers={"Authorization": f"Token {k}"})
        if st != 200 or not isinstance(b, dict):
            out.append(item("Deepgram", label, "critical" if st in (401, 403) else "warn", f"не проверить ({st}): {err_text(b)}"))
            continue
        for p in b.get("projects", [])[:3]:
            st2, bb = req(f"https://api.deepgram.com/v1/projects/{p['project_id']}/balances", headers={"Authorization": f"Token {k}"})
            for bal in (bb.get("balances", []) if isinstance(bb, dict) else []):
                amt = float(bal.get("amount") or 0)
                out.append(item("Deepgram", f"{label} · {p.get('name', '')}", "critical" if amt < 1 else "warn" if amt < 5 else "ok",
                                f"баланс {amt:.2f} {bal.get('units', 'usd')}", url="https://console.deepgram.com/billing"))
    return out


def kie(E):
    out = []
    for label, k in keys_of(E, r".*KIE.*KEY.*"):
        st, b = req("https://api.kie.ai/api/v1/chat/credit", headers={"Authorization": f"Bearer {k}"})
        credits = b.get("data") if isinstance(b, dict) and b.get("code") == 200 else None
        if not isinstance(credits, (int, float)):
            out.append(item("kie.ai", label, "warn", f"не проверить ({st}): {err_text(b)}"))
            continue
        out.append(item("kie.ai", label, "critical" if credits < 20 else "warn" if credits < 100 else "ok", f"кредитов: {credits:g}", url="https://kie.ai/billing"))
    return out


def meta_ads(E):
    tok, acc = E.get("META_TOKEN"), E.get("META_AD_ACCOUNT")
    if not tok or not acc:
        return []
    acc = acc if acc.startswith("act_") else "act_" + acc
    st, b = req(f"https://graph.facebook.com/v23.0/{acc}?" + urllib.parse.urlencode(
        {"fields": "name,account_status,disable_reason,currency,spend_cap,amount_spent,balance,funding_source_details", "access_token": tok}))
    if st != 200 or not isinstance(b, dict):
        return [item("Meta Ads", acc, "critical" if st in (401, 403) else "warn", f"не проверить ({st}): {err_text(b)}")]
    statuses = {1: "активен", 2: "отключён", 3: "есть неоплаченный долг", 7: "на проверке", 8: "ожидает оплаты", 9: "льготный период", 101: "закрыт"}
    s = b.get("account_status")
    lvl = "ok" if s == 1 else "critical"
    cur = b.get("currency", "")
    parts = [f"кабинет {b.get('name', acc)}: {statuses.get(s, s)}"]
    cap, spent = int(b.get("spend_cap") or 0), int(b.get("amount_spent") or 0)
    if cap:
        left = (cap - spent) / cap
        parts.append(f"до лимита расходов {(cap - spent) / 100:.2f} {cur} ({left:.0%})")
        lvl = max(lvl, left_level(left), key=["ok", "warn", "critical"].index)
    fs = (b.get("funding_source_details") or {}).get("display_string")
    if fs:
        parts.append(f"оплата: {fs}")
    return [item("Meta Ads", acc, lvl, ", ".join(parts), url=f"https://adsmanager.facebook.com/billing_hub/payment_settings/?asset_id={acc[4:]}")]


def subscriptions(E):
    raw = E.get("SUBSCRIPTIONS_JSON") or ""
    if not raw.strip():
        return [item("Подписки", "—", "info", "даты подписок без API не заданы: добавьте переменную HQ_SUBSCRIPTIONS_JSON в GitHub "
                     "(сервер, домены, Claude, Higgsfield…) — агент начнёт предупреждать о продлении")]
    try:
        subs = json.loads(raw)
    except ValueError as e:
        return [item("Подписки", "—", "warn", f"HQ_SUBSCRIPTIONS_JSON не читается: {e}")]
    today, out = dt.datetime.now(MSK).date(), []
    for s in subs if isinstance(subs, list) else []:
        r = s.get("renews")
        if isinstance(r, int) or (isinstance(r, str) and r.isdigit()):
            dom = int(r)
            y, m = today.year, today.month
            if today.day > dom:
                y, m = (y + 1, 1) if m == 12 else (y, m + 1)
            for d_ in (dom, 28):
                try:
                    nxt = dt.date(y, m, min(d_, 31))
                    break
                except ValueError:
                    continue
        else:
            try:
                nxt = dt.date.fromisoformat(str(r))
            except ValueError:
                out.append(item("Подписки", s.get("name", "?"), "warn", f"не понял дату продления «{r}»"))
                continue
        days = (nxt - today).days
        lvl = "critical" if days < 0 else days_level(days)
        txt = (f"просрочена на {-days} дн. ({when(nxt)})" if days < 0 else "продление сегодня" if days == 0 else f"продление через {days} дн. — {when(nxt)}") + \
              (f", {s['price']}" if s.get("price") else "") + (f". {s['note']}" if s.get("note") else "")
        out.append(item(s.get("name", "Подписка"), s.get("account", ""), lvl, txt, url=s.get("url", ""), days=days))
    return out


CHECKS = (anthropic, openai, elevenlabs, heygen, apify, deepgram, kie, meta_ads, subscriptions)


# ---------- страница ----------

def page(items, now):
    color = {"critical": "#ff5d6c", "warn": "#ffc24b", "ok": "#3ddc97", "info": "#8b93a7"}
    word = {"critical": "Срочно", "warn": "Скоро", "ok": "В порядке", "info": "Справка"}
    order = ["critical", "warn", "info", "ok"]
    rows = "".join(
        f"<tr><td><i style='background:{color[it['level']]}'></i>{word[it['level']]}</td><td><b>{html.escape(it['service'])}</b>"
        f"<small>{html.escape(it['account'])}</small></td><td>{html.escape(it['text'])}"
        + (f" <a href='{html.escape(it['url'])}' target='_blank' rel='noopener'>открыть</a>" if it.get("url") else "") + "</td></tr>"
        for it in sorted(items, key=lambda x: order.index(x["level"])))
    crit, warn = sum(i["level"] == "critical" for i in items), sum(i["level"] == "warn" for i in items)
    head = "Всё оплачено — офис работает без перебоев" if not crit and not warn else f"Срочно: {crit} · скоро: {warn}"
    return ("<!doctype html><html lang=ru><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Балансы и подписки</title>"
            "<style>:root{color-scheme:dark}body{margin:0;padding:24px 16px;background:#0e1016;color:#e8eaf0;font:15px/1.5 Manrope,system-ui,sans-serif}"
            "main{max-width:900px;margin:auto}h1{font-size:22px;margin:0 0 4px}p{color:#9aa3b5;margin:0 0 18px}table{width:100%;border-collapse:collapse}"
            "td{padding:10px 8px;border-top:1px solid #232838;vertical-align:top}td:first-child{white-space:nowrap;width:1%}td i{display:inline-block;width:9px;height:9px;"
            "border-radius:50%;margin-right:8px}small{display:block;color:#8b93a7}a{color:#7cb4ff}@media(max-width:600px){td{display:block;border:0;padding:4px 0}tr{display:block;"
            "border-top:1px solid #232838;padding:8px 0}}</style><main>"
            f"<h1>{html.escape(head)}</h1><p>Проверено {now.strftime('%d.%m.%Y %H:%M')} МСК · сервисов: {len(items)}</p><table>{rows}</table></main></html>")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    E, items = env(), []
    for check in CHECKS:
        print(f"STEP Проверяет {check.__name__}", flush=True)
        try:
            items += check(E)
        except Exception as e:  # noqa: BLE001 — один сервис не валит проверку
            items.append(item(check.__name__, "—", "warn", f"проверка упала: {str(e)[:200]}"))
    now = dt.datetime.now(MSK)
    out = Path(a.out).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    (out / "balances.json").write_text(json.dumps({"checked": now.isoformat(timespec="minutes"), "items": items}, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "index.html").write_text(page(items, now), encoding="utf-8")
    line = lambda i: i["service"] + (f" ({i['account']})" if i["account"] else "") + ": " + i["text"]
    crit = [line(i) for i in items if i["level"] == "critical"]
    warn = [line(i) for i in items if i["level"] == "warn"]
    print(json.dumps({"ok": True, "critical": crit, "warn": warn, "items": len(items)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
