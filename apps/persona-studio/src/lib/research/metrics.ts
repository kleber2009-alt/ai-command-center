// Метрики ресёрча из ТЗ §2. Единственный источник истины — этот файл
// импортируется и при индексации автора, и при расчёте полей рилса, и
// при сортировке выдачи. Если формула меняется здесь — она меняется
// везде, никакого дублирования.

const ROUND_VIRALITY = 10;     // округление виральности до 0.1x
const ROUND_PERCENT = 10;      // ER в процентах с одной цифрой после запятой
const MIN_DAYS = 0.5;          // velocity знаменатель не падает ниже 12 часов
const SCORE_W_REACH = 0.5;
const SCORE_W_ENGAGEMENT = 0.2;
const SCORE_W_VELOCITY = 0.15;
const SCORE_W_VIRALITY = 0.15;

export type ReelMetricsInput = {
  views: number;
  likes: number;
  comments: number;
  postedAtMs: number | null;
  authorMedianViews: number | null;
  authorFollowers: number | null;
};

export type ReelMetrics = {
  virality: number | null;        // views / median, округлено до 0.1
  engagementRate: number | null;   // %, округлено до 0.1
  velocity: number | null;         // views / max(days, 0.5)
  reach: number | null;            // views / followers
};

/**
 * Считает per-reel метрики. Все четыре независимы — null если входных
 * данных не хватает (например, нет медианы автора → нет виральности).
 */
export function computeReelMetrics(input: ReelMetricsInput): ReelMetrics {
  const { views, likes, comments, postedAtMs, authorMedianViews, authorFollowers } = input;

  let virality: number | null = null;
  if (authorMedianViews && authorMedianViews > 0 && views > 0) {
    virality = Math.round((views / authorMedianViews) * ROUND_VIRALITY) / ROUND_VIRALITY;
  }

  let engagementRate: number | null = null;
  if (views > 0) {
    const er = ((likes + comments) / views) * 100;
    engagementRate = Math.round(er * ROUND_PERCENT) / ROUND_PERCENT;
  }

  let velocity: number | null = null;
  if (postedAtMs && views > 0) {
    const days = Math.max(MIN_DAYS, (Date.now() - postedAtMs) / 86_400_000);
    velocity = Math.round(views / days);
  }

  let reach: number | null = null;
  if (authorFollowers && authorFollowers > 0 && views > 0) {
    reach = views / authorFollowers;
  }

  return { virality, engagementRate, velocity, reach };
}

/**
 * Медиана с защитой от пустого массива. Если данных < 3 — считаем
 * медиану, но возвращаем lowConfidence=true, чтобы downstream-логика
 * могла пометить автора и не делать выводы из шумной выборки.
 */
export function computeAuthorMedian(views: number[]): {
  median: number | null;
  windowUsed: number;
  lowConfidence: boolean;
} {
  const arr = views.filter((v) => Number.isFinite(v) && v > 0).slice().sort((a, b) => a - b);
  if (arr.length === 0) return { median: null, windowUsed: 0, lowConfidence: true };
  const mid = Math.floor(arr.length / 2);
  const median = arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
  return {
    median: Math.round(median),
    windowUsed: arr.length,
    lowConfidence: arr.length < 10,
  };
}

/**
 * Средний ER по выборке рилсов автора. Используется как `engagement_avg`
 * в ResearchAuthor — отдельный показатель «как обычно реагируют на этого
 * автора».
 */
export function computeAuthorEngagementAvg(
  reels: Array<{ views: number; likes: number; comments: number }>,
): number | null {
  const ers = reels
    .filter((r) => r.views > 0)
    .map((r) => ((r.likes + r.comments) / r.views) * 100);
  if (ers.length === 0) return null;
  const avg = ers.reduce((a, b) => a + b, 0) / ers.length;
  return Math.round(avg * ROUND_PERCENT) / ROUND_PERCENT;
}

/**
 * `viral_score` 0..100 — это сводный композит для дефолтной сортировки
 * выдачи. Считается ПЕРЦЕНТИЛЬНО внутри корпуса (ниши/выборки), а не
 * абсолютно: смысл в «насколько ролик выделяется среди соседей»,
 * а не «насколько большие у него абсолютные просмотры».
 *
 * ТЗ §2: 0.5·reach + 0.2·engagement + 0.15·velocity + 0.15·virality.
 * Если у автора нет followers — вес reach переносится на virality
 * (чтобы для безымянных аккаунтов балл всё равно был осмысленным).
 */
export type ScoreInput = {
  reach: number | null;
  engagementRate: number | null;
  velocity: number | null;
  virality: number | null;
};

function percentileRank(values: Array<number | null>, value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return 0;
  const below = valid.filter((v) => v < value).length;
  const equal = valid.filter((v) => v === value).length;
  // mid-rank percentile, нормирован в 0..1
  return (below + equal / 2) / valid.length;
}

export function computeViralScores(inputs: ScoreInput[]): number[] {
  if (inputs.length === 0) return [];
  const reachVals = inputs.map((i) => i.reach);
  const erVals = inputs.map((i) => i.engagementRate);
  const velocityVals = inputs.map((i) => i.velocity);
  const viralityVals = inputs.map((i) => i.virality);

  const hasAnyReach = reachVals.some((v) => v !== null);

  return inputs.map((inp) => {
    const reachP = percentileRank(reachVals, inp.reach);
    const erP = percentileRank(erVals, inp.engagementRate);
    const velP = percentileRank(velocityVals, inp.velocity);
    const virP = percentileRank(viralityVals, inp.virality);

    let score: number;
    if (hasAnyReach && inp.reach !== null) {
      score = SCORE_W_REACH * reachP
            + SCORE_W_ENGAGEMENT * erP
            + SCORE_W_VELOCITY * velP
            + SCORE_W_VIRALITY * virP;
    } else {
      // reach недоступен → его вес перекидываем на virality
      score = SCORE_W_ENGAGEMENT * erP
            + SCORE_W_VELOCITY * velP
            + (SCORE_W_VIRALITY + SCORE_W_REACH) * virP;
    }
    return Math.round(score * 100 * 10) / 10; // 0..100, одна цифра после запятой
  });
}
