"""Stats API · Pulse dashboard metrics."""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter
from db.pg import get_pool

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


@router.get("/pulse")
async def pulse():
    """Метрики для главного экрана Pulse."""
    p = await get_pool()
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    async with p.acquire() as conn:
        funnel_rows = await conn.fetch(
            "SELECT funnel_stage::text, COUNT(*)::int AS cnt FROM clients GROUP BY funnel_stage"
        )
        funnel = {r["funnel_stage"]: r["cnt"] for r in funnel_rows}

        new_leads = int(await conn.fetchval(
            "SELECT COUNT(*) FROM clients WHERE created_at >= $1", today
        ) or 0)

        active = int(await conn.fetchval(
            "SELECT COUNT(*) FROM clients WHERE funnel_stage NOT IN ('closed_won','closed_lost')"
        ) or 0)

        hot = int(await conn.fetchval(
            "SELECT COUNT(*) FROM clients WHERE segment = 'segment_a' AND qual_score >= 70"
            " AND funnel_stage NOT IN ('closed_won','closed_lost')"
        ) or 0)

        won_today = int(await conn.fetchval(
            "SELECT COUNT(*) FROM clients WHERE funnel_stage = 'closed_won' AND updated_at >= $1",
            today,
        ) or 0)

        won_amount = float(await conn.fetchval(
            "SELECT COALESCE(SUM(predicted_deal_amount),0) FROM clients"
            " WHERE funnel_stage = 'closed_won' AND updated_at >= $1",
            today,
        ) or 0)

        total_out = int(await conn.fetchval(
            "SELECT COUNT(*) FROM messages WHERE direction = 'out' AND created_at >= $1", today
        ) or 0)
        agent_out = int(await conn.fetchval(
            "SELECT COUNT(*) FROM messages WHERE direction = 'out' AND created_at >= $1"
            " AND author IN ('agent_ig','agent_tg')",
            today,
        ) or 0)
        autonomous_pct = round(agent_out / total_out * 100) if total_out else 0

    return {
        "new_leads_today": new_leads,
        "active": active,
        "hot": hot,
        "won_today": won_today,
        "won_amount_today": won_amount,
        "autonomous_pct": autonomous_pct,
        "funnel": {
            "hello": funnel.get("hello", 0),
            "discovery": funnel.get("discovery", 0),
            "pitch": funnel.get("pitch", 0),
            "objections": funnel.get("objections", 0),
            "close": funnel.get("close", 0),
            "followup": funnel.get("followup", 0),
            "closed_won": funnel.get("closed_won", 0),
            "closed_lost": funnel.get("closed_lost", 0),
        },
        "alerts": [],
    }
