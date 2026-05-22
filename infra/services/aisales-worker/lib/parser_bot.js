// ═══════════════════════════════════════════════════════════════════
// lib/parser_bot.js — отдельный bot-frontend для viral_discover
// ───────────────────────────────────────────────────────────────────
// Bot: @your_parser_bot (TG_PARSER_BOT_TOKEN)
// Webhook: /worker/parser-webhook (см. lib/webhook.js)
//
// State machine после /start:
//
//   new                 — приветствие, кнопка «Начать»
//   ask_niche           — ждёт текст с описанием ниши
//   ask_competitors     — ждёт список @аккаунтов
//   ask_hashtags        — ждёт список #хэштегов (или '-' пропустить)
//   confirm             — показывает сводку, кнопки [Запустить] / [Изменить ...]
//   ready               — главное меню, команды
//
// Состояние хранится в viral_discover_configs.onboarding_stage. Любой
// шаг можно перезайти через команды /niche /add /list /pause /resume.
// ═══════════════════════════════════════════════════════════════════

import { query, queryOne } from './db.js';
import { sendText } from './tg.js';

const BOT = 'parser';

// ═══ Entry points ════════════════════════════════════════════════════

export async function handleStart(msg) {
  const chatId = msg.chat?.id;
  if (!chatId) return;

  const { user, config } = await ensureUserAndConfig(chatId, msg.from);

  // Уже настроен → показать главное меню.
  if (config.onboarding_stage === 'ready' && config.niche_description) {
    return await showMainMenu(chatId, user, config);
  }

  // Свежий юзер → start wizard.
  await query(
    `UPDATE viral_discover_configs SET onboarding_stage = 'new' WHERE user_id = $1`,
    [user.id],
  );

  const firstName = escapeHtml(msg.from?.first_name || 'друг');
  await sendText(chatId,
    `Привет, ${firstName}.\n\n` +
    `Я <b>Залётный</b> — парсер ниши. Каждое утро в 08:00 МСК приношу в этот чат ` +
    `<b>10 ссылок на залетевшие посты</b> конкурентов: 5 рилсов и 5 каруселей, ` +
    `с оценкой <i>«зайдёт ли это в моём блоге»</i> 1–10 от Claude.\n\n` +
    `Настройка — 3 шага по минуте. Готов?`,
    {
      bot: BOT,
      reply_markup: {
        inline_keyboard: [[
          { text: '▶ Поехали', callback_data: 'wiz:begin' },
          { text: '🎬 Как это выглядит', callback_data: 'wiz:demo' },
        ]],
      },
    },
  );
}

export async function handleText(msg) {
  const chatId = msg.chat?.id;
  const text = String(msg.text || '').trim();
  if (!chatId || !text) return;

  const { user, config } = await ensureUserAndConfig(chatId, msg.from);

  // Перехватываем команды (они обрабатываются ниже).
  if (text.startsWith('/')) return await handleCommand(msg, user, config);

  // Иначе — это очередной шаг wizard'а (или произвольный текст в ready).
  switch (config.onboarding_stage) {
    case 'ask_niche':       return await stepNiche(chatId, user, text);
    case 'ask_competitors': return await stepCompetitors(chatId, user, text);
    case 'ask_hashtags':    return await stepHashtags(chatId, user, text);
    case 'confirm':
      await sendText(chatId, 'Жму кнопку — а не пишу текстом. Если хочешь поправить — выбери что именно.', { bot: BOT });
      return;
    case 'ready':
      // Произвольное сообщение в ready-режиме — мягко напоминаем что я бот-команда.
      await sendText(chatId,
        'Я пока не разговариваю свободно — работаю по командам.\n\n' +
        'Открой меню кнопкой ниже или нажми /help.',
        {
          bot: BOT,
          reply_markup: buildMainMenuKb(config),
        });
      return;
    default:
      // new — пользователь написал что-то, не нажав «Поехали». Дернём wizard.
      await advanceStage(user.id, 'ask_niche');
      await askNiche(chatId);
      return;
  }
}

