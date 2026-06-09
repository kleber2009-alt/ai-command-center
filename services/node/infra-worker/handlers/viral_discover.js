// ═══════════════════════════════════════════════════════════════════
// handlers/viral_discover.js — ежедневный поиск залетевших постов
// ───────────────────────────────────────────────────────────────────
// Два режима в одном handler'е:
//
//   1. SYSTEM-WIDE FAN-OUT (из cron'а ruleTick'a):
//      job.user_id IS NULL → находим всех с enabled-конфигом,
//      инсёртим по одному per-user scheduled_jobs и выходим.
//
//   2. PER-USER RUN:
//      job.user_id IS NOT NULL (или payload.user_id) → скрейпим,
//      ранжируем, прогоняем через Claude, шлём deliverable в TG.
//
// Apify-расходы оплачивает виталик/юзер. Без APIFY_TOKEN handler
// сразу падает с понятной ошибкой — без скрытых retry'ев.
// ═══════════════════════════════════════════════════════════════════

import { query, queryOne } from '../lib/db.js';
import { chat } from '../lib/anthropic.js';
import { sendDeliverable, sendText } from '../lib/tg.js';
import { scrapeAccountPosts, scrapeHashtagPosts, isApifyConfigured } from '../lib/apify.js';
import { classify, rankReels, rankCarousels } from '../lib/scoring.js';

const MAX_CLAUDE_TOKENS = 1500;

export async function handle(job) {
  const p = job.payload || {};
  const userId = job.user_id || p.user_id || null;

  // ── Mode 1: fan-out ──
  if (!userId) {
    const configs = await query(
      `SELECT user_id FROM viral_discover_configs WHERE enabled = TRUE`,
    );
    let scheduled = 0;
    for (const c of configs) {
      await query(
        `INSERT INTO scheduled_jobs (kind, user_id, scheduled_at, status, payload)
         VALUES ('viral_discover', $1, NOW(), 'pending', $2::jsonb)`,
        [c.user_id, JSON.stringify({ user_id: c.user_id })],
      );
      scheduled++;
    }
    return { ok: true, fanned_out: scheduled };
  }

  // ── Mode 2: per-user run ──
  return await runForUser(userId, p);
}

