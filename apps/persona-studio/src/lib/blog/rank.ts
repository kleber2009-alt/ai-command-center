// «Мой блог»: ranking of the owner's own posts relative to his OWN medians
// (not to competitors). Pure module — used by /api/blog/run (stored score),
// /api/blog/items (live ranking over all own posts) and tests.
//
//   reels:     views 0.5 · ER 0.3 · shares 0.2
//   carousels: comments 0.5 · shares 0.3 · likes 0.2  (comments = code words)
//
// Each metric is turned into a ratio to the owner's median for that kind
// (clamped to [0, 10]) and the ratios are blended with the weights above.
// A metric with no data at all (e.g. hidden likes → all zeros, Apify did not
// return shares) is dropped and the remaining weights are renormalised, so a
// missing field never drags everybody down to the same score.
//
// Skill ilia-carousel-style §1: sources are «победители» (lots of comments)
// and «сильная начинка, слабый хук» (few comments, but people share/save).

export type OwnKind = 'reel' | 'carousel';

export type OwnPostInput = {
  id: string;
  kind: OwnKind;
  plays: number;
  likes: number;
  comments: number;
  shares: number;
  postedAt: Date | null;
};

export type OwnMedians = {
  views: number;
  er: number;
  likes: number;
  comments: number;
  shares: number;
  count: number;
};

export type OwnRank = {
  id: string;
  score: number; // 1.0 ≈ a typical (median) post of this kind
  ratios: Partial<Record<'views' | 'er' | 'likes' | 'comments' | 'shares', number>>;
  er: number; // (likes+comments)/views·100, reels only (0 for carousels)
  best: boolean; // top of the owner's own posts
  winner: boolean; // carousel: comments ≥ 1.5× median → repeat with a new hook
  strongBody: boolean; // carousel: shared a lot but few comments → weak hook
  rank: number; // 1-based position by score within its kind
};

const RATIO_CAP = 10;
/** Posts younger than this are «рано перевыкладывать» (skill: 2–3 weeks). */
export const REMIX_COOLDOWN_DAYS = 14;

export function median(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function erOf(p: Pick<OwnPostInput, 'plays' | 'likes' | 'comments'>): number {
  return p.plays > 0 ? ((p.likes + p.comments) / p.plays) * 100 : 0;
}

export function ownMedians(posts: OwnPostInput[]): OwnMedians {
  return {
    views: median(posts.map((p) => p.plays)),
    er: median(posts.map(erOf)),
    likes: median(posts.map((p) => p.likes)),
    comments: median(posts.map((p) => p.comments)),
    shares: median(posts.map((p) => p.shares)),
    count: posts.length,
  };
}

function ratio(value: number, med: number): number {
  if (med <= 0) return value > 0 ? RATIO_CAP : 1;
  return Math.max(0, Math.min(RATIO_CAP, value / med));
}

type MetricKey = 'views' | 'er' | 'likes' | 'comments' | 'shares';
const WEIGHTS: Record<OwnKind, Array<[MetricKey, number]>> = {
  reel: [
    ['views', 0.5],
    ['er', 0.3],
    ['shares', 0.2],
  ],
  carousel: [
    ['comments', 0.5],
    ['shares', 0.3],
    ['likes', 0.2],
  ],
};

function metricValue(p: OwnPostInput, k: MetricKey): number {
  switch (k) {
    case 'views':
      return p.plays;
    case 'er':
      return erOf(p);
    case 'likes':
      return p.likes;
    case 'comments':
      return p.comments;
    case 'shares':
      return p.shares;
  }
}

/** Rank one kind's posts against their own medians. */
export function rankOwnKind(posts: OwnPostInput[], kind: OwnKind): { medians: OwnMedians; ranks: OwnRank[] } {
  const list = posts.filter((p) => p.kind === kind);
  const medians = ownMedians(list);
  if (list.length === 0) return { medians, ranks: [] };

  // Drop metrics nobody has (hidden likes, no shares field) and renormalise.
  const active = WEIGHTS[kind].filter(([k]) => list.some((p) => metricValue(p, k) > 0));
  const wSum = active.reduce((s, [, w]) => s + w, 0) || 1;

  const scored = list.map((p) => {
    const ratios: OwnRank['ratios'] = {};
    let score = 0;
    for (const [k, w] of active) {
      const r = ratio(metricValue(p, k), medians[k]);
      ratios[k] = Math.round(r * 100) / 100;
      score += (r * w) / wSum;
    }
    return { p, ratios, score: active.length ? Math.round(score * 1000) / 1000 : 0 };
  });

  scored.sort((a, b) => b.score - a.score);
  // «лучшее»: top quarter (at least 1), and clearly above a typical post.
  const topN = Math.max(1, Math.ceil(scored.length / 4));

  const ranks = scored.map(({ p, ratios, score }, i): OwnRank => {
    const c = ratios.comments ?? 0;
    const sh = ratios.shares ?? 0;
    return {
      id: p.id,
      score,
      ratios,
      er: Math.round(erOf(p) * 100) / 100,
      best: scored.length >= 2 ? i < topN && score >= 1.15 : false,
      winner: kind === 'carousel' && c >= 1.5,
      strongBody: kind === 'carousel' && sh >= 1.2 && c < 0.9,
      rank: i + 1,
    };
  });
  return { medians, ranks };
}

export function rankOwn(posts: OwnPostInput[]): {
  reel: { medians: OwnMedians; ranks: OwnRank[] };
  carousel: { medians: OwnMedians; ranks: OwnRank[] };
} {
  return { reel: rankOwnKind(posts, 'reel'), carousel: rankOwnKind(posts, 'carousel') };
}

export function daysSince(d: Date | null, now = Date.now()): number | null {
  if (!d) return null;
  return Math.max(0, (now - d.getTime()) / 86_400_000);
}

/** true → the original is too fresh to repost (Instagram cuts reach on near-duplicates). */
export function inRemixCooldown(postedAt: Date | null, now = Date.now()): boolean {
  const d = daysSince(postedAt, now);
  return d != null && d < REMIX_COOLDOWN_DAYS;
}

/**
 * Apify error string → readable Russian text for the UI. The raw text is
 * `apify <status>: <body>` from runActor (lib/parser/apify.ts).
 */
export function apifyErrorText(raw: string | null | undefined): string {
  const m = (raw ?? '').toLowerCase();
  if (!m) return 'Instagram не ответил — попробуйте ещё раз.';
  if (/outstanding invoice|unpaid|payment|billing|platform-feature-disabled|402/.test(m)) {
    return 'Аккаунт Apify заблокирован за неоплаченные счета. Оплатите счёт в console.apify.com → Billing — после этого «Обновить из Instagram» заработает.';
  }
  if (/token missing|token-not-provided|apify_token|401|user-or-token-not-found/.test(m)) {
    return 'Не задан или неверен ключ Apify (APIFY_TOKEN) — его добавляет администратор сервера.';
  }
  if (/monthly usage|usage hard limit|limit exceeded|apify_budget_exceeded/.test(m)) {
    return 'Исчерпан месячный лимит Apify — поднимите лимит в Apify или дождитесь нового месяца.';
  }
  if (/private|not found|404|no posts|doesn.t exist/.test(m)) {
    return 'Аккаунт не найден или закрыт — проверьте ник.';
  }
  if (/timeout|aborted|timed out/.test(m)) {
    return 'Instagram отвечал слишком долго — попробуйте ещё раз или уменьшите период.';
  }
  return 'Не удалось получить посты из Instagram — попробуйте позже.';
}