export async function handleCallback(cq) {
  const chatId = cq.message?.chat?.id;
  const data = String(cq.data || '');
  if (!chatId) return await ack(cq);

  // ── Candidate suggestions feedback ──────────────────────────
  // Кнопки [✅ Добавить @x] / [❌] под секцией «🆕 Возможные конкуренты».
  // cand:add:<uuid> → status=accepted, добавляем handle в competitors[]
  // cand:skip:<uuid> → status=rejected
  if (data.startsWith('cand:')) {
    const [, action, candId] = data.split(':');
    if (!candId || (action !== 'add' && action !== 'skip')) return await ack(cq);

    const cand = await queryOne(
      `SELECT user_id, handle, status FROM viral_discover_candidates WHERE id = $1`,
      [candId],
    );
    if (!cand) return await ack(cq, 'Уже не актуально');
    if (cand.status !== 'pending') return await ack(cq, 'Уже выбрано');

    if (action === 'add') {
      await query(
        `UPDATE viral_discover_candidates
            SET status = 'accepted', decided_at = NOW()
          WHERE id = $1`,
        [candId],
      );
      await query(
        `UPDATE viral_discover_configs
            SET competitors = (
                SELECT ARRAY(SELECT DISTINCT unnest(competitors || ARRAY[$1::text]))
            )
          WHERE user_id = $2`,
        [cand.handle, cand.user_id],
      );
      await ack(cq, `✓ ${cand.handle} добавлен`);
      await editFooter(cq.message, `\n— ✅ ${cand.handle} добавлен в источники`);
    } else {
      await query(
        `UPDATE viral_discover_candidates
            SET status = 'rejected', decided_at = NOW()
          WHERE id = $1`,
        [candId],
      );
      await ack(cq, '👍 Учту');
      await editFooter(cq.message, `\n— ❌ ${cand.handle} отклонён`);
    }
    return;
  }

  // ── Deliverable feedback ────────────────────────────────────
  // Кнопки [✅ Использовал] / [❌ Не пригодилось] под каждой выдачей.
  // Та же семантика что в Office bot (lib/webhook.js handleCallback).
  if (data.startsWith('d:')) {
    const [, action, deliverableId] = data.split(':');
    if (!deliverableId) return await ack(cq);

    const usedKind = action === 'used' ? 'used' : action === 'nope' ? 'not_useful' : null;
    if (!usedKind) return await ack(cq);

    const updated = await query(
      `UPDATE deliverables SET used_at = NOW(), used_kind = $1
        WHERE id = $2 AND used_at IS NULL
        RETURNING id`,
      [usedKind, deliverableId],
    );
    if (updated.length === 0) {
      return await ack(cq, 'Уже отмечено');
    }
    await ack(cq, usedKind === 'used' ? '✓ Записала' : '👍 Учту');

    // Стрипаем кнопки и добавляем подпись в конец.
    const msg = cq.message;
    const footer = usedKind === 'used'
      ? '\n\n— использовано ✅'
      : '\n\n— отмечено как непригодное';
    if (msg?.chat?.id && msg?.message_id) {
      try {
        const token = process.env.TG_PARSER_BOT_TOKEN;
        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            text: (msg.text || '') + footer,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] },
            disable_web_page_preview: true,
          }),
        });
      } catch (_) { /* swallow */ }
    }
    return;
  }

  const { user, config } = await ensureUserAndConfig(chatId, cq.from);

  // ── Wizard callbacks ──
  if (data === 'wiz:begin') {
    await ack(cq);
    await advanceStage(user.id, 'ask_niche');
    await askNiche(chatId);
    return;
  }
  if (data === 'wiz:demo') {
    await ack(cq, 'Пример сообщения');
    await sendDemo(chatId);
    return;
  }
  if (data === 'wiz:skip_hashtags') {
    await ack(cq);
    await stepHashtags(chatId, user, '-');
    return;
  }
  if (data === 'wiz:confirm_run') {
    await ack(cq, 'Запускаю парсер');
    await finalizeAndRun(chatId, user);
    return;
  }
  if (data === 'wiz:edit_niche') {
    await ack(cq);
    await advanceStage(user.id, 'ask_niche');
    await sendText(chatId, '<b>Шаг 1/3 · Ниша</b>\n\nОпиши свою нишу одной строкой.\n\nПример: <code>коуч по продажам B2B для собственников малого бизнеса</code>', { bot: BOT });
    return;
  }
  if (data === 'wiz:edit_competitors') {
    await ack(cq);
    await advanceStage(user.id, 'ask_competitors');
    await sendText(chatId, '<b>Шаг 2/3 · Конкуренты</b>\n\nНазови 3–5 аккаунтов через пробел или с новой строки.\n\nПример: <code>@expert_one @coach_marina @guru_alex</code>', { bot: BOT });
    return;
  }
  if (data === 'wiz:edit_hashtags') {
    await ack(cq);
    await advanceStage(user.id, 'ask_hashtags');
    await askHashtags(chatId);
    return;
  }

  // ── Main menu actions ──
  if (data === 'menu:run') {
    await ack(cq, 'Поставила в работу');
    await runDiscoverJob(chatId, user.id);
    return;
  }
  if (data === 'menu:list') {
    await ack(cq);
    await showTargets(chatId, user, config);
    return;
  }
  if (data === 'menu:niche') {
    await ack(cq);
    await advanceStage(user.id, 'ask_niche');
    await sendText(chatId, `<b>Текущая ниша:</b>\n${escapeHtml(config.niche_description || '—')}\n\nПришли новый текст одной строкой, чтобы заменить.`, { bot: BOT });
    return;
  }
  if (data === 'menu:add') {
    await ack(cq);
    await sendText(chatId,
      '<b>Добавить источник</b>\n\n' +
      'Пришли в одно сообщение список через пробел или с новой строки. Можно мешать:\n' +
      '<code>@new_account #new_hashtag @one_more</code>\n\n' +
      'Или одной командой:\n' +
      '<code>/add @account</code>\n<code>/add #hashtag</code>',
      { bot: BOT });
    return;
  }
  if (data === 'menu:pause') {
    await ack(cq, 'Поставила на паузу');
    await query(`UPDATE viral_discover_configs SET enabled = FALSE WHERE user_id = $1`, [user.id]);
    await sendText(chatId, '⏸ <b>Парсер на паузе.</b>\n\nЕжедневная выдача не придёт. Возобновить — /resume или кнопка «Возобновить» в /help.', { bot: BOT });
    return;
  }
  if (data === 'menu:resume') {
    await ack(cq, 'Возобновила');
    await query(`UPDATE viral_discover_configs SET enabled = TRUE WHERE user_id = $1`, [user.id]);
    await sendText(chatId, '▶ <b>Готова к работе.</b> Следующая выдача — завтра в 08:00 МСК. Хочешь прямо сейчас — /discover.', { bot: BOT });
    return;
  }
  if (data === 'menu:help') {
    await ack(cq);
    await sendHelp(chatId);
    return;
  }
  if (data === 'menu:office') {
    await ack(cq);
    await sendText(chatId,
      '<b>AI Growth Office</b> — целый офис из AI-агентов:\n\n' +
      '• Аня — контент-стратег с утренними планёрками\n' +
      '• Игорь — продажник, отвечает на DM\n' +
      '• /clone &lt;url&gt; — клонирование любого рилса в твой голос\n' +
      '• Голос — клон через ElevenLabs\n\n' +
      '«Залётный» уже включён в Pro-тариф (1 990 ₽/мес).\n\n' +
      '<a href="https://ai-office.46-62-215-11.nip.io/">Подробнее</a>',
      { bot: BOT });
    return;
  }

  await ack(cq);
}

