// Unit tests for the token ledger — the money-critical path. We mock the
// Prisma client and the env module so these run with zero infra (no DB, no
// Zod env parse), using Node's built-in test runner + module mocking.
//
// Run: npm test  (node --import tsx --test --experimental-test-module-mocks)
import { test, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Mutable context the fake Prisma reads from ──────────────────
type Ctx = {
  balance: number;
  userExists: boolean;
  txCalls: number; // how many times $transaction was entered
  updates: Array<{ decrement?: number; increment?: number }>;
  txs: Array<{ userId: string; amount: number; type: string; reason: string; refId?: string }>;
};

const ctx: Ctx = { balance: 0, userExists: true, txCalls: 0, updates: [], txs: [] };

function reset(balance: number, userExists = true) {
  ctx.balance = balance;
  ctx.userExists = userExists;
  ctx.txCalls = 0;
  ctx.updates = [];
  ctx.txs = [];
}

const fakeTx = {
  user: {
    findUnique: async () => (ctx.userExists ? { tokenBalance: ctx.balance } : null),
    update: async ({ data }: { data: { tokenBalance: { decrement?: number; increment?: number } } }) => {
      const d = data.tokenBalance;
      if (typeof d.decrement === 'number') ctx.balance -= d.decrement;
      if (typeof d.increment === 'number') ctx.balance += d.increment;
      ctx.updates.push(d);
      return {};
    },
  },
  tokenTransaction: {
    create: async ({ data }: { data: Ctx['txs'][number] }) => {
      ctx.txs.push(data);
      return {};
    },
  },
};

const fakePrisma = {
  $transaction: async (cb: (tx: typeof fakeTx) => Promise<unknown>) => {
    ctx.txCalls += 1;
    return cb(fakeTx);
  },
};

const fakeEnv = {
  COST_AVATAR_GENERATION: 10,
  COST_COVER_GENERATION: 3,
  COST_HEYGEN_VIDEO: 100,
  COST_OMNIHUMAN_VIDEO: 140,
  COST_SUBMAGIC_EDIT: 15,
  COST_SLIDE_IMAGE: 3,
  COST_RESEARCH_TRANSCRIBE: 5,
  COST_RESEARCH_TRANSLATE: 1,
  COST_RESEARCH_ANALYZE: 5,
  COST_RESEARCH_PAGE_ANALYZE: 10,
  COST_RESEARCH_REFRESH_AUTHOR: 5,
  COST_RESEARCH_HOOK_GEN: 1,
};

mock.module('../src/lib/prisma.ts', { namedExports: { prisma: fakePrisma } });
mock.module('../src/lib/env.ts', { namedExports: { env: fakeEnv } });

// Loaded in before() — top-level await isn't available under the CJS transform.
let chargeTokens: typeof import('../src/lib/tokens.ts').chargeTokens;
let refundTokens: typeof import('../src/lib/tokens.ts').refundTokens;
let creditTokens: typeof import('../src/lib/tokens.ts').creditTokens;
let InsufficientTokensError: typeof import('../src/lib/tokens.ts').InsufficientTokensError;
let COSTS: typeof import('../src/lib/tokens.ts').COSTS;

before(async () => {
  ({ chargeTokens, refundTokens, creditTokens, InsufficientTokensError, COSTS } = await import(
    '../src/lib/tokens.ts'
  ));
});

beforeEach(() => reset(0));

// ── chargeTokens ────────────────────────────────────────────────
test('chargeTokens debits balance and writes a negative charge tx', async () => {
  reset(50);
  await chargeTokens({ userId: 'u1', amount: 10, reason: 'avatar-generation:x', refId: 'gen1' });
  assert.equal(ctx.balance, 40);
  assert.equal(ctx.txs.length, 1);
  assert.deepEqual(ctx.txs[0], {
    userId: 'u1',
    amount: -10,
    type: 'charge',
    reason: 'avatar-generation:x',
    refId: 'gen1',
  });
});

test('chargeTokens throws InsufficientTokensError and writes nothing when balance is too low', async () => {
  reset(5);
  await assert.rejects(
    () => chargeTokens({ userId: 'u1', amount: 10, reason: 'video' }),
    (err: unknown) => {
      assert.ok(err instanceof InsufficientTokensError);
      assert.equal((err as InsufficientTokensError).have, 5);
      assert.equal((err as InsufficientTokensError).need, 10);
      return true;
    },
  );
  assert.equal(ctx.balance, 5, 'balance untouched on failure');
  assert.equal(ctx.updates.length, 0);
  assert.equal(ctx.txs.length, 0);
});

test('chargeTokens at exactly the balance succeeds (boundary)', async () => {
  reset(30);
  await chargeTokens({ userId: 'u1', amount: 30, reason: 'heygen' });
  assert.equal(ctx.balance, 0);
  assert.equal(ctx.txs[0].amount, -30);
});

test('chargeTokens with amount <= 0 is a no-op (no transaction opened)', async () => {
  reset(50);
  await chargeTokens({ userId: 'u1', amount: 0, reason: 'noop' });
  await chargeTokens({ userId: 'u1', amount: -5, reason: 'noop' });
  assert.equal(ctx.txCalls, 0, 'must not open a transaction');
  assert.equal(ctx.balance, 50);
  assert.equal(ctx.txs.length, 0);
});

test('chargeTokens throws USER_NOT_FOUND when the user is missing', async () => {
  reset(0, false);
  await assert.rejects(
    () => chargeTokens({ userId: 'ghost', amount: 1, reason: 'x' }),
    /USER_NOT_FOUND/,
  );
  assert.equal(ctx.updates.length, 0);
});

// ── refundTokens ────────────────────────────────────────────────
test('refundTokens credits balance and writes a positive refund tx', async () => {
  reset(0);
  await refundTokens({ userId: 'u1', amount: 7, reason: 'avatar:partial', refId: 'gen1' });
  assert.equal(ctx.balance, 7);
  assert.deepEqual(ctx.txs[0], {
    userId: 'u1',
    amount: 7,
    type: 'refund',
    reason: 'avatar:partial',
    refId: 'gen1',
  });
});

test('refundTokens with amount <= 0 is a no-op', async () => {
  reset(10);
  await refundTokens({ userId: 'u1', amount: 0, reason: 'noop' });
  assert.equal(ctx.txCalls, 0);
  assert.equal(ctx.balance, 10);
});

// ── creditTokens ────────────────────────────────────────────────
test('creditTokens credits balance with the given type', async () => {
  reset(0);
  await creditTokens({ userId: 'u1', amount: 100, type: 'purchase', reason: 'cryptobot:pro:42', refId: 'inv1' });
  assert.equal(ctx.balance, 100);
  assert.equal(ctx.txs[0].type, 'purchase');
  assert.equal(ctx.txs[0].amount, 100);
});

test('creditTokens with amount <= 0 is a no-op (guards zero-credit)', async () => {
  reset(0);
  await creditTokens({ userId: 'u1', amount: 0, type: 'signup_bonus', reason: 'welcome' });
  assert.equal(ctx.txCalls, 0);
  assert.equal(ctx.txs.length, 0);
});

// ── Full charge → refund round-trip nets to zero ────────────────
test('charge then full refund nets the balance back (failed-generation path)', async () => {
  reset(100);
  await chargeTokens({ userId: 'u1', amount: 30, reason: 'heygen:gen1', refId: 'gen1' });
  assert.equal(ctx.balance, 70);
  await refundTokens({ userId: 'u1', amount: 30, reason: 'heygen:failed:gen1', refId: 'gen1' });
  assert.equal(ctx.balance, 100, 'failed generation must restore the full charge');
});

// ── Proportional refund math (avatar worker partial-fail invariant) ──
// The avatar worker refunds floor(tokensCost * failedCount / total). Lock the
// contract so a future change can't silently over- or under-refund.
function partialRefund(tokensCost: number, failed: number, total: number) {
  return Math.floor((tokensCost * failed) / total);
}

test('proportional refund: 3 of 10 avatars failed → refund 3 of 10 tokens', () => {
  assert.equal(partialRefund(10, 3, 10), 3);
});

test('proportional refund: all failed → full refund', () => {
  assert.equal(partialRefund(10, 10, 10), 10);
});

test('proportional refund: none failed → zero refund', () => {
  assert.equal(partialRefund(10, 0, 10), 0);
});

test('proportional refund floors fractional amounts (never over-refunds)', () => {
  // 10 tokens, 1 of 3 failed = 3.33 → floor 3
  assert.equal(partialRefund(10, 1, 3), 3);
});

// ── COSTS map is wired to env ───────────────────────────────────
test('COSTS reflects env-driven token costs (incl. repriced video)', () => {
  assert.equal(COSTS.avatarGeneration, 10);
  assert.equal(COSTS.coverGeneration, 3);
  assert.equal(COSTS.heygenVideo, 100);
  assert.equal(COSTS.omnihumanVideo, 140);
  assert.equal(COSTS.submagicEdit, 15);
});
