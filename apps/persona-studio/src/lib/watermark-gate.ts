// Pure gate for free-plan watermarking — kept import-free so it unit-tests
// under the dependency-free CI runner.
//
// We deliberately do NOT key off User.plan: buying a token pack credits tokens
// but never upgrades `plan` (it stays 'free'), so plan-based gating would
// watermark paying users' outputs. The correct signal is "has this user ever
// paid?" (see lib/plan.ts hasEverPaid).
export function shouldWatermark(enabled: boolean, hasPaid: boolean): boolean {
  return enabled && !hasPaid;
}
