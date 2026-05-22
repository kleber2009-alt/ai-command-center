// Instagram research v0. Apify scrape → Claude analysis → structured report.
//
// Output shape (matches what /research/ig/[jobId] page renders):
//   account: { username, displayName?, followers?, totalPosts }
//   posts:   [{ shortCode, type, url, caption, likes, comments, plays, posted_at, isReel }]
//   summary: { topHook, avgEngagement, reelsRatio, viralPattern, bestCaptionLength }
//   hooks:   [{ text, engagement_score, type, why_works }]      (top 3-5)
//   visuals: { dominant_style, color_palette_hint, content_archetypes }
//   ctas:    [{ pattern, frequency, effectiveness }]
//   weaknesses: [{ area, finding, fix }]                        (top 3)

import { scrapeAccountPosts, type IgPost } from "@/lib/apify";
import { chat, extractJson } from "@/lib/anthropic";

export interface IgResearchReport {
  account: {
    username: string;
    total_posts_analyzed: number;
    reels_count: number;
    avg_likes: number;
    avg_comments: number;
    top_post_url: string | null;
    top_post_engagement: number;
  };
  posts: Array<{
    shortCode?: string;
    url?: string;
    type?: string;
    isReel: boolean;
    caption: string;
    likes: number;
    comments: number;
    plays: number;
    posted_at: string | null;
  }>;
  summary: {
    headline: string;
    top_hook: string;
    avg_engagement: number;
    reels_ratio: number;
    viral_pattern: string;
    best_caption_length: string;
  };
  hooks: Array<{ text: string; engagement_score: number; type: string; why_works: string }>;
  visuals: {
    dominant_style: string;
    color_palette_hint: string;
    content_archetypes: string[];
  };
  ctas: Array<{ pattern: string; frequency: string; effectiveness: string }>;
  weaknesses: Array<{ area: string; finding: string; fix: string }>;
  meta: { analyzed_at: string; analyzer_version: "v0"; cost_provider_tokens?: number };
}

