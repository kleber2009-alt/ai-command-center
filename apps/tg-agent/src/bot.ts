import { Bot, type CallbackQueryContext, type Context, type Filter } from 'grammy';

import type { AgentChat } from './agent_chat.js';
import type { Classifier } from './classifier.js';
import type { AgentService } from './db/agents.js';
import type { ForumStore } from './db/forum.js';
import { GENERAL_THREAD_ID, type ForumRouter } from './forum.js';
import type { ForumAgent } from './forum_agent.js';
import type { Config } from './config.js';
import type { ChatService } from './db/chats.js';
import type { DraftRow, DraftService } from './db/drafts.js';
import { splitForTelegram } from './digest.js';
import type { LeadService } from './db/leads.js';
import type { MessageStore } from './db/messages.js';
import type { SettingsService } from './db/settings.js';
import { decide } from './decision.js';
import type { HealthMonitor } from './health.js';
import type { Logger } from './logger.js';
import { pointIdFor, type MemoryService } from './memory/service.js';
import {
  DRAFT_CALLBACK_PATTERN,
  renderResolutionFooter,
  type Notifier,
} from './notifier.js';
import type { Responder } from './responder.js';
import type { Action, IncomingMessage } from './types.js';

export interface BotDeps {
  bot: Bot;
  config: Config;
  logger: Logger;
  classifier: Classifier;
  responder: Responder;
  chats: ChatService;
  leads: LeadService;
  messages: MessageStore;
  drafts: DraftService;
  health: HealthMonitor;
  memory: MemoryService;
  settings: SettingsService;
  // Optional: when set, free-form owner DMs (not commands, not draft
  // edits) are answered by the conversational analyst agent.
  agentChat?: AgentChat;
  // Forum mode: present only when FORUM_ENABLED + FORUM_GROUP_ID set.
  agents?: AgentService;
  forum?: ForumStore;
  forumAgent?: ForumAgent;
  forumRouter?: ForumRouter;
}

const ACTIONS_THAT_REPLY: ReadonlySet<Action> = new Set([
  'REPLY',
  'REPLY_SOFT',
  'REPLY_AND_NOTIFY',
]);

export interface CreateBotResult {
  bot: Bot;
  attachNotifier(notifier: Notifier): void;
}

// Regex fast-path: detect payment notifications without a Claude API call.
const PAYMENT_REGEXPS = [
  /поступил платеж/i,
  /поступила оплата/i,
  /payment received/i,
] as const;
function isPaymentText(text: string): boolean {
  return PAYMENT_REGEXPS.some((re) => re.test(text));
}