// ═══ Commands ════════════════════════════════════════════════════════

async function handleCommand(msg, user, config) {
  const chatId = msg.chat.id;
  const raw = String(msg.text || '').trim();
  const [head, ...rest] = raw.split(/\s+/);
  const arg = rest.join(' ').trim();
  const cmd = head.replace(/@\S+$/, '').toLowerCase();

  switch (cmd) {
    case '/start':    return await handleStart(msg);
    case '/help':     return await sendHelp(chatId);
    case '/menu':     return await showMainMenu(chatId, user, config);
    case '/discover': return await runDiscoverJob(chatId, user.id);
    case '/list':
    case '/targets':  return await showTargets(chatId, user, config);
    case '/niche':
      if (!arg) {
        await advanceStage(user.id, 'ask_niche');
        await sendText(chatId, '<b>Изменить нишу</b>\n\nПришли описание одной строкой следующим сообщением.', { bot: BOT });
        return;
      }
      return await stepNiche(chatId, user, arg);
    case '/add':
      if (!arg) {
        await sendText(chatId, 'Использование:\n<code>/add @account</code>\n<code>/add #hashtag</code>\nМожно сразу несколько через пробел.', { bot: BOT });
        return;
      }
      return await addTargets(chatId, user.id, arg);
    case '/remove':
      if (!arg) {
        await sendText(chatId, 'Использование: <code>/remove @account</code> или <code>/remove #hashtag</code>', { bot: BOT });
        return;
      }
      return await removeTarget(chatId, user.id, arg);
    case '/pause':
      await query(`UPDATE viral_discover_configs SET enabled = FALSE WHERE user_id = $1`, [user.id]);
      await sendText(chatId, '⏸ <b>Парсер на паузе.</b> Возобновить — /resume.', { bot: BOT });
      return;
    case '/resume':
      await query(`UPDATE viral_discover_configs SET enabled = TRUE WHERE user_id = $1`, [user.id]);
      await sendText(chatId, '▶ <b>Готова к работе.</b> Следующая выдача — завтра 08:00 МСК.', { bot: BOT });
      return;
    case '/thresholds':
      return await handleThresholds(chatId, user.id, arg);
    case '/reset':
      await query(
        `UPDATE viral_discover_configs
            SET onboarding_stage = 'new', niche_description = NULL,
                competitors = '{}', hashtags = '{}', enabled = TRUE
          WHERE user_id = $1`,
        [user.id],
      );
      await sendText(chatId, '🔄 Сброшено. Начинаем заново — /start.', { bot: BOT });
      return;
    default:
      await sendText(chatId, `Не понимаю команду <code>${escapeHtml(cmd)}</code>. Доступные — /help.`, { bot: BOT });
      return;
  }
}

