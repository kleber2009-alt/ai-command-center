"""Research API · Instagram Reels анализ конкурентов и трендов."""
from __future__ import annotations

import json
import logging
import os
import random
import time
from typing import Any, Literal, Optional

try:
    from fastapi import APIRouter, HTTPException, Query
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel
    import httpx
    import anthropic
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False
    APIRouter = lambda **k: None  # type: ignore

log = logging.getLogger("aisales.research")

router = APIRouter(prefix="/api/v1/research", tags=["research"]) if HAS_DEPS else None

APIFY_TOKEN = os.getenv("APIFY_API_TOKEN", "")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
APIFY_ACTOR = "apify~instagram-scraper"
APIFY_BASE = "https://api.apify.com/v2"


# ── Mock data ──────────────────────────────────────────────────────────────
MOCK_REELS = [
    {"id": f"reel_{i}", "shortcode": f"C{random.randint(100000,999999)}XYZ",
     "url": f"https://www.instagram.com/reel/C{random.randint(100000,999999)}XYZ/",
     "thumbnail": f"https://picsum.photos/seed/reel{i}/540/960",
     "caption": cap, "views": views, "likes": likes, "comments": cmts,
     "er": round(likes / max(views, 1) * 100, 1),
     "hook": hook, "author": author, "author_url": f"https://instagram.com/{author}",
     "posted_at": f"2026-05-{18-i:02d}"}
    for i, (cap, views, likes, cmts, hook, author) in enumerate([
        ("🔥 Как я набрала 10к подписчиков за 3 недели без рекламы | секрет в описании", 482000, 28400, 1230, "Как я набрала 10к подписчиков за 3 недели", "marketing_pro_ru"),
        ("Ошибка, которую делают 90% экспертов при продажах в директ 😱", 318000, 19200, 890, "Ошибка, которую делают 90% экспертов", "sales_hacks_ig"),
        ("Этот приём увеличил мои продажи в 3 раза — проверено на 500 клиентах", 265000, 15800, 720, "Этот приём увеличил мои продажи в 3 раза", "business_coach_msk"),
        ("Никто не говорит об этом в Instagram, но я расскажу правду 👇", 241000, 14300, 960, "Никто не говорит об этом в Instagram", "expert_smm"),
        ("5 идей контента, которые у меня всегда залетают в нише онлайн-образования", 198000, 11200, 540, "5 идей контента, которые у меня всегда залетают", "content_queen_ru"),
        ("Сохрани это видео! Показываю схему, которую использую для карусели", 176000, 9800, 430, "Сохрани это видео! Показываю схему", "smm_tricks"),
        ("Почему ваши reels не набирают просмотры — честный разбор 📊", 154000, 8900, 670, "Почему ваши reels не набирают просмотры", "reels_expert"),
        ("Я потратила 100к на таргет и вот что узнала... (не повторяйте мою ошибку)", 132000, 7600, 820, "Я потратила 100к на таргет и вот что узнала", "digital_mom"),
        ("Тренды контента Май 2026 — что сейчас залетает в Instagram", 118000, 6700, 390, "Тренды контента Май 2026", "trend_watch"),
        ("Формула идеального хука для reels, которая работает в любой нише", 97000, 5400, 280, "Формула идеального хука для reels", "hook_master"),
    ])
]


async def _run_apify(input_data: dict) -> list[dict]:
    """Sync Apify run with 90s timeout, returns raw items."""
    url = f"{APIFY_BASE}/acts/{APIFY_ACTOR}/run-sync-get-dataset-items"
    headers = {"Authorization": f"Bearer {APIFY_TOKEN}",
               "Content-Type": "application/json"}
    params = {"timeout": 90, "memory": 512}
    async with httpx.AsyncClient(timeout=100.0) as client:
        resp = await client.post(url, headers=headers, params=params, json=input_data)
        resp.raise_for_status()
        return resp.json()


