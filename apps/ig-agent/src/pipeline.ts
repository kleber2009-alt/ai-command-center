// Orchestrator: webhook event → persist contact + incoming msg →
// (when AI is handling) responder + SendPulse send → persist outgoing msg
// → analyst (fire-and-forget) → owner notification when relevant.
//
// v0.1 skips the dedicated classifier/decision engine — every inbound
// goes through the responder unless the contact is ignored or the
// conversation has been manually taken over by a human. The analyst
// runs in the background and writes ai_recommendations rows.

import type { ContactService } from './db/contacts.js';
import type { ConversationService } from './db/conversations.js';
import type { MessageStore } from './db/messages.js';
import { indexIgMessage } from './memory/index.js';
import type { SettingsService } from './db/settings.js';
import type { ParsedIncomingMessage } from './webhook.js';
import type { Responder } from './responder.js';
import type { Analyst } from './analyst.js';
import type { SendPulseClient } from './sendpulse/client.js';
import type { Notifier } from './notifier.js';
import type { Logger } from './logger.js';

export interface PipelineDeps {
  contacts: ContactService;
  conversations: ConversationService;
  messages: MessageStore;
  settings: SettingsService;
  responder: Responder;
  analyst: Analyst;
  sendPulse: SendPulseClient;
  notifier: Notifier;
  logger: Logger;
  ignoredContactIds: Set<string>;
  // Owner's Telegram numeric id — copied onto every Qdrant payload
  // so cross-app search can scope to "Ilia's brain".
  ownerTelegramId?: number;
  // How many prior messages to feed the LLM as context. Higher = better
  // continuity, more tokens. 20 is a reasonable starting point.
  historyWindow?: number;
  // Smaller window for the analyst — it needs context but not a full
  // transcript replay. 10 is a sensible default.
  analystHistoryWindow?: number;
}

export interface Pipeline {
  handle(event: ParsedIncomingMessage): Promise<void>;
}