// ═══ Thresholds (мин. метрики «жирного» контента) ════════════════════

async function handleThresholds(chatId, userId, arg) {
  const cfg = await queryOne(
    `SELECT min_plays, min_likes, min_comments FROM viral_discover_configs WHERE user_id = $1`,
    [userId],
  );
  if (!arg) {
    await sendText(chatId,
      '<b>🎯 Пороги виральности</b>\n\n' +
      `Сейчас: ≥<b>${formatCount(cfg?.min_plays || 0)}</b> просмотров · ≥<b>${formatCount(cfg?.min_likes || 0)}</b> лайков · ≥<b>${formatCount(cfg?.min_comments || 0)}</b> комментариев.\n\n` +
      'Поменять — одной командой:\n' +
      '<code>/thresholds 100000 1000 500</code>\n\n' +
      '<i>Лайки = proxy для репостов — Instagram перестал отдавать share count публично.</i>\n' +
      '<i>Чтобы выключить фильтр — <code>/thresholds 0 0 0</code>.</i>',
      { bot: BOT });
    return;
  }
  const parts = arg.split(/\s+/).map((s) => parseInt(s.replace(/[\s,_]/g, ''), 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    await sendText(chatId, 'Жду три числа: <code>/thresholds &lt;просмотры&gt; &lt;лайки&gt; &lt;комментарии&gt;</code>\n\nПример: <code>/thresholds 100000 1000 500</code>', { bot: BOT });
    return;
  }
  const [mp, ml, mc] = parts;
  await query(
    `UPDATE viral_discover_configs SET min_plays = $1, min_likes = $2, min_comments = $3 WHERE user_id = $4`,
    [mp, ml, mc, userId],
  );
  await sendText(chatId,
    `✓ Пороги обновлены:\n• ≥${formatCount(mp)} просмотров\n• ≥${formatCount(ml)} лайков\n• ≥${formatCount(mc)} комментариев\n\nПрименятся в следующем /discover.`,
    { bot: BOT });
}

function formatCount(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

// ═══ Wizard steps ════════════════════════════════════════════════════

async function askNiche(chatId) {
  await sendText(chatId,
    '<b>Шаг 1/3 · Ниша</b>\n\n' +
    'Опиши свою нишу <b>одной строкой</b> — кто ты и для кого работаешь. ' +
    'От этого зависят оценки 1–10, которые Claude будет ставить каждому посту.\n\n' +
    'Примеры:\n' +
    '• <i>коуч по продажам B2B для собственников малого бизнеса</i>\n' +
    '• <i>нутрициолог для женщин 30–45 в декрете</i>\n' +
    '• <i>таргетолог для онлайн-школ</i>',
    { bot: BOT });
}

async function stepNiche(chatId, user, text) {
  const niche = text.slice(0, 600);
  if (niche.length < 8) {
    await sendText(chatId, 'Слишком коротко. Дай хотя бы 8 символов — это контекст для оценок, без него Claude поставит наугад.', { bot: BOT });
    return;
  }
  await query(
    `UPDATE viral_discover_configs
        SET niche_description = $1,
            onboarding_stage = 'ask_competitors'
      WHERE user_id = $2`,
    [niche, user.id],
  );
  await sendText(chatId,
    `✓ Ниша записана.\n\n` +
    `<b>Шаг 2/3 · Конкуренты</b>\n\n` +
    `Назови <b>3–5 аккаунтов</b> в нише через пробел или с новой строки. ` +
    `Это могут быть конкуренты, эксперты или ролевые модели — главное чтобы они активно постили.\n\n` +
    `Пример:\n<code>@expert_one @coach_marina @guru_alex</code>`,
    { bot: BOT });
}

async function stepCompetitors(chatId, user, text) {
  const accounts = parseAccountList(text);
  if (accounts.length === 0) {
    await sendText(chatId,
      'Не нашла ни одного аккаунта. Жду слова в формате <code>@handle</code> или просто handle. Можно несколько через пробел.', { bot: BOT });
    return;
  }
  if (accounts.length > 25) {
    await sendText(chatId, `Многовато (${accounts.length}). 5–8 — оптимум. Возьму первые 25.`, { bot: BOT });
  }
  const list = accounts.slice(0, 25);
  await query(
    `UPDATE viral_discover_configs
        SET competitors = $1::text[],
            onboarding_stage = 'ask_hashtags'
      WHERE user_id = $2`,
    [list, user.id],
  );
  await sendText(chatId,
    `✓ Добавила ${list.length} аккаунт${plural(list.length, '', 'а', 'ов')}: ${list.map(escapeHtml).join(', ')}\n\n` +
    `<b>Шаг 3/3 · Хэштеги</b>\n\n` +
    `Теперь 1–3 хэштега в нише — это шире чем аккаунты, ловит чужие посты по тренду. ` +
    `Можно пропустить.\n\n` +
    `Пример:\n<code>#salescoaching #b2bsales #продажи</code>`,
    {
      bot: BOT,
      reply_markup: {
        inline_keyboard: [[
          { text: '⏩ Пропустить', callback_data: 'wiz:skip_hashtags' },
        ]],
      },
    });
}

async function askHashtags(chatId) {
  await sendText(chatId,
    '<b>Шаг 3/3 · Хэштеги</b>\n\n' +
    'Пришли 1–3 хэштега через пробел. Или нажми «Пропустить».',
    {
      bot: BOT,
      reply_markup: {
        inline_keyboard: [[
          { text: '⏩ Пропустить', callback_data: 'wiz:skip_hashtags' },
        ]],
      },
    });
}

async function stepHashtags(chatId, user, text) {
  const tags = text === '-' || text === '' ? [] : parseHashtagList(text);
  if (tags.length > 10) {
    await sendText(chatId, `Многовато (${tags.length}). Возьму первые 10.`, { bot: BOT });
  }
  const list = tags.slice(0, 10);
  await query(
    `UPDATE viral_discover_configs
        SET hashtags = $1::text[],
            onboarding_stage = 'confirm'
      WHERE user_id = $2`,
    [list, user.id],
  );
  const cfg = await queryOne(`SELECT * FROM viral_discover_configs WHERE user_id = $1`, [user.id]);
  await showConfirm(chatId, cfg);
}

async function showConfirm(chatId, cfg) {
  const lines = [];
  lines.push('<b>Готово к запуску. Проверим:</b>');
  lines.push('');
  lines.push(`<b>Ниша:</b>\n${escapeHtml(cfg.niche_description || '—')}`);
  lines.push('');
  lines.push(`<b>Аккаунты (${(cfg.competitors || []).length}):</b>`);
  if ((cfg.competitors || []).length === 0) lines.push('  — пусто');
  else cfg.competitors.forEach((c) => lines.push(`  • ${escapeHtml(c)}`));
  lines.push('');
  lines.push(`<b>Хэштеги (${(cfg.hashtags || []).length}):</b>`);
  if ((cfg.hashtags || []).length === 0) lines.push('  — пусто (это нормально)');
  else cfg.hashtags.forEach((h) => lines.push(`  • #${escapeHtml(h)}`));
  lines.push('');
  lines.push('Запустить парсер прямо сейчас? Дальше — каждое утро в 08:00 МСК.');

  await sendText(chatId, lines.join('\n'), {
    bot: BOT,
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Запустить сейчас', callback_data: 'wiz:confirm_run' }],
        [
          { text: '✏️ Ниша', callback_data: 'wiz:edit_niche' },
          { text: '✏️ Аккаунты', callback_data: 'wiz:edit_competitors' },
          { text: '✏️ Хэштеги', callback_data: 'wiz:edit_hashtags' },
        ],
      ],
    },
  });
}