async function runForUser(userId, payload) {
  const cfg = await queryOne(
    `SELECT c.*, u.tg_chat_id AS user_tg_chat_id, u.name
       FROM viral_discover_configs c
       JOIN platform_users u ON u.id = c.user_id
      WHERE c.user_id = $1`,
    [userId],
  );
  if (!cfg) return { ok: false, error: `no viral_discover_configs for user ${userId}` };
  if (!cfg.enabled && !payload.force) {
    return { ok: true, skipped: 'config disabled' };
  }

  const tgChatId = Number(payload.tg_chat_id || cfg.tg_chat_id || cfg.user_tg_chat_id);
  if (!tgChatId) return { ok: false, error: 'no tg_chat_id (user + config both empty)' };

  if (!isApifyConfigured()) {
    await sendText(tgChatId,
      '⚠️ Парсер не настроен: <code>APIFY_TOKEN</code> отсутствует в окружении worker\'а.').catch(() => {});
    return { ok: false, error: 'APIFY_TOKEN missing' };
  }

  const competitors = Array.isArray(cfg.competitors) ? cfg.competitors : [];
  const hashtags = Array.isArray(cfg.hashtags) ? cfg.hashtags : [];
  if (competitors.length === 0 && hashtags.length === 0) {
    await sendText(tgChatId,
      '⚠️ Сначала добавь источники: <code>/discover_add @account</code> или <code>/discover_add #hashtag</code>.').catch(() => {});
    return { ok: false, error: 'no targets configured' };
  }

  const days = cfg.posted_within_days || 7;
  const perTargetLimit = cfg.per_target_limit || 25;

  // Собираем все items со всех источников. Падения отдельных таргетов
  // не прерывают общий run (просто пишем в errors).
  // Помечаем посты из hashtag-источника (для auto-discovery конкурентов
  // используем ТОЛЬКО hashtag-посты — там могут попасть авторы вне списка).
  const allItems = [];
  const errors = [];
  const hashtagItems = [];  // отдельный массив для discovery
  for (const c of competitors) {
    const r = await scrapeAccountPosts(c, { days, limit: perTargetLimit });
    if (r.ok) allItems.push(...r.items);
    else errors.push(`@${c.replace(/^@/, '')}: ${r.error}`);
  }
  for (const h of hashtags) {
    const r = await scrapeHashtagPosts(h, { days, limit: perTargetLimit });
    if (r.ok) {
      allItems.push(...r.items);
      // Аннотируем источником, чтобы потом в candidates понимать «через какой тег нашли».
      for (const it of r.items) {
        if (it) hashtagItems.push({ ...it, _foundViaHashtag: h.replace(/^#/, '') });
      }
    } else errors.push(`#${h.replace(/^#/, '')}: ${r.error}`);
  }

  // Какой бот доставляет результат — берём из конфига (default 'parser' для новых юзеров).
  const deliveryBot = cfg.bot === 'office' ? 'office' : 'parser';

  // Apify иногда возвращает items-ошибки вместо постов (handle не существует,
  // приватный, актор сломан). Отделим их сразу.
  const apifyErrors = allItems.filter((i) => i && (i.error || i.errorDescription));
  const realItemsBeforeThresholds = allItems.filter((i) => i && !i.error && !i.errorDescription);

  // Абсолютные пороги — отсеиваем «не-жирный» контент ДО классификации.
  // Apify не отдаёт share count, поэтому лайки используются как proxy.
  const minPlays    = Number(cfg.min_plays    || 0);
  const minLikes    = Number(cfg.min_likes    || 0);
  const minComments = Number(cfg.min_comments || 0);
  const realItems = (minPlays || minLikes || minComments)
    ? realItemsBeforeThresholds.filter((it) => {
        const plays    = Number(it.videoPlayCount || it.videoViewCount || 0);
        const likes    = Number(it.likesCount || 0);
        const comments = Number(it.commentsCount || 0);
        // Для рилсов — все три порога; для каруселей/фото нет play_count,
        // их пропускаем по plays-порогу только если likes/comments ОК.
        const hasPlays = plays > 0;
        const playsOK = !hasPlays || plays >= minPlays;
        return playsOK && likes >= minLikes && comments >= minComments;
      })
    : realItemsBeforeThresholds;
  const filteredOutByThresholds = realItemsBeforeThresholds.length - realItems.length;

  if (realItems.length === 0) {
    const firstErr = apifyErrors[0]
      ? String(apifyErrors[0].errorDescription || apifyErrors[0].error).slice(0, 300)
      : (errors[0] || 'no posts found');
    const lines = [
      `⚠️ Apify не вернул ни одного поста.`,
      ``,
      `Источников было: <b>${(cfg.competitors || []).length} акк + ${(cfg.hashtags || []).length} тег</b>.`,
      `Ответов от actor'а: <b>${allItems.length}</b>, из них ошибок: <b>${apifyErrors.length}</b>.`,
      ``,
      `<b>Первая ошибка от Apify:</b>`,
      `<code>${escapeHtml(firstErr)}</code>`,
      ``,
      `Часто это значит: handle с опечаткой, аккаунт приватный или удалён, либо хэштег не поддерживается актором.`,
      `Проверь /list и обнови — /add @handle / /remove @handle.`,
    ];
    await sendText(tgChatId, lines.join('\n'), { bot: deliveryBot }).catch(() => {});
    await query(
      `INSERT INTO viral_discover_runs (user_id, tg_chat_id, posts_scanned, last_error)
       VALUES ($1, $2, 0, $3)`,
      [userId, tgChatId, errors.join(' | ').slice(0, 1000)],
    );
    return { ok: false, error: 'no posts scraped' };
  }

  const cls = classify(realItems);
  const topReels = rankReels(cls.reels, cfg.reels_count || 5);
  const topCarousels = rankCarousels(cls.carousels, cfg.carousels_count || 5);

  if (topReels.length === 0 && topCarousels.length === 0) {
    const imgN = cls.images?.length || 0;
    const unkN = cls.unknown?.length || 0;
    const hasThresholds = minPlays || minLikes || minComments;
    const lines = [
      `⚠️ За ${days} дн. у твоих источников нет рилсов и каруселей, удовлетворяющих порогам.`,
      '',
      `Источников: <b>${realItemsBeforeThresholds.length}</b> постов после Apify`,
      hasThresholds ? `Отбросили по порогам: <b>${filteredOutByThresholds}</b>` : null,
      `Прошло пороги: <b>${realItems.length}</b>`,
      `  • рилсов: ${cls.reels.length}`,
      `  • каруселей: ${cls.carousels.length}`,
      `  • одиночных фото: ${imgN}`,
      unkN > 0 ? `  • неопознанных: ${unkN}` : null,
      '',
      hasThresholds
        ? `Текущие пороги: ≥${formatCount(minPlays)} просмотров · ≥${formatCount(minLikes)} лайков · ≥${formatCount(minComments)} комментариев.`
        : null,
      hasThresholds ? `Понизь: <code>/thresholds 50000 500 200</code>` : null,
      'Или добавь источники: /add @handle / /add #hashtag',
    ].filter(Boolean);
    await sendText(tgChatId, lines.join('\n'), { bot: deliveryBot }).catch(() => {});
    return { ok: false, error: `no reels/carousels (thresholds_filtered=${filteredOutByThresholds})` };
  }

  // Прогоняем через Claude — оценка fit-to-niche.
  const claudeRated = await rateWithClaude({
    niche: cfg.niche_description || '',
    userName: cfg.name || 'эксперт',
    reels: topReels,
    carousels: topCarousels,
  });
  // Если Claude недоступен — отдаём без оценок, но не падаем.
  const reelsFinal = mergeClaudeScores(topReels, claudeRated.reels);
  const carouselsFinal = mergeClaudeScores(topCarousels, claudeRated.carousels);

  // Создаём deliverable и шлём в TG.
  const messageText = buildMessage({
    userName: cfg.name || 'друг',
    reels: reelsFinal,
    carousels: carouselsFinal,
    summary: claudeRated.summary,
    postsScanned: allItems.length,
    errors,
    scoringUnavailable: claudeRated.failed,
  });

  const deliverable = await queryOne(
    `INSERT INTO deliverables
       (user_id, agent_id, agent_name, kind, title, body, metadata)
     VALUES ($1, 'marketing-content-creator', 'Аня', 'viral_discover',
             $2, $3, $4::jsonb)
     RETURNING id`,
    [
      userId,
      `Залетевшие посты в нише · ${new Date().toISOString().slice(0, 10)}`,
      messageText,
      JSON.stringify({
        tg_chat_id: tgChatId,
        reels: reelsFinal,
        carousels: carouselsFinal,
        posts_scanned: allItems.length,
        claude_summary: claudeRated.summary,
      }),
    ],
  );

  const send = await sendDeliverable(tgChatId, deliverable.id, messageText, { bot: deliveryBot });
  const tgMsgId = send.ok ? send.result?.message_id : null;

  await query(
    `INSERT INTO viral_discover_runs
       (user_id, tg_chat_id, reels, carousels, posts_scanned,
        claude_summary, deliverable_id, tg_message_id, last_error)
     VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9)`,
    [
      userId, tgChatId,
      JSON.stringify(reelsFinal), JSON.stringify(carouselsFinal),
      allItems.length,
      claudeRated.summary || null,
      deliverable.id,
      tgMsgId,
      errors.length > 0 ? errors.join(' | ').slice(0, 1000) : null,
    ],
  );

  if (!send.ok) {
    return { ok: false, error: `tg send: ${send.status || ''} ${String(send.error).slice(0, 200)}` };
  }

  // ── Auto-discovery новых конкурентов ────────────────────────────
  // Из hashtag-постов вытаскиваем авторов, которых ещё нет в competitors
  // и которые не были ранее accepted/rejected. Топ-3 по best velocity_score
  // шлём отдельным сообщением с inline-кнопками для подтверждения.
  let candidatesSent = 0;
  try {
    candidatesSent = await discoverAndSuggestCandidates({
      userId, tgChatId, deliveryBot,
      cfg, hashtagItems, allClassified: cls,
    });
  } catch (e) {
    console.warn(`[viral_discover] candidates suggest failed: ${e.message || e}`);
  }

  return {
    ok: true,
    deliverable_id: deliverable.id,
    reels: reelsFinal.length,
    carousels: carouselsFinal.length,
    posts_scanned: allItems.length,
    candidates_sent: candidatesSent,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Auto-discovery: ищем новых авторов в hashtag-постах
// ═══════════════════════════════════════════════════════════════════
async function discoverAndSuggestCandidates({ userId, tgChatId, deliveryBot, cfg, hashtagItems, allClassified }) {
  if (!hashtagItems || hashtagItems.length === 0) return 0;

  // Применяем те же пороги к кандидатам — рекомендуем только «жирных».
  const minPlays    = Number(cfg.min_plays    || 0);
  const minLikes    = Number(cfg.min_likes    || 0);
  const minComments = Number(cfg.min_comments || 0);
  const passingHashtagItems = (minPlays || minLikes || minComments)
    ? hashtagItems.filter((it) => {
        if (!it || it.error) return false;
        const plays    = Number(it.videoPlayCount || it.videoViewCount || 0);
        const likes    = Number(it.likesCount || 0);
        const comments = Number(it.commentsCount || 0);
        const hasPlays = plays > 0;
        const playsOK = !hasPlays || plays >= minPlays;
        return playsOK && likes >= minLikes && comments >= minComments;
      })
    : hashtagItems;
  if (passingHashtagItems.length === 0) return 0;

  // Множество already-known: existing competitors + previously accepted/rejected.
  const known = new Set();
  for (const c of cfg.competitors || []) {
    known.add(String(c).replace(/^@/, '').toLowerCase());
  }
  const prevDecided = await query(
    `SELECT lower(handle) AS h FROM viral_discover_candidates
      WHERE user_id = $1 AND status IN ('accepted','rejected')`,
    [userId],
  );
  for (const r of prevDecided) known.add(String(r.h).replace(/^@/, '').toLowerCase());

  // Аггрегируем по author: best velocity_score, sample posts, набор хэштегов.
  // Сначала нормализуем hashtag-items через scoring.classify-pipeline,
  // чтобы получить kind+velocity. Только reels/carousels попадают в pool.
  const fromHashtagsClassified = classify(passingHashtagItems);
  const candidatePosts = [
    ...rankReels(fromHashtagsClassified.reels, 30),
    ...rankCarousels(fromHashtagsClassified.carousels, 30),
  ];

  const byAuthor = new Map();  // handle.lower → {handle, score, posts:[], tags:Set}
  for (const p of candidatePosts) {
    if (!p.owner) continue;
    const h = String(p.owner).replace(/^@/, '').toLowerCase();
    if (!h || known.has(h)) continue;
    const cur = byAuthor.get(h) || { handle: '@' + p.owner.replace(/^@/, ''), score: 0, posts: [], tags: new Set() };
    cur.score = Math.max(cur.score, p.velocity_score || 0);
    if (cur.posts.length < 3) {
      cur.posts.push({ url: p.url, kind: p.kind, plays: p.plays, likes: p.likes, comments: p.comments, age_h: p.age_hours });
    }
    // Какой тег его принёс — берём из raw item через obratku по url.
    const raw = passingHashtagItems.find((it) => (it.url || '') === p.url);
    if (raw?._foundViaHashtag) cur.tags.add(raw._foundViaHashtag);
    byAuthor.set(h, cur);
  }

  if (byAuthor.size === 0) return 0;

  // Upsert всех найденных, увеличиваем posts_seen + bump last_seen.
  for (const [h, info] of byAuthor.entries()) {
    await query(
      `INSERT INTO viral_discover_candidates (user_id, handle, found_via, best_score, posts_seen)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (user_id, lower(handle)) DO UPDATE
         SET last_seen = NOW(),
             best_score = GREATEST(viral_discover_candidates.best_score, EXCLUDED.best_score),
             posts_seen = viral_discover_candidates.posts_seen + EXCLUDED.posts_seen,
             found_via = EXCLUDED.found_via`,
      [
        userId,
        info.handle,
        JSON.stringify({ hashtags: Array.from(info.tags), sample_posts: info.posts.slice(0, 3) }),
        info.score,
        info.posts.length,
      ],
    );
  }

  // Берём топ-3 pending для показа сейчас.
  const top = await query(
    `SELECT id, handle, best_score, found_via
       FROM viral_discover_candidates
      WHERE user_id = $1 AND status = 'pending'
      ORDER BY best_score DESC NULLS LAST
      LIMIT 3`,
    [userId],
  );
  if (top.length === 0) return 0;

  const lines = [];
  lines.push('<b>🆕 Возможные новые конкуренты</b>');
  lines.push('<i>Аня нашла в твоих хэштегах. Подтверди — и со следующего утра я буду парсить и их тоже.</i>');
  lines.push('');
  for (let i = 0; i < top.length; i++) {
    const c = top[i];
    const fv = c.found_via || {};
    const tagStr = (fv.hashtags || []).map((t) => '#' + escapeHtml(t)).join(' ');
    const samples = (fv.sample_posts || []).slice(0, 2);
    lines.push(`<b>${i + 1}.</b> ${escapeHtml(c.handle)}${tagStr ? '   ' + tagStr : ''}`);
    for (const s of samples) {
      lines.push(`   • <a href="${escapeHtml(s.url)}">${s.kind === 'reel' ? '🎬' : '🖼'} ${formatCount(s.plays || s.likes)} · ${formatAge(s.age_h)}</a>`);
    }
    lines.push('');
  }

  // Inline-keyboard: 2 кнопки на строку (Добавить / Не интересно) для каждого кандидата.
  const inline_keyboard = top.map((c, i) => ([
    { text: `✅ ${i + 1}. Добавить ${c.handle}`, callback_data: `cand:add:${c.id}` },
    { text: `❌`, callback_data: `cand:skip:${c.id}` },
  ]));

  const r = await sendText(tgChatId, lines.join('\n'), {
    bot: deliveryBot,
    reply_markup: { inline_keyboard },
  });
  return r.ok ? top.length : 0;
}

// ═══════════════════════════════════════════════════════════════════
// Claude scoring — даёт каждому посту fit-to-niche 1–10 + reason
// ═══════════════════════════════════════════════════════════════════
async function rateWithClaude({ niche, userName, reels, carousels }) {
  // failed=true означает «скоринг сломался» (для футера в TG);
  // при пустом входе скоринга просто нет — это не сбой.
  const empty = { reels: [], carousels: [], summary: null, failed: false };
  const failedFallback = { reels: [], carousels: [], summary: null, failed: true };
  if (reels.length === 0 && carousels.length === 0) return empty;

  // Готовим компактный список для Claude — без огромных подписей.
  const pack = (arr, prefix) => arr.map((p, i) => ({
    idx: `${prefix}${i + 1}`,
    type: p.kind,
    author: p.owner,
    age_h: p.age_hours,
    views: p.plays || null,
    likes: p.likes,
    comments: p.comments,
    velocity: p.velocity_score,
    hook: p.caption.slice(0, 200),
  }));

  const items = [...pack(reels, 'R'), ...pack(carousels, 'C')];

  const system = `Ты — контент-стратег для эксперта ${userName}. Ниша: ${niche || 'не указана'}.
Тебе показывают «залетевшие» посты конкурентов за последние дни.
Твоя задача — оценить каждый пост по шкале 1-10: насколько вероятно, что аналогичный по теме/механике пост сработает в блоге ${userName} (учитывая нишу выше).

Возвращай СТРОГО JSON-массив без markdown, без пояснений, без преамбулы. Формат:
[{"idx":"R1","score":8,"why":"одно предложение"},{"idx":"C1","score":6,"why":"..."}]

Правила:
- score: целое 1-10 (10 = почти гарантированно зайдёт, 1 = чужая аудитория).
- why: 6-12 слов на русском, конкретно почему оценка такая.
- Включи ВСЕ idx из входа, ни одного не пропусти.
- В конце добавь объект {"idx":"summary","why":"2-3 строки общего наблюдения по трендам"}.`;

  const userMsg = `JSON-вход:\n${JSON.stringify(items, null, 0)}`;

  const res = await chat({
    system,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: MAX_CLAUDE_TOKENS,
  });

  if (!res.ok) {
    console.warn(`[viral_discover] claude failed: ${res.status} ${String(res.details).slice(0, 150)}`);
    return failedFallback;
  }

  let parsed;
  try {
    // Иногда Claude всё-таки оборачивает в ```json ... ```
    const cleaned = res.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn(`[viral_discover] claude json parse: ${e.message}; text=${res.text.slice(0, 200)}`);
    return failedFallback;
  }
  if (!Array.isArray(parsed)) return failedFallback;

  const byIdx = new Map();
  let summary = null;
  for (const o of parsed) {
    if (!o || typeof o !== 'object') continue;
    if (o.idx === 'summary') { summary = String(o.why || '').slice(0, 600); continue; }
    if (typeof o.idx === 'string' && typeof o.score === 'number') {
      byIdx.set(o.idx, { score: Math.round(o.score), why: String(o.why || '').slice(0, 200) });
    }
  }

  return {
    reels: reels.map((_, i) => byIdx.get(`R${i + 1}`) || null),
    carousels: carousels.map((_, i) => byIdx.get(`C${i + 1}`) || null),
    summary,
    failed: false,
  };
}

function mergeClaudeScores(posts, claudeRatings) {
  return posts.map((p, i) => ({
    ...p,
    fit_score: claudeRatings[i]?.score ?? null,
    fit_why: claudeRatings[i]?.why ?? null,
  }));
}

// ═══════════════════════════════════════════════════════════════════
// Telegram-сообщение
// ═══════════════════════════════════════════════════════════════════
function buildMessage({ userName, reels, carousels, summary, postsScanned, errors, scoringUnavailable }) {
  const lines = [];
  lines.push(`<b>Аня ✍️</b>`);
  lines.push(`Доброе утро, ${escapeHtml(userName)}. Посмотрела ${postsScanned} постов конкурентов — вот что сейчас залетает в нише:`);
  lines.push('');

  if (reels.length > 0) {
    lines.push(`<b>🎬 Рилсы — топ ${reels.length}</b>`);
    reels.forEach((p, i) => lines.push(formatPost(i + 1, p)));
    lines.push('');
  }
  if (carousels.length > 0) {
    lines.push(`<b>🖼 Карусели — топ ${carousels.length}</b>`);
    carousels.forEach((p, i) => lines.push(formatPost(i + 1, p)));
    lines.push('');
  }
  if (summary) {
    lines.push(`<b>Что я вижу:</b>`);
    lines.push(escapeHtml(summary));
    lines.push('');
  }
  if (scoringUnavailable) {
    lines.push(`<i>⚠️ Оценки соответствия нише (X/10) временно недоступны — посты отранжированы по скорости. Попробую снова в следующей выдаче.</i>`);
    lines.push('');
  }
  if (errors.length > 0) {
    lines.push(`<i>Не удалось скрейпнуть: ${escapeHtml(errors.slice(0, 2).join('; ').slice(0, 200))}</i>`);
  }
  lines.push(`<i>Чтобы клонировать любой рилс — пришли: /clone &lt;url&gt;</i>`);

  // TG limit для message: 4096 chars.
  const text = lines.join('\n');
  return text.length > 4000 ? text.slice(0, 3990) + '\n…' : text;
}

function formatPost(n, p) {
  const scoreTag = p.fit_score
    ? `<b>${p.fit_score}/10</b>`
    : '—';
  const metricLine = p.kind === 'reel'
    ? `${formatCount(p.plays)} просмотров · ${formatCount(p.likes)}❤ · ${formatCount(p.comments)}💬 · ${formatAge(p.age_hours)}`
    : `${formatCount(p.likes)}❤ · ${formatCount(p.comments)}💬 · ${formatAge(p.age_hours)}`;
  const ownerTag = p.owner ? `@${escapeHtml(p.owner)}` : '';
  const why = p.fit_why ? `\n   <i>${escapeHtml(p.fit_why)}</i>` : '';
  return `${n}. ${scoreTag} ${ownerTag} — <a href="${escapeHtml(p.url)}">смотреть</a>\n   ${metricLine}${why}`;
}

function formatCount(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function formatAge(hours) {
  if (!hours) return '?';
  if (hours < 24) return `${Math.round(hours)}ч назад`;
  return `${Math.round(hours / 24)}д назад`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
