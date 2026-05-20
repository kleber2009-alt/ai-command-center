import { NextResponse } from "next/server";

// Placeholder. Wire to Stripe / Cryptomus / WayForPay in Phase 2.
export async function POST() {
  return NextResponse.json(
    { error: "Checkout not yet enabled. Add Stripe keys to enable." },
    { status: 501 }
  );
}