async function finalizeAndRun(chatId, user) {
  await query(
    `UPDATE viral_discover_configs SET onboarding_stage = 'ready', enabled = TRUE WHERE user_id = $1`,
    [user.id],
  );
  await sendText(chatId,
    '✓ <b>Запускаю.</b>\n\n' +
    'Скрейплю конкурентов и хэштеги, классифицирую посты, прогоняю топ-10 через Claude. ' +
    'Результат прилетит в этот чат через <b>1–3 минуты</b>.\n\n' +
    'Дальше — каждое утро в <b>08:00 МСК</b> сама.',
    { bot: BOT });
  await runDiscoverJob(chatId, user.id);
  const cfg = await queryOne(`SELECT * FROM viral_discover_configs WHERE user_id = $1`, [user.id]);
  setTimeout(() => showMainMenu(chatId, user, cfg).catch(() => {}), 2000);
}

// ═══ Main menu (ready state) ═════════════════════════════════════════

async function showMainMenu(chatId, user, config) {
  const enabled = config.enabled !== false;
  const lines = [];
  lines.push(`<b>Залётный — главное меню</b>`);
  lines.push(`Статус: ${enabled ? '✅ активен' : '⏸ на паузе'}`);
  lines.push('');
  lines.push(`<b>Ниша:</b> ${escapeHtml((config.niche_description || '').slice(0, 120))}`);
  lines.push(`<b>Источники:</b> ${(config.competitors || []).length} акк · ${(config.hashtags || []).length} тегов`);
  lines.push('');
  lines.push('Команды есть в /help. Через меню — быстрее:');
  await sendText(chatId, lines.join('\n'), {
    bot: BOT,
    reply_markup: buildMainMenuKb(config),
  });
}