export function createPipeline(deps: PipelineDeps): Pipeline {
  const historyWindow = deps.historyWindow ?? 20;
  const analystHistoryWindow = deps.analystHistoryWindow ?? 10;

  // Fire-and-forget analyst runner. Wraps the analyst call so callers
  // never have to remember the .catch() — analyst failures must never
  // surface to the webhook caller.
  function scheduleAnalysis(args: {
    contactId: string;
    incomingMessageId: string;
    incomingText: string;
  }): void {
    void (async () => {
      try {
        // Re-read the contact / conversation right before analyzing so
        // we use the latest state (e.g. lead_status that another path
        // may have just updated).
        const contact = await deps.contacts.byId(args.contactId);
        if (!contact) return;
        const conversations = await deps.conversations.byContact(args.contactId);
        const active = conversations.find((c) => c.status === 'active') ?? null;
        const history = await deps.messages.recentForContact(
          args.contactId,
          analystHistoryWindow,
        );
        await deps.analyst.analyze({
          contact,
          conversation: active,
          history,
          incomingMessageId: args.incomingMessageId,
          incomingText: args.incomingText,
        });
      } catch (err) {
        deps.logger.warn('analyst failed', {
          err: err instanceof Error ? err.message : String(err),
          contactId: args.contactId,
        });
      }
    })();
  }

  return {
    async handle(event) {
      // 1. Upsert contact (+enrich on first touch via getContact).
      let contact = await deps.contacts.upsertFromWebhook({
        sendpulseContactId: event.sendpulseContactId,
        igUsername: event.igUsername,
        igUserId: event.igUserId,
        firstName: event.firstName,
        lastName: event.lastName,
        profilePicUrl: event.profilePicUrl,
      });

      // If this is the first touch and the webhook didn't carry IG
      // metadata, ask SendPulse for the full contact card. One-time
      // enrichment — subsequent webhooks reuse what we stored.
      if (!contact.ig_username) {
        const remote = await deps.sendPulse.getContact(event.sendpulseContactId);
        if (remote) {
          contact = await deps.contacts.upsertFromWebhook({
            sendpulseContactId: event.sendpulseContactId,
            igUsername: remote.channel_data?.user_name ?? null,
            igUserId:
              remote.channel_data?.id !== undefined
                ? String(remote.channel_data.id)
                : null,
            firstName: remote.channel_data?.first_name ?? null,
            lastName: remote.channel_data?.last_name ?? null,
            profilePicUrl: remote.channel_data?.profile_pic ?? null,
          });
        }
      }

      const conversation = await deps.conversations.ensureActive(contact.id);

      // 2. Persist the incoming message + bump contact's last-seen.
      const incoming = await deps.messages.insert({
        contactId: contact.id,
        direction: 'incoming',
        source: 'user',
        text: event.text,
        mediaUrl: event.mediaUrl,
        mediaType: event.mediaType,
        sendpulseMessageId: event.sendpulseMessageId,
        rawPayload: event.rawEvent,
      });
      await deps.contacts.touchLastMessage(contact.id);

      // Fire-and-forget into the shared aicex-memory collection so
      // the tg-agent admin / /memory / responder RAG can see this
      // Instagram DM alongside Telegram chats and transcripts.
      if (event.text && event.text.trim().length > 1) {
        indexIgMessage(
          {
            naturalKey: incoming.id,
            direction: 'incoming',
            text: event.text,
            ownerTelegramId: deps.ownerTelegramId ?? null,
            contactId: contact.id,
            igUsername: contact.ig_username ?? null,
            contactName: [contact.first_name, contact.last_name]
              .filter(Boolean)
              .join(' ')
              .trim() || null,
            intent: null,
            createdAt: incoming.created_at,
          },
          deps.logger,
        ).catch(() => {});
      }

      // 2b. Kick off the analyst on every persisted event — even ignored
      // contacts, human-handled conversations, media-only DMs, story
      // replies, reactions, and subscribe pings. The analyst tags intent
      // / sentiment and writes ai_recommendations regardless of whether
      // the AI will reply, so the owner gets full coverage in /pulse.
      scheduleAnalysis({
        contactId: contact.id,
        incomingMessageId: incoming.id,
        incomingText: event.text ?? `[${event.mediaType ?? 'event'}]`,
      });

      // 3. Decide whether the AI should respond.
      // Global master switch — when off, agent silently analyzes only.
      // Read fresh from DB each time so a flip in the admin UI takes
      // effect on the very next webhook without restarting anything.
      const autoReplyOn = await deps.settings.getBool('auto_reply_enabled', true);
      if (!autoReplyOn) {
        deps.logger.info('auto-reply globally disabled, skip AI reply (analyst still runs)', {
          contactId: contact.id,
        });
        return;
      }
      if (deps.ignoredContactIds.has(event.sendpulseContactId)) {
        deps.logger.info('contact in ignore list, skip AI reply', {
          sendpulseContactId: event.sendpulseContactId,
        });
        return;
      }
      if (!conversation.ai_handled) {
        deps.logger.info('conversation taken over by human, skip AI reply', {
          conversationId: conversation.id,
        });
        return;
      }
      if (!event.hasUserText) {
        // Media, stickers, reactions, story replies, subscribe pings —
        // anything without user-authored text. We've persisted the row +
        // queued the analyst; the AI doesn't try to respond. Ping the
        // owner so they can step in if it's worth a manual reply.
        const who = contact.ig_username ?? contact.sendpulse_contact_id;
        const tag = event.text ?? `[${event.eventTitle ?? 'event'}]`;
        await deps.notifier.send(
          `📷 ${who} → ${tag} — открой кабинет.`,
          { silent: true },
        );
        return;
      }

      // 4. Generate reply with conversation history.
      const history = await deps.messages.recentForContact(contact.id, historyWindow);
      let result;
      try {
        result = await deps.responder.reply({
          userText: event.text!,
          // Exclude the just-inserted incoming message — the responder
          // gets it via userText, not history, to avoid duplication.
          history: history.slice(0, -1),
        });
      } catch (err) {
        deps.logger.error('responder failed', {
          err: err instanceof Error ? err.message : String(err),
          contactId: contact.id,
        });
        await deps.notifier.send(
          `⚠️ ig-agent: ошибка генерации ответа для ${contact.ig_username ?? contact.sendpulse_contact_id}. Открой кабинет.`,
        );
        return;
      }

      // 5. Send via SendPulse and persist outgoing.
      let sendpulseMessageId: string | null = null;
      try {
        const sendResult = await deps.sendPulse.sendText(
          event.sendpulseContactId,
          result.text,
        );
        sendpulseMessageId = sendResult.sendpulseMessageId;
      } catch (err) {
        deps.logger.error('sendpulse send failed', {
          err: err instanceof Error ? err.message : String(err),
          contactId: contact.id,
        });
        await deps.notifier.send(
          `⚠️ ig-agent: ответ сгенерирован, но SendPulse send упал. Текст:\n\n${result.text}`,
        );
        return;
      }

      const outgoing = await deps.messages.insert({
        contactId: contact.id,
        direction: 'outgoing',
        source: 'ai_agent',
        text: result.text,
        aiModel: result.model,
        aiPromptVersion: result.promptVersion,
        aiTokensUsed: result.tokensUsed,
        sendpulseMessageId,
      });

      // Mirror outgoing AI replies into the brain too — useful for
      // self-RAG and lets the owner see "what the bot said back".
      indexIgMessage(
        {
          naturalKey: outgoing.id,
          direction: 'outgoing',
          text: result.text,
          ownerTelegramId: deps.ownerTelegramId ?? null,
          contactId: contact.id,
          igUsername: contact.ig_username ?? null,
          contactName: [contact.first_name, contact.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() || null,
          intent: null,
          createdAt: outgoing.created_at,
        },
        deps.logger,
      ).catch(() => {});

      deps.logger.info('replied', {
        contactId: contact.id,
        igUsername: contact.ig_username,
        tokens: result.tokensUsed,
        promptVersion: result.promptVersion,
      });
    },
  };
}