export function createBot(deps: BotDeps): CreateBotResult {
  const { bot, config, logger, classifier, responder, chats, leads, messages, drafts, health, memory, settings, agentChat, agents, forum, forumAgent, forumRouter } =
    deps;
  let notifier: Notifier | null = null;

  // Register chat immediately when bot is added to a group.
  bot.on('my_chat_member', (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    if ((status === 'member' || status === 'administrator') &&
        (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      const chatId = ctx.chat.id;
      const chatTitle = 'title' in ctx.chat ? ctx.chat.title : undefined;
      chats.touch(chatId, chatTitle);
      logger.info('chat registered via my_chat_member', { chatId, chatTitle, status });
    }
  });

  // Forum topic created → try to auto-bind it to an agent whose name
  // matches the topic title (e.g. a topic «Финансист» binds to the
  // finance agent). The owner can always re-bind via /bindthread.
  bot.on('message:forum_topic_created', (ctx) => {
    if (!config.forumEnabled || !agents) return;
    if (ctx.chat.id !== config.forumGroupId) return;
    const threadId = ctx.message.message_thread_id;
    const name = ctx.message.forum_topic_created.name?.trim();
    if (threadId === undefined || !name) return;
    const match = agents
      .listActive()
      .find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (!match) {
      logger.info('forum: topic created, no agent name match', { threadId, name });
      return;
    }
    agents.bindThread(match.slug, threadId);
    logger.info('forum: topic auto-bound', { threadId, name, slug: match.slug });
  });

  bot.on('message:text', async (ctx) => {
    const chatType = ctx.chat.type;

    // Owner DMs: only path we care about here is a reply to an edit
    // prompt (force_reply'd by the bot). Everything else from the
    // owner in private is ignored — this isn't a chat surface.
    if (chatType === 'private') {
      if (ctx.from?.id === config.ownerTelegramId) {
        await handleOwnerPrivateMessage(ctx);
      }
      return;
    }

    if (chatType !== 'group' && chatType !== 'supergroup') return;

    // Forum control group: messages here are a dialog with the
    // per-topic agent, NOT lead-classification material. Handle and
    // return before the monitoring pipeline so these never become
    // "leads" and never get auto-replied by the responder.
    if (config.forumEnabled && ctx.chat.id === config.forumGroupId) {
      await handleForumMessage(ctx);
      return;
    }

    const text = ctx.message.text;
    const chatId = ctx.chat.id;
    const chatTitle = 'title' in ctx.chat ? ctx.chat.title : undefined;

    // Master kill-switch. When OFF the bot stays connected (long-poll keeps
    // running so we don't accumulate updates) but ignores every group
    // message — no classify, no log, no respond. Distinct from
    // auto_reply_enabled, which only mutes the responder.
    if (!settings.getBotEnabled()) {
      logger.debug('skip: bot globally disabled', { chatId, chatTitle });
      return;
    }

    if (config.allowedChatIds.size > 0 && !config.allowedChatIds.has(chatId)) {
      logger.debug('skip: chat not in allowlist', { chatId, chatTitle });
      return;
    }

    const incoming: IncomingMessage = {
      chatId,
      chatTitle,
      userId: ctx.from?.id,
      username: ctx.from?.username,
      firstName: ctx.from?.first_name,
      lastName: ctx.from?.last_name,
      messageId: ctx.message.message_id,
      text,
    };

    const baseLog = {
      chatId: incoming.chatId,
      userId: incoming.userId,
      username: incoming.username,
      messageId: incoming.messageId,
      text: truncate(incoming.text, 200),
    };

    try {
      const chatState = chats.touch(chatId, chatTitle);
      // Effective kill-switch: chat must be opted in AND global toggle on.
      // Global lives in tg_settings; flipped from the unified dashboard.
      const globalAutoReply = settings.getGlobalAutoReply();
      const autoReplyOn = chatState.autoReply && globalAutoReply;
      let classification;
      let classifierCacheRead = 0;
      if (isPaymentText(text)) {
        // Fast-path: payment detected — skip Claude call, always urgent.
        classification = {
          class: 'PAYMENT_RECEIVED' as const,
          confidence: 0.99,
          reasoning: 'платёжное уведомление от платёжной системы',
        };
      } else {
        try {
          const result = await classifier.classifyWithStats(text);
          classification = result.classification;
          classifierCacheRead = result.cacheReadInputTokens;
          health.recordSuccess('classifier');
        } catch (err) {
          health.recordFailure('classifier', err);
          throw err;
        }
      }
      const decision = decide(classification, config.confidenceThreshold);

      // Skip CRM status update for owner's own messages — owner is not a lead.
      const lead = incoming.userId !== undefined && incoming.userId !== config.ownerTelegramId
        ? leads.touchAndClassify(
            {
              chatId,
              userId: incoming.userId,
              username: incoming.username,
              firstName: incoming.firstName,
              lastName: incoming.lastName,
            },
            classification.class,
          )
        : null;

      logger.info('classified', {
        ...baseLog,
        class: classification.class,
        confidence: Number(classification.confidence.toFixed(3)),
        reasoning: classification.reasoning,
        action: decision.action,
        rationale: decision.rationale,
        leadStatus: lead?.status ?? null,
        leadChanged: lead?.changed ?? false,
        autoReply: chatState.autoReply,
        globalAutoReply,
        classifierCacheRead,
      });

      const wantsAutoReply = ACTIONS_THAT_REPLY.has(decision.action);
      const wantsDraft = decision.action === 'DRAFT_FOR_OWNER';
      const shouldGenerate = (wantsAutoReply && autoReplyOn) || wantsDraft;

      let reply: string | null = null;
      let draftText: string | null = null;

      if (shouldGenerate) {
        const authorDisplay =
          ctx.from?.username ??
          ctx.from?.first_name ??
          (incoming.userId !== undefined ? `user${incoming.userId}` : undefined);

        // RAG: pull top-5 semantically related past messages from
        // the same chat as additional context for the responder.
        // Same-chat filter keeps replies coherent (cross-chat memory
        // is exposed via the /memory DM command instead). Strict
        // timeout + try/catch so embeddings outage never blocks the
        // bot's reply pipeline.
        let memoryContext: string | undefined;
        if (memory.enabled) {
          try {
            const hits = await Promise.race([
              memory.search(text, { limit: 5, chatId, minScore: 0.3 }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('memory: search timeout')), 2500),
              ),
            ]);
            // Drop the just-indexed self-match (same id won't appear
            // yet because indexing is fire-and-forget after this
            // generate, but defensively filter by score and length).
            const useful = hits.filter((h) => h.payload.text.trim().length > 5);
            if (useful.length > 0) {
              memoryContext = useful
                .map((h, i) => {
                  const when = h.payload.created_at?.slice(0, 10) ?? '?';
                  const who = h.payload.username ? '@' + h.payload.username : 'участник';
                  const cls = h.payload.class ? ` [${h.payload.class}]` : '';
                  return `${i + 1}. [${when}] ${who}${cls}: ${h.payload.text.slice(0, 240)}`;
                })
                .join('\n');
              logger.info('memory: rag context attached', {
                ...baseLog,
                snippets: useful.length,
                topScore: useful[0]?.score,
              });
            }
          } catch (err) {
            logger.warn('memory: rag search failed', {
              ...baseLog,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        let generated: string | null = null;
        let responderCacheRead = 0;
        try {
          const result = await responder.generateWithStats({
            messageClass: classification.class,
            text,
            authorDisplay,
            memoryContext,
          });
          generated = result.text;
          responderCacheRead = result.cacheReadInputTokens;
          health.recordSuccess('responder');
        } catch (err) {
          health.recordFailure('responder', err);
          logger.error('responder failed', {
            ...baseLog,
            action: decision.action,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        if (generated && wantsAutoReply && autoReplyOn) {
          reply = generated;
          try {
            await ctx.reply(reply, {
              reply_parameters: { message_id: incoming.messageId },
            });
            health.recordSuccess('telegram');
            logger.info('replied', {
              ...baseLog,
              class: classification.class,
              action: decision.action,
              replyChars: reply.length,
              reply: truncate(reply, 200),
              responderCacheRead,
            });
          } catch (err) {
            health.recordFailure('telegram', err);
            logger.error('telegram reply failed', {
              ...baseLog,
              error: err instanceof Error ? err.message : String(err),
            });
            reply = null;
          }
        } else if (generated && wantsDraft) {
          draftText = generated;
          logger.info('draft generated', {
            ...baseLog,
            class: classification.class,
            draftChars: draftText.length,
            draft: truncate(draftText, 200),
          });
        }
      } else if (wantsAutoReply && !autoReplyOn) {
        logger.info('reply suppressed: auto_reply OFF', {
          ...baseLog,
          reason: !globalAutoReply ? 'global' : 'chat',
        });
      }

      const messageRowId = messages.log({
        chatId,
        userId: incoming.userId,
        telegramMessageId: incoming.messageId,
        text,
        class: classification.class,
        confidence: classification.confidence,
        action: decision.action,
        reasoning: classification.reasoning,
        response: reply,
      });

      // Memory index — fire-and-forget. Slow embedding API or
      // unreachable Qdrant must not block the bot's reply path or
      // notifier. Failures are logged inside the noop wrapper /
      // service itself.
      if (memory.enabled && text.trim().length > 0) {
        memory
          .indexMessage({
            id: pointIdFor('tg-agent', String(messageRowId)),
            text,
            payload: {
              source: 'tg-agent',
              kind: 'message',
              owner_telegram_id: config.ownerTelegramId ?? null,
              chat_id: chatId,
              chat_title: chatTitle ?? null,
              user_id: incoming.userId ?? null,
              username: incoming.username ?? null,
              class: classification.class,
              title: null,
              url: null,
              text,
              created_at: new Date().toISOString(),
            },
          })
          .catch((err) => {
            logger.warn('memory: indexMessage failed', {
              ...baseLog,
              error: err instanceof Error ? err.message : String(err),
            });
          });
      }

      const isPayment = classification.class === 'PAYMENT_RECEIVED';
      if (notifier && (isPayment || (autoReplyOn && lead))) {
        await notifier.notifyOwner({
          chatId,
          chatTitle,
          userId: incoming.userId,
          username: incoming.username,
          firstName: incoming.firstName,
          messageId: incoming.messageId,
          text,
          classification,
          action: decision.action,
          reply,
          draftText,
          leadStatus: lead?.status ?? 'cold',
          leadStatusChanged: lead?.changed ?? false,
        });
      }
    } catch (err) {
      logger.error('handler failed', {
        ...baseLog,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  bot.callbackQuery(DRAFT_CALLBACK_PATTERN, async (ctx) => {
    if (ctx.from?.id !== config.ownerTelegramId) {
      await ctx.answerCallbackQuery({ text: 'Только владелец', show_alert: true });
      return;
    }

    const match = ctx.match as RegExpMatchArray;
    const op = match[1] as 'a' | 'e' | 'x';
    const draftId = Number(match[2]);
    const draft = drafts.findById(draftId);

    if (!draft) {
      await ctx.answerCallbackQuery({ text: 'Черновик не найден', show_alert: true });
      return;
    }

    if (draft.status === 'sent' || draft.status === 'deleted') {
      await ctx.answerCallbackQuery({
        text: `Уже ${draft.status === 'sent' ? 'отправлено' : 'удалено'}`,
      });
      // Make sure the keyboard is gone in case the previous edit failed.
      await removeKeyboard(ctx).catch(() => {});
      return;
    }

    if (op === 'a') {
      await handleApprove(ctx, draft);
    } else if (op === 'e') {
      await handleEditRequest(ctx, draft);
    } else {
      await handleDelete(ctx, draft);
    }
  });

  bot.catch((err) => {
    logger.error('bot runtime error', {
      error: err.error instanceof Error ? err.error.message : String(err.error),
    });
  });

  // Flow 2: owner writes in a forum topic → the agent bound to that
  // thread answers with thread-scoped context, replying in the same
  // topic. Persists both turns to tg_thread_messages as the agent's
  // memory.
  async function handleForumMessage(
    ctx: Filter<Context, 'message:text'>,
  ): Promise<void> {
    if (!forumAgent || !forumRouter || !agents || !forum) return;

    const threadId = ctx.message.message_thread_id ?? GENERAL_THREAD_ID;
    const agent = agents.getByThread(threadId);
    if (!agent || !agent.is_active) return;

    // v1 answers only the owner unless FORUM_RESPOND_TO_TEAM is on.
    if (!config.forumRespondToTeam && ctx.from?.id !== config.ownerTelegramId) return;

    const text = ctx.message.text?.trim();
    // Commands are consumed by their own handlers; skip stray slashes.
    if (!text || text.startsWith('/')) return;

    try {
      await bot.api
        .sendChatAction(
          ctx.chat.id,
          'typing',
          threadId !== GENERAL_THREAD_ID ? { message_thread_id: threadId } : {},
        )
        .catch(() => {});

      const reply = await forumAgent.ask(agent, text);
      health.recordSuccess('responder');

      const sent = await forumRouter.sendToThread(threadId, reply);
      health.recordSuccess('telegram');

      forum.appendThreadMessage({
        agentId: agent.id,
        threadId,
        role: 'user',
        content: text,
        tgMessageId: ctx.message.message_id,
      });
      forum.appendThreadMessage({
        agentId: agent.id,
        threadId,
        role: 'assistant',
        content: reply,
        tgMessageId: sent?.message_id ?? null,
      });

      logger.info('forum: dialog answered', {
        slug: agent.slug,
        threadId,
        questionChars: text.length,
        replyChars: reply.length,
      });
    } catch (err) {
      health.recordFailure('responder', err);
      logger.error('forum: dialog failed', {
        slug: agent.slug,
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleOwnerPrivateMessage(
    ctx: Filter<Context, 'message:text'>,
  ): Promise<void> {
    const replyTo = ctx.message?.reply_to_message?.message_id;

    // A reply to a force_reply'd draft-edit prompt: route to the
    // draft-edit flow, never to the chat agent.
    if (replyTo) {
      const draftForEdit = drafts.findByEditPrompt(replyTo);
      if (draftForEdit) {
        await handleDraftEditReply(ctx, draftForEdit);
        return;
      }
    }

    // Otherwise this is a free-form question for the analyst agent.
    // Commands are consumed by their own handlers before reaching here;
    // skip anything else that still looks like a command (stray slash).
    const text = ctx.message?.text?.trim();
    if (!text || text.startsWith('/')) return;
    if (!agentChat) return;

    const ownerId = ctx.from?.id;
    if (ownerId === undefined) return;

    try {
      await ctx.replyWithChatAction('typing');
      const answer = await agentChat.ask(ownerId, text, () => {
        // Telegram clears the typing indicator after ~5s; refresh it
        // before each Claude / tool round so the owner sees it's alive.
        void ctx.replyWithChatAction('typing').catch(() => {});
      });
      health.recordSuccess('responder');
      for (const chunk of splitForTelegram(answer)) {
        await ctx.reply(chunk, { link_preview_options: { is_disabled: true } });
      }
      logger.info('agent_chat: answered', {
        ownerId,
        question: truncate(text, 200),
        answerChars: answer.length,
      });
    } catch (err) {
      health.recordFailure('responder', err);
      logger.error('agent_chat: failed', {
        ownerId,
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx
        .reply('Не получилось обработать вопрос. Попробуй ещё раз чуть позже.')
        .catch(() => {});
    }
  }

  async function handleDraftEditReply(
    ctx: Filter<Context, 'message:text'>,
    draft: DraftRow,
  ): Promise<void> {
    const newText = ctx.message?.text?.trim();
    if (!newText) {
      await ctx.reply('Пустой текст. Черновик не отправлен.');
      return;
    }

    const ok = drafts.markSent(draft.id, newText);
    if (!ok) {
      await ctx.reply('Уже разрешён ранее.');
      return;
    }

    try {
      await bot.api.sendMessage(draft.chat_id, newText, {
        reply_parameters: { message_id: draft.original_message_id },
      });
      logger.info('draft sent (edited)', { draftId: draft.id, chars: newText.length });
      await ctx.reply('✓ Отправлено.');
      await editDmFooter(draft, 'sent-edited');
    } catch (err) {
      logger.error('draft post-edit send failed', {
        draftId: draft.id,
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.reply('Не получилось отправить в чат. Попробуй ещё раз.');
    }
  }

  async function handleApprove(
    ctx: CallbackQueryContext<Context>,
    draft: DraftRow,
  ): Promise<void> {
    const ok = drafts.markSent(draft.id, draft.draft_text);
    if (!ok) {
      await ctx.answerCallbackQuery({ text: 'Уже разрешён' });
      return;
    }

    try {
      await bot.api.sendMessage(draft.chat_id, draft.draft_text, {
        reply_parameters: { message_id: draft.original_message_id },
      });
      logger.info('draft sent (approved)', {
        draftId: draft.id,
        chars: draft.draft_text.length,
      });
      await ctx.answerCallbackQuery({ text: 'Отправлено' });
      await editDmFooter(draft, 'sent');
    } catch (err) {
      logger.error('draft approve send failed', {
        draftId: draft.id,
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.answerCallbackQuery({
        text: 'Ошибка отправки. Попробуй ещё раз.',
        show_alert: true,
      });
    }
  }

  async function handleEditRequest(
    ctx: CallbackQueryContext<Context>,
    draft: DraftRow,
  ): Promise<void> {
    try {
      const prompt = await bot.api.sendMessage(
        ctx.from.id,
        `Перепиши черновик для draft #${draft.id} и отправь reply'ем сюда. ` +
          'После этого бот отправит твой текст в чат.',
        { reply_markup: { force_reply: true, input_field_placeholder: 'Новый текст ответа…' } },
      );
      const ok = drafts.markEditing(draft.id, prompt.message_id);
      if (!ok) {
        // Race: someone resolved between findById and markEditing.
        await ctx.answerCallbackQuery({ text: 'Уже разрешён' });
        return;
      }
      await ctx.answerCallbackQuery({ text: 'Жду твой вариант' });
      await removeKeyboard(ctx).catch(() => {});
    } catch (err) {
      logger.error('draft edit prompt failed', {
        draftId: draft.id,
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.answerCallbackQuery({ text: 'Не получилось', show_alert: true });
    }
  }

  async function handleDelete(
    ctx: CallbackQueryContext<Context>,
    draft: DraftRow,
  ): Promise<void> {
    const ok = drafts.markDeleted(draft.id);
    if (!ok) {
      await ctx.answerCallbackQuery({ text: 'Уже разрешён' });
      return;
    }
    logger.info('draft deleted', { draftId: draft.id });
    await ctx.answerCallbackQuery({ text: 'Удалено' });
    await editDmFooter(draft, 'deleted');
  }

  async function editDmFooter(
    draft: DraftRow,
    kind: 'sent' | 'sent-edited' | 'deleted',
  ): Promise<void> {
    if (!draft.owner_dm_message_id || config.ownerTelegramId === undefined) return;
    try {
      // Append a footer to the DM and strip the keyboard. We have to
      // re-fetch the original text — Telegram doesn't expose it, so
      // we just edit the reply markup off and send a short follow-up
      // marker via a separate message. Editing the original text
      // would require us to have stored it; not worth the disk.
      await bot.api.editMessageReplyMarkup(
        config.ownerTelegramId,
        draft.owner_dm_message_id,
        { reply_markup: { inline_keyboard: [] } },
      );
      await bot.api.sendMessage(
        config.ownerTelegramId,
        renderResolutionFooter(kind).trim(),
        { reply_parameters: { message_id: draft.owner_dm_message_id } },
      );
    } catch (err) {
      logger.warn('draft DM footer update failed', {
        draftId: draft.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function removeKeyboard(
    ctx: CallbackQueryContext<Context>,
  ): Promise<void> {
    if (!ctx.callbackQuery.message) return;
    await bot.api.editMessageReplyMarkup(
      ctx.callbackQuery.message.chat.id,
      ctx.callbackQuery.message.message_id,
      { reply_markup: { inline_keyboard: [] } },
    );
  }

  return {
    bot,
    attachNotifier(n: Notifier) {
      notifier = n;
    },
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