def _map_apify_item(item: dict) -> dict:
    """Map raw Apify Instagram scraper output → our schema."""
    views = item.get("videoViewCount") or item.get("videoPlayCount") or 0
    likes = item.get("likesCount") or 0
    cmts = item.get("commentsCount") or 0
    caption = (item.get("caption") or "")[:200]
    shortcode = item.get("shortCode") or item.get("id") or ""
    hook = caption.split("\n")[0][:120] if caption else ""
    owner = item.get("ownerUsername") or ""
    return {
        "id": item.get("id") or shortcode,
        "shortcode": shortcode,
        "url": f"https://www.instagram.com/reel/{shortcode}/",
        "thumbnail": item.get("displayUrl") or item.get("thumbnailUrl") or "",
        "caption": caption,
        "views": views,
        "likes": likes,
        "comments": cmts,
        "er": round(likes / max(views, 1) * 100, 2),
        "hook": hook,
        "author": owner,
        "author_url": f"https://www.instagram.com/{owner}/" if owner else "",
        "posted_at": (item.get("timestamp") or "")[:10],
    }


async def _analyze_with_claude(reels: list[dict], context: str) -> dict:
    """AI analysis: themes, hook patterns, format recommendations."""
    if not ANTHROPIC_KEY:
        return {"error": "no anthropic key"}

    snippets = "\n".join(
        f"- [{r['views']:,} просм.] {r['hook']}" for r in reels[:15]
    )
    prompt = f"""Ты аналитик контента Instagram. Проанализируй {len(reels)} популярных Reels по теме «{context}».

Хуки (первые фразы) самых залетевших видео:
{snippets}

Дай анализ в JSON формате:
{{
  "themes": ["тема 1", "тема 2", "тема 3"],
  "hook_patterns": ["паттерн 1", "паттерн 2", "паттерн 3"],
  "formats": ["формат 1", "формат 2"],
  "peak_timing": "оптимальное время публикации",
  "content_gap": "что недостаточно освещено",
  "recommendation": "главная рекомендация для создателя контента"
}}

Отвечай только JSON, без markdown, без объяснений."""

    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = msg.content[0].text.strip()
    # Claude sometimes wraps JSON in a markdown code block
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    try:
        return json.loads(raw)
    except Exception:
        return {"raw": raw}


# ── Endpoints ──────────────────────────────────────────────────────────────

if HAS_DEPS and router:

    @router.get("/instagram")
    async def instagram_research(
        type: Literal["hashtag", "profile"] = Query(..., description="hashtag или profile"),
        query: str = Query(..., description="хештег (без #) или username / URL профиля"),
        limit: int = Query(20, ge=5, le=50),
        analyze: bool = Query(False, description="добавить AI-анализ"),
    ):
        """Топ Reels по хештегу или профилю."""
        reels: list[dict]
        is_mock = False

        if APIFY_TOKEN:
            try:
                if type == "hashtag":
                    tag = query.lstrip("#")
                    ig_url = f"https://www.instagram.com/explore/tags/{tag}/"
                else:
                    # accept full URL or just username
                    q = query.strip().rstrip("/")
                    if q.startswith("http"):
                        ig_url = q if q.endswith("/") else q + "/"
                    else:
                        ig_url = f"https://www.instagram.com/{q.lstrip('@')}/"

                raw_items = await _run_apify({
                    "directUrls": [ig_url],
                    "resultsType": "posts",
                    "resultsLimit": limit,
                    "addParentData": False,
                    "isUserTaggedFeedURL": False,
                })
                reels = [_map_apify_item(it) for it in raw_items if it.get("type") in ("Video", "Sidecar", None)]
                reels.sort(key=lambda r: r["views"], reverse=True)
            except Exception as exc:
                log.warning("Apify call failed: %s — returning mock", exc)
                reels = MOCK_REELS[:limit]
                is_mock = True
        else:
            reels = MOCK_REELS[:limit]
            is_mock = True

        result: dict[str, Any] = {"reels": reels, "mock": is_mock, "count": len(reels)}

        if analyze:
            context = f"#{query}" if type == "hashtag" else query
            result["analysis"] = await _analyze_with_claude(reels, context)

        return result

    @router.post("/instagram/analyze")
    async def analyze_reels(payload: dict):
        """AI анализ переданного набора reels."""
        reels = payload.get("reels", [])
        context = payload.get("context", "Instagram")
        if not reels:
            raise HTTPException(status_code=400, detail="reels required")
        analysis = await _analyze_with_claude(reels[:20], context)
        return {"analysis": analysis}
