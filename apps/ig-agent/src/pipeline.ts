// Orchestrator: webhook event → persist contact + incoming msg →
// (when AI is handling) classify-ish + responder + SendPulse send →
// persist outgoing msg → owner notification when relevant.
//
// v0.1 skips the dedicated classifier/decision engine — every inbound
// goes through the responder unless the contact is ignored or the
// conversation has been manually taken over by a human. Classifier +
// analyst slot in here when ported from tg-agent.

import type { ContactService } from './db/contacts.js';
import type { ConversationService } from './db/conversations.js';
import type { MessageStore } from './db/messages.js';
import type { ParsedIncomingMessage } from './webhook.js';
import type { Responder } from './responder.js';
import type { SendPulseClient } from './sendpulse/client.js';
import type { Notifier } from './notifier.js';
import type { Logger } from './logger.js';

export interface PipelineDeps {
  contacts: ContactService;
  conversations: ConversationService;
  messages: MessageStore;
  responder: Responder;
  sendPulse: SendPulseClient;
  notifier: Notifier;
  logger: Logger;
  ignoredContactIds: Set<string>;
  // How many prior messages to feed the LLM as context. Higher = better
  // continuity, more tokens. 20 is a reasonable starting point.
  historyWindow?: number;
}

export interface Pipeline {
  handle(event: ParsedIncomingMessage): Promise<void>;
}

export function createPipeline(deps: PipelineDeps): Pipeline {
  const historyWindow = deps.historyWindow ?? 20;

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
      await deps.messages.insert({
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

      // 3. Decide whether the AI should respond.
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
      if (!event.text) {
        // Media-only messages without text aren't worth a Claude round-trip
        // in v0.1. Alert the owner so they can step in.
        await deps.notifier.send(
          `📷 ${contact.ig_username ?? contact.sendpulse_contact_id} прислал(а) медиа без текста — открой кабинет.`,
          { silent: true },
        );
        return;
      }

      // 4. Generate reply with conversation history.
      const history = await deps.messages.recentForContact(contact.id, historyWindow);
      let result;
      try {
        result = await deps.responder.reply({
          userText: event.text,
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

      await deps.messages.insert({
        contactId: contact.id,
        direction: 'outgoing',
        source: 'ai_agent',
        text: result.text,
        aiModel: result.model,
        aiPromptVersion: result.promptVersion,
        aiTokensUsed: result.tokensUsed,
        sendpulseMessageId,
      });

      deps.logger.info('replied', {
        contactId: contact.id,
        igUsername: contact.ig_username,
        tokens: result.tokensUsed,
        promptVersion: result.promptVersion,
      });
    },
  };
}
