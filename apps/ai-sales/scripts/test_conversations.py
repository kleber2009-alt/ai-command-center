"""
Прогоняет 10 типичных диалоговых сценариев через работающий aisales-api.

Что покажет:
- Реальное качество ответов агента на типовые ситуации (привет, возражение, цена...)
- Cost / latency по каждому сценарию
- Где промпт не справляется (для тюнинга)

Запуск:
    На сервере (внутри SSH):
        cd ~/aisales-app-v2/code
        python3 ~/test_conversations.py

    Локально (через SSH-туннель на :8001):
        python3 scripts/test_conversations.py --api http://localhost:8001
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from typing import Any

# 10 реалистичных сценариев покрывающих воронку
SCENARIOS = [
    {
        "id": "01-greeting",
        "expected_stage": "hello",
        "expected_intent": "greeting",
        "message": "Привет! Что у вас за продукт?",
    },
    {
        "id": "02-discovery",
        "expected_stage": "discovery",
        "expected_intent": "question",
        "message": "У меня агентство SMM, 8 человек. Ручной постинг убивает время. Что предлагаешь?",
    },
    {
        "id": "03-price-question",
        "expected_stage": "close",
        "expected_intent": "price_question",
        "message": "А сколько это стоит для команды 8 человек?",
    },
    {
        "id": "04-objection-expensive",
        "expected_stage": "objections",
        "expected_intent": "objection",
        "message": "80к в месяц — слишком дорого для нас",
    },
    {
        "id": "05-objection-time",
        "expected_stage": "objections",
        "expected_intent": "objection",
        "message": "Долго ли это внедрять? У меня нет недели на остановку работы",
    },
    {
        "id": "06-objection-doubt",
        "expected_stage": "objections",
        "expected_intent": "objection",
        "message": "Я уже пробовал такие сервисы — все обещают, никто не делает",
    },
    {
        "id": "07-close-ready",
        "expected_stage": "close",
        "expected_intent": "agreement",
        "message": "Окей, нравится. Как начать?",
    },
    {
        "id": "08-escalation-complaint",
        "expected_stage": "any",
        "expected_intent": "complaint",
        "message": "Вы меня обманули в прошлый раз, я хочу возврат денег",
        "expect_escalation": True,
    },
    {
        "id": "09-confused",
        "expected_stage": "any",
        "expected_intent": "confused",
        "message": "Не понимаю как это работает. Можешь по другому объяснить?",
    },
    {
        "id": "10-niche-test",
        "expected_stage": "discovery",
        "expected_intent": "question",
        "message": "У меня EdTech-агентство с 12 клиентами, бюджет 2М/мес. Подходит?",
    },
]


def run_via_docker(scenario: dict, container: str) -> dict:
    """Запустить flow.py внутри Docker-контейнера через exec."""
    cmd = [
        "docker", "exec", container,
        "python", "-m", "agents.flow",
        "--channel", "tg",
        "--message", scenario["message"],
    ]
    t0 = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    elapsed = time.time() - t0

    if result.returncode != 0:
        return {"ok": False, "error": result.stderr[:500], "elapsed_s": elapsed}

    # Найти JSON-блок в stdout (после "← OUTPUT")
    output = result.stdout
    json_start = output.find("{", output.find("← OUTPUT"))
    if json_start == -1:
        return {"ok": False, "error": "No JSON in output", "raw": output[-500:], "elapsed_s": elapsed}

    # Найти конец JSON
    depth = 0
    json_end = -1
    for i in range(json_start, len(output)):
        if output[i] == "{":
            depth += 1
        elif output[i] == "}":
            depth -= 1
            if depth == 0:
                json_end = i + 1
                break

    if json_end == -1:
        return {"ok": False, "error": "Incomplete JSON", "elapsed_s": elapsed}

    try:
        data = json.loads(output[json_start:json_end])
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"Parse: {e}", "elapsed_s": elapsed}

    return {"ok": True, "data": data, "elapsed_s": elapsed}


def evaluate(scenario: dict, result: dict) -> dict:
    """Грубая оценка качества ответа."""
    if not result["ok"]:
        return {"verdict": "FAIL", "issues": [result.get("error", "?")]}

    data = result["data"]
    issues = []

    # Stage check
    if scenario["expected_stage"] != "any":
        if data.get("current_stage") != scenario["expected_stage"]:
            issues.append(f"stage: expected {scenario['expected_stage']}, got {data.get('current_stage')}")

    # Escalation check
    expect_esc = scenario.get("expect_escalation", False)
    actual_esc = data.get("needs_escalation", False)
    if expect_esc != actual_esc:
        issues.append(f"escalation: expected {expect_esc}, got {actual_esc}")

    # Response quality
    text = data.get("response_text", "")
    if len(text) < 20:
        issues.append(f"response too short ({len(text)} chars)")
    if not actual_esc and any(bad in text.lower() for bad in [
        "уважаемый", "по вашему запросу", "спешу сообщить",
    ]):
        issues.append("canceleryarisms")
    if text.count("!") > 2:
        issues.append("too many exclamations")

    return {
        "verdict": "OK" if not issues else "WARN",
        "issues": issues,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", default="aisales-api-v2", help="Docker container name")
    parser.add_argument("--scenario", help="Only run one scenario by ID")
    parser.add_argument("--output", default="/tmp/test_conversations.json")
    args = parser.parse_args()

    scenarios = SCENARIOS
    if args.scenario:
        scenarios = [s for s in SCENARIOS if s["id"] == args.scenario]
        if not scenarios:
            print(f"✕ Unknown scenario: {args.scenario}", file=sys.stderr)
            sys.exit(1)

    print(f"→ Running {len(scenarios)} scenarios through container '{args.container}'")
    print("=" * 80)

    total_cost = 0.0
    total_tokens = 0
    results = []

    for s in scenarios:
        print(f"\n[{s['id']}] {s['message'][:60]}...")
        result = run_via_docker(s, args.container)
        eval_ = evaluate(s, result)

        if result["ok"]:
            data = result["data"]
            cost = data.get("cost_usd", 0)
            tokens = data.get("tokens_used", 0)
            total_cost += cost
            total_tokens += tokens

            print(f"  ✓ stage={data.get('current_stage')} segment={data.get('segment')} "
                  f"intent={data.get('detected_intent')}")
            print(f"  ★ {data.get('response_text', '')[:120]}...")
            print(f"  ${cost:.4f} · {tokens} tok · {data.get('latency_ms', 0)}ms · {eval_['verdict']}")
            if eval_["issues"]:
                for i in eval_["issues"]:
                    print(f"    ⚠ {i}")
        else:
            print(f"  ✕ FAIL: {result.get('error', '?')}")

        results.append({
            "scenario": s,
            "result": result,
            "evaluation": eval_,
        })

    # Summary
    print("\n" + "=" * 80)
    print(f"TOTAL · {len(scenarios)} scenarios")
    print(f"Cost:     ${total_cost:.4f}")
    print(f"Tokens:   {total_tokens}")
    ok = sum(1 for r in results if r["evaluation"]["verdict"] == "OK")
    warn = sum(1 for r in results if r["evaluation"]["verdict"] == "WARN")
    fail = sum(1 for r in results if r["evaluation"]["verdict"] == "FAIL")
    print(f"Verdict:  {ok} OK · {warn} WARN · {fail} FAIL")
    print(f"\nSaved: {args.output}")

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump({"total_cost": total_cost, "total_tokens": total_tokens, "results": results}, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
