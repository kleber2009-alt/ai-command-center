// Reconciles our local `messages` table against SendPulse's chat history.
//
// The webhook only captures events that arrive in real time. Anything sent
// via SendPulse's flow builder (auto-replies, postback responses, attachments
// pushed back to the page) and anything that pre-dates webhook hookup is
// missing from our DB, so the dashboard shows a truncated conversation.
//
// This module pulls `GET /instagram/chats/messages` for a contact and inserts
// every row the local table doesn't already have, deduped by
// `sendpulse_message_id`. The operation is idempotent — call it as often as
// you like; a no-op once everything is in sync.

import type { Logger } from './logger.js';
import type { ContactService } from './db/contacts.js';
import type { MessageStore, Direction, Source } from './db/messages.js';
import type {
  SendPulseClient,
  SendPulseHistoryMessage,
} from './sendpulse/client.js';

export interface BackfillDeps {
  contacts: ContactService;
  messages: MessageStore;
  sendPulse: SendPulseClient;
  logger: Logger;
}

export interface BackfillResult {
  contactId: string;
  fetched: number;
  inserted: number;
  skipped: number;
}

interface AttachmentPayload {
  url?: string;
  src?: string;
}

interface Attachment {
  type?: string;
  payload?: AttachmentPayload;
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function extractMedia(data: Record<string, unknown> | null | undefined): {
  url: string | null;
  type: string | null;
} {
  if (!data) return { url: null, type: null };
  const list = data.attachments;
  if (!Array.isArray(list) || list.length === 0) return { url: null, type: null };
  const first = list[0] as Attachment | undefined;
  const url = pickString(first?.payload?.url) ?? pickString(first?.payload?.src);
  const type = pickString(first?.type) ?? (url ? 'image' : null);
  return { url, type };
}

function synthesizeText(
  msg: SendPulseHistoryMessage,
  mediaType: string | null,
): string | null {
  const data = msg.data ?? null;
  const txt = pickString(data?.text) ?? pickString(data?.title);
  if (txt) return txt;
  if (mediaType) return `[${mediaType}]`;
  if (msg.type === 'postback') return pickString(data?.payload) ?? '[postback]';
  if (msg.type === 'reply_to_message') return pickString(data?.text) ?? '[reply]';
  if (msg.type) return `[${msg.type}]`;
  return null;
}

// We dedup against the webhook path, which stores Meta's `mid` (a long
// base64-ish string starting with "aWdfZ"). The chat-history endpoint
// exposes the same `mid` under `data.message_id`, so prefer that — falling
// back to SendPulse's own row id with a prefix when Meta didn't issue one
// (postbacks, subscribe events, system flow steps).
function deriveSendpulseMessageId(msg: SendPulseHistoryMessage): string {
  const data = msg.data ?? {};
  const metaMid =
    pickString(data.message_id) ??
    pickString(data.mid) ??
    pickString((data as { id?: unknown }).id);
  if (metaMid) return metaMid;
  return `sp-history:${msg.id}`;
}

function deriveSource(msg: SendPulseHistoryMessage): Source {
  if (msg.direction === 1) return 'user';
  // direction === 2 → outgoing. SendPulse marks operator-sent messages with
  // a non-null sent_by. Anything else is a flow / bot autoresponder step.
  return pickString(msg.sent_by) ? 'manual' : 'flow';
}

function deriveDirection(msg: SendPulseHistoryMessage): Direction {
  return msg.direction === 2 ? 'outgoing' : 'incoming';
}

export async function backfillContact(
  deps: BackfillDeps,
  contactRowId: string,
  limit = 200,
): Promise<BackfillResult> {
  const contact = await deps.contacts.byId(contactRowId);
  if (!contact) {
    throw new Error(`contact ${contactRowId} not found`);
  }

  let fetched: SendPulseHistoryMessage[] = [];
  try {
    fetched = await deps.sendPulse.getChatHistory(contact.sendpulse_contact_id, limit);
  } catch (err) {
    deps.logger.error('backfill: getChatHistory failed', {
      contactId: contactRowId,
      sendpulseContactId: contact.sendpulse_contact_id,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  // SendPulse returns newest first; insert chronologically so order in the
  // feed matches reality.
  const ordered = [...fetched].reverse();

  let inserted = 0;
  let skipped = 0;
  for (const item of ordered) {
    const spId = deriveSendpulseMessageId(item);
    if (await deps.messages.existsBySendpulseMessageId(spId)) {
      skipped += 1;
      continue;
    }
    const { url: mediaUrl, type: mediaType } = extractMedia(item.data ?? null);
    const text = synthesizeText(item, mediaType);
    try {
      await deps.messages.insert({
        contactId: contactRowId,
        direction: deriveDirection(item),
        source: deriveSource(item),
        text,
        mediaUrl,
        mediaType,
        sendpulseMessageId: spId,
        rawPayload: item,
        createdAt: item.created_at,
      });
      inserted += 1;
    } catch (err) {
      deps.logger.warn('backfill: insert failed', {
        contactId: contactRowId,
        spId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (inserted > 0) {
    deps.logger.info('backfill: synced contact', {
      contactId: contactRowId,
      sendpulseContactId: contact.sendpulse_contact_id,
      fetched: fetched.length,
      inserted,
      skipped,
    });
  }

  return {
    contactId: contactRowId,
    fetched: fetched.length,
    inserted,
    skipped,
  };
}
