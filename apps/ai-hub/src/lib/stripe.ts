// Stripe SDK singleton. Server-only — never import from client code.
import Stripe from "stripe";

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  _stripe = new Stripe(key, {
    // Pin to the version stripe-node currently ships with — keeps webhook
    // and Checkout payload shapes stable across SDK upgrades.
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
  return _stripe;
}