function buildMainMenuKb(config) {
  const enabled = config?.enabled !== false;
  return {
    inline_keyboard: [
      [{ text: '🔎 Получить выдачу сейчас', callback_data: 'menu:run' }],
      [
        { text: '📋 Мои источники', callback_data: 'menu:list' },
        { text: '➕ Добавить', callback_data: 'menu:add' },
      ],
      [
        { text: '🎯 Изменить нишу', callback_data: 'menu:niche' },
        enabled
          ? { text: '⏸ Пауза', callback_data: 'menu:pause' }
          : { text: '▶ Возобновить', callback_data: 'menu:resume' },
      ],
      [
        { text: '❓ Помощь', callback_data: 'menu:help' },
        { text: '🏢 AI Office', callback_data: 'menu:office' },
      ],
    ],
  };
}

async function sendHelp(chatId) {
  await sendText(chatId,
    '<b>Залётный — команды</b>\n\n' +
    '/menu — главное меню\n' +
    '/discover — получить выдачу сейчас\n' +
    '/list — мои источники\n' +
    '/add @acc или #tag — добавить источник\n' +
    '/remove @acc или #tag — убрать\n' +
    '/niche [текст] — изменить нишу\n' +
    '/thresholds — пороги виральности (просмотры/лайки/комменты)\n' +
    '/pause /resume — пауза / возобновление\n' +
    '/reset — сбросить и пройти настройку заново\n\n' +
    'Cron-выдача: каждое утро <b>08:00 МСК</b>.\n' +
    'Парсер — часть <a href="https://ai-office.46-62-215-11.nip.io/">AI Growth Office</a>.',
    { bot: BOT });
}

async function sendDemo(chatId) {
  await sendText(chatId,
    '<b>Пример утренней выдачи:</b>\n\n' +
    '<i>Доброе утро. Посмотрела 87 постов в нише — вот что залетает:</i>\n\n' +
    '🎬 <b>Рилсы — топ 5</b>\n' +
    '1. <b>9/10</b> @expert_one — 245K просмотров · 14ч назад\n' +
    '   <i>Конфронтационный хук бьёт прямо в нашу ICP.</i>\n' +
    '2. <b>8/10</b> @coach_marina — 112K · 22ч назад\n' +
    '   <i>Чек-лист в формате «3 признака» — твой формат.</i>\n' +
    '3. <b>6/10</b> @guru_alex — 89K · 8ч назад\n' +
    '   <i>Сильный хук, но аудитория молодёжи — не твоя.</i>\n\n' +
    '🖼 <b>Карусели — топ 5</b>\n' +
    '1. <b>9/10</b> @expert_three — 3.2K❤ · 18ч назад\n' +
    '   <i>Статичные слайды с цифрами вместо advice.</i>\n\n' +
    '<i>Любой пост можно потом скопировать в свой голос через /clone &lt;url&gt; в AI Office Pro.</i>',
    { bot: BOT });
}

