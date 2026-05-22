// Liveness + readiness probe. Returns 200 when DB + Redis reachable.
// Used by Docker healthcheck and any external uptime monitor.

import { NextResponse } from "next/server";
import IORedis from "ioredis";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

let _redis: IORedis | null = null;
function redis() {
  if (_redis) return _redis;
  _redis = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  return _redis;
}

export async function GET() {
  const started = Date.now();
  const checks: Record<string, { ok: boolean; ms: number; error?: string }> = {};

  const dbStart = Date.now();
  try {
    await db.execute(sql`select 1`);
    checks.db = { ok: true, ms: Date.now() - dbStart };
  } catch (err) {
    checks.db = { ok: false, ms: Date.now() - dbStart, error: String(err).slice(0, 200) };
  }

  const redisStart = Date.now();
  try {
    const pong = await redis().ping();
    checks.redis = { ok: pong === "PONG", ms: Date.now() - redisStart };
  } catch (err) {
    checks.redis = { ok: false, ms: Date.now() - redisStart, error: String(err).slice(0, 200) };
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({
    status: ok ? "ok" : "degraded",
    checks,
    totalMs: Date.now() - started,
    version: process.env.GIT_SHA ?? "dev",
  }, { status: ok ? 200 : 503 });
}