export async function runIgResearch(rawUsername: string): Promise<IgResearchReport> {
  const username = rawUsername.replace(/^@/, "").trim();
  if (!username) throw new Error("username required");

  // 1) Scrape last 30 days, max 12 posts
  const scraped = await scrapeAccountPosts(username, { days: 30, limit: 12 });
  if (!scraped.ok) throw new Error(`Apify scrape failed: ${scraped.error}`);
  if (scraped.items.length === 0) {
    throw new Error(`No posts found for @${username} in last 30 days (private account or empty profile)`);
  }

  // 2) Distill to compact post records
  const posts = scraped.items.map((p: IgPost) => ({
    shortCode: p.shortCode,
    url: p.url ?? (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : undefined),
    type: p.type ?? p.productType,
    isReel: (p.productType === "clips") || (p.type === "Video"),
    caption: (p.caption ?? "").slice(0, 800),
    likes: Number(p.likesCount ?? 0),
    comments: Number(p.commentsCount ?? 0),
    plays: Number(p.videoPlayCount ?? p.videoViewCount ?? 0),
    posted_at: p.timestamp ?? null,
  }));

  const reelsCount = posts.filter((p) => p.isReel).length;
  const avgLikes    = Math.round(posts.reduce((s, p) => s + p.likes, 0) / posts.length);
  const avgComments = Math.round(posts.reduce((s, p) => s + p.comments, 0) / posts.length);
  const topPost = posts.reduce((a, b) => (a.likes + a.comments * 30 > b.likes + b.comments * 30 ? a : b));
  const topEng  = topPost.likes + topPost.comments * 30;

  // 3) Claude analysis. Strict JSON output requested.
  const compact = posts.map((p, i) => ({
    i: i + 1,
    type: p.isReel ? "reel" : "post",
    caption: p.caption,
    likes: p.likes, comments: p.comments, plays: p.plays,
  }));

  const SYSTEM = `Ты — senior content strategist для Instagram-креаторов и брендов.
Анализируешь набор последних 12 постов аккаунта и возвращаешь СТРОГО JSON по схеме.
Никакого markdown, никакого текста снаружи JSON. Только сам объект.
Все строковые поля — на русском языке, кроме content_archetypes (английский, snake_case).`;

  const SCHEMA = `{
  "headline": "одна-две фразы, главный инсайт по аккаунту",
  "top_hook": "пример сильного хука из их постов с пояснением почему он работает",
  "viral_pattern": "что общего у их самых заходящих постов (формат, угол, тема)",
  "best_caption_length": "одна из: «<50 chars», «50-200 chars», «200-500 chars», «>500 chars»",
  "hooks": [
    { "text": "конкретный пример хука", "engagement_score": 0-100, "type": "вопрос|шок|статистика|обещание|история|spike|другое", "why_works": "почему этот хук цепляет" }
  ],
  "visuals": {
    "dominant_style": "описание визуального стиля (например: «cinematic, тёплая палитра, mid-shot, естественный свет»)",
    "color_palette_hint": "3-4 hex-кода главных цветов через запятую (например: #F5E6D3, #2A2A2A, #C97B5F)",
    "content_archetypes": ["selfie_intro", "before_after", "carousel_education", "behind_the_scenes", "talking_head_reel"]
  },
  "ctas": [
    { "pattern": "конкретный CTA-паттерн (например: «комментарий ключевое слово → DM с гайдом»)", "frequency": "часто|иногда|редко|не используется", "effectiveness": "оценка эффективности" }
  ],
  "weaknesses": [
    { "area": "название области (например: «Hook strength», «CTA conversion», «Carousel design»)", "finding": "что плохо или упускается", "fix": "конкретный actionable совет" }
  ]
}`;

  const USER = `Аккаунт: @${username}
Постов в наборе: ${posts.length} (из них Reels: ${reelsCount})
Средний engagement: ${avgLikes} likes, ${avgComments} comments
Топ-пост по engagement (likes + comments × 30): ${topEng}

Данные постов (JSON):
${JSON.stringify(compact, null, 2)}

Верни анализ строго по схеме (только JSON-объект, никакого markdown):
${SCHEMA}`;

  const ai = await chat({
    system: SYSTEM,
    messages: [{ role: "user", content: USER }],
    maxTokens: 2500,
  });

  const parsed = extractJson<{
    headline: string;
    top_hook: string;
    viral_pattern: string;
    best_caption_length: string;
    hooks: Array<{ text: string; engagement_score: number; type: string; why_works: string }>;
    visuals: { dominant_style: string; color_palette_hint: string; content_archetypes: string[] };
    ctas: Array<{ pattern: string; frequency: string; effectiveness: string }>;
    weaknesses: Array<{ area: string; finding: string; fix: string }>;
  }>(ai.text);

  if (!parsed) throw new Error(`Claude returned non-JSON: ${ai.text.slice(0, 300)}`);

  return {
    account: {
      username,
      total_posts_analyzed: posts.length,
      reels_count: reelsCount,
      avg_likes: avgLikes,
      avg_comments: avgComments,
      top_post_url: topPost.url ?? null,
      top_post_engagement: topEng,
    },
    posts,
    summary: {
      headline: parsed.headline,
      top_hook: parsed.top_hook,
      avg_engagement: avgLikes + avgComments * 30,
      reels_ratio: reelsCount / posts.length,
      viral_pattern: parsed.viral_pattern,
      best_caption_length: parsed.best_caption_length,
    },
    hooks: parsed.hooks ?? [],
    visuals: parsed.visuals,
    ctas: parsed.ctas ?? [],
    weaknesses: parsed.weaknesses ?? [],
    meta: {
      analyzed_at: new Date().toISOString(),
      analyzer_version: "v0",
      cost_provider_tokens: (ai.usage?.input_tokens ?? 0) + (ai.usage?.output_tokens ?? 0),
    },
  };
}