// ═══ Targets edit ════════════════════════════════════════════════════

async function showTargets(chatId, user, config) {
  // Перечитаем — могло поменяться.
  const cfg = await queryOne(`SELECT * FROM viral_discover_configs WHERE user_id = $1`, [user.id]) || config;
  const lines = [];
  lines.push('<b>Мои источники</b>');
  lines.push(`Окно: последние <b>${cfg.posted_within_days}</b> дней`);
  lines.push('');
  lines.push(`<b>Аккаунты (${(cfg.competitors || []).length}):</b>`);
  if ((cfg.competitors || []).length === 0) lines.push('  — пусто (добавь через /add @handle)');
  else cfg.competitors.forEach((c) => lines.push(`  • ${escapeHtml(c)}`));
  lines.push('');
  lines.push(`<b>Хэштеги (${(cfg.hashtags || []).length}):</b>`);
  if ((cfg.hashtags || []).length === 0) lines.push('  — пусто (добавь через /add #tag)');
  else cfg.hashtags.forEach((h) => lines.push(`  • #${escapeHtml(h)}`));

  await sendText(chatId, lines.join('\n'), { bot: BOT });
}

async function addTargets(chatId, userId, arg) {
  const accounts = parseAccountList(arg);
  const hashtags = parseHashtagList(arg);
  if (accounts.length === 0 && hashtags.length === 0) {
    await sendText(chatId, 'Не нашла ни <code>@handle</code>, ни <code>#hashtag</code> в твоём сообщении.', { bot: BOT });
    return;
  }
  if (accounts.length > 0) {
    await query(
      `UPDATE viral_discover_configs
          SET competitors = (
              SELECT ARRAY(SELECT DISTINCT unnest(competitors || $1::text[]))
          )
        WHERE user_id = $2`,
      [accounts, userId],
    );
  }
  if (hashtags.length > 0) {
    await query(
      `UPDATE viral_discover_configs
          SET hashtags = (
              SELECT ARRAY(SELECT DISTINCT unnest(hashtags || $1::text[]))
          )
        WHERE user_id = $2`,
      [hashtags, userId],
    );
  }
  const summary = [
    accounts.length > 0 ? `${accounts.length} акк (${accounts.map(escapeHtml).join(', ')})` : null,
    hashtags.length > 0 ? `${hashtags.length} тег${plural(hashtags.length, '', 'а', 'ов')} (${hashtags.map((h) => '#' + escapeHtml(h)).join(', ')})` : null,
  ].filter(Boolean).join(' + ');
  await sendText(chatId, `✓ Добавила: ${summary}\n\nПосмотреть всё — /list.`, { bot: BOT });
}

async function removeTarget(chatId, userId, arg) {
  const token = arg.trim().split(/\s+/)[0];
  if (token.startsWith('#')) {
    const tag = token.slice(1).toLowerCase().replace(/[^A-Za-zА-Яа-я0-9_]/g, '');
    await query(`UPDATE viral_discover_configs SET hashtags = array_remove(hashtags, $1::text) WHERE user_id = $2`, [tag, userId]);
    await sendText(chatId, `✓ Удалила <code>#${escapeHtml(tag)}</code>`, { bot: BOT });
    return;
  }
  const handle = '@' + token.replace(/^@/, '');
  await query(`UPDATE viral_discover_configs SET competitors = array_remove(competitors, $1::text) WHERE user_id = $2`, [handle, userId]);
  await sendText(chatId, `✓ Удалила <code>${escapeHtml(handle)}</code>`, { bot: BOT });
}

// ═══ Discover job dispatch ═══════════════════════════════════════════

async function runDiscoverJob(chatId, userId) {
  // Проверим что юзер настроен; иначе мягко пнём в onboarding.
  const cfg = await queryOne(`SELECT * FROM viral_discover_configs WHERE user_id = $1`, [userId]);
  if (!cfg || cfg.onboarding_stage !== 'ready' || !cfg.niche_description) {
    await sendText(chatId, 'Сначала закончим настройку — /start.', { bot: BOT });
    return;
  }
  if (!cfg.competitors?.length && !cfg.hashtags?.length) {
    await sendText(chatId, 'Список источников пуст. Добавь — /add @handle или /add #tag.', { bot: BOT });
    return;
  }
  await query(
    `INSERT INTO scheduled_jobs (kind, user_id, scheduled_at, status, payload)
     VALUES ('viral_discover', $1, NOW(), 'pending', $2::jsonb)`,
    [userId, JSON.stringify({ user_id: userId, tg_chat_id: chatId, force: true })],
  );
  await sendText(chatId,
    '🔎 <b>Поставила в работу.</b>\n\n' +
    `Скрейплю ${(cfg.competitors || []).length} акк + ${(cfg.hashtags || []).length} тег${plural((cfg.hashtags || []).length, '', 'а', 'ов')}. ` +
    'Топ-10 с оценками — через 1–3 минуты.',
    { bot: BOT });
}

// ═══ User / config bootstrap ═════════════════════════════════════════
// При первом /start создаём platform_user (single-tenant парсера — каждый
// чат это сам по себе юзер, без связи с e-mail из office-лендинга).
async function ensureUserAndConfig(chatId, from) {
  let user = await queryOne(`SELECT id, name FROM platform_users WHERE tg_chat_id = $1`, [chatId]);
  if (!user) {
    const name = from?.first_name || from?.username || 'tg-' + chatId;
    // platform_users.email — NOT NULL UNIQUE. У парсер-юзеров нет реального e-mail.
    // Генерим стабильный псевдо-email на основе chat_id, чтобы повторный /start
    // из того же чата не валился на UNIQUE.
    const pseudoEmail = `parser-${chatId}@tg.local`;
    user = await queryOne(
      `INSERT INTO platform_users (tg_chat_id, name, email)
       VALUES ($1, $2, $3)
       RETURNING id, name`,
      [chatId, name, pseudoEmail],
    );
  }
  let config = await queryOne(`SELECT * FROM viral_discover_configs WHERE user_id = $1`, [user.id]);
  if (!config) {
    config = await queryOne(
      `INSERT INTO viral_discover_configs
         (user_id, tg_chat_id, onboarding_stage, bot, enabled)
       VALUES ($1, $2, 'new', 'parser', TRUE)
       RETURNING *`,
      [user.id, chatId],
    );
  } else if (config.tg_chat_id !== chatId) {
    // Юзер пишет с другого чата — обновим chat_id для доставки.
    await query(`UPDATE viral_discover_configs SET tg_chat_id = $1 WHERE user_id = $2`, [chatId, user.id]);
    config.tg_chat_id = chatId;
  }
  return { user, config };
}

async function advanceStage(userId, stage) {
  await query(`UPDATE viral_discover_configs SET onboarding_stage = $1 WHERE user_id = $2`, [stage, userId]);
}

// ═══ Parsing helpers ═════════════════════════════════════════════════

function parseAccountList(text) {
  const out = [];
  const re = /@?([A-Za-z0-9._]{2,30})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = m[1];
    if (!v) continue;
    if (v.startsWith('#')) continue;
    if (/^\d+$/.test(v)) continue;
    const tagged = '@' + v;
    if (!out.includes(tagged)) out.push(tagged);
  }
  return out;
}

function parseHashtagList(text) {
  const out = [];
  const re = /#([A-Za-zА-Яа-я0-9_]{2,40})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = m[1].toLowerCase();
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function plural(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// ═══ TG ack callback ═════════════════════════════════════════════════

// Меняет текст исходного сообщения, дописывая footer-строку и убирая кнопки.
// Идемпотентно: если message уже без кнопок — TG вернёт ошибку, мы её глотаем.
async function editFooter(msg, footer) {
  if (!msg?.chat?.id || !msg?.message_id) return;
  const token = process.env.TG_PARSER_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        text: (msg.text || '') + footer,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] },
        disable_web_page_preview: true,
      }),
    });
  } catch (_) { /* swallow */ }
}

async function ack(cq, text = null) {
  const token = process.env.TG_PARSER_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cq.id, text: text || undefined }),
    });
  } catch (_) { /* swallow */ }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
