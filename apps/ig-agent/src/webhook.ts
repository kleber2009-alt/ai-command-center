// Parses a SendPulse webhook payload into our normalized shape.
//
// SendPulse's webhook delivers an array of events, each event carrying a
// `contact` object and (for inbound messages) `info.message.channel_data`
// that mirrors the Telegram Bot API shape (per the OpenAPI note on the
// Message schema). We extract what we need and keep the rest in raw_payload.

export interface ParsedIncomingMessage {
  sendpulseContactId: string;
  igUsername: string | null;
  igUserId: string | null;
  firstName: string | null;
  lastName: string | null;
  profilePicUrl: string | null;
  text: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  sendpulseMessageId: string | null;
  rawEvent: unknown;
}

export interface ParseResult {
  // SendPulse delivers events in batches; we may also get non-message
  // events (subscribe, unsubscribe, tag_added) which we currently ignore.
  messages: ParsedIncomingMessage[];
  ignored: number;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function pick(obj: unknown, ...keys: string[]): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  let cur: unknown = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function parseEvent(event: unknown): ParsedIncomingMessage | null {
  if (!event || typeof event !== 'object') return null;

  // Service-style envelope: { service, info, contact, ... }. Inbound user
  // messages arrive as service='instagram' with info.message present.
  const message = pick(event, 'info', 'message') ?? pick(event, 'message');
  // Drop non-message events (subscribe, tag_added, bot_command, etc.).
  if (!message || typeof message !== 'object') return null;

  const contact = pick(event, 'contact');
  const sendpulseContactId =
    asString(pick(contact, 'id')) ??
    asString(pick(event, 'contact_id'));
  if (!sendpulseContactId) return null;

  // Prefer the explicit channel_data from the inner message (Telegram-API
  // shape per SendPulse OpenAPI), fall back to contact.channel_data for
  // first-touch enrichment.
  const channel =
    pick(message, 'channel_data') ??
    pick(contact, 'channel_data');

  const text =
    asString(pick(message, 'text')) ??
    asString(pick(channel, 'text')) ??
    asString(pick(message, 'message', 'text'));

  // Attachments are nested differently per channel; first hit wins.
  const mediaUrl =
    asString(pick(message, 'attachments', '0', 'payload', 'url')) ??
    asString(pick(message, 'attachment', 'payload', 'url')) ??
    asString(pick(channel, 'photo', '0', 'file_id'));
  const mediaType = mediaUrl ? asString(pick(message, 'attachments', '0', 'type')) ?? 'image' : null;

  const sendpulseMessageId =
    asString(pick(message, 'id')) ??
    asString(pick(message, 'message_id')) ??
    asString(pick(event, 'id'));

  // First-touch enrichment — usually populated only on the initial
  // webhook for a new subscriber. Subsequent events may strip these.
  const igUsername =
    asString(pick(contact, 'channel_data', 'user_name')) ??
    asString(pick(contact, 'username'));
  const igUserId = asString(pick(contact, 'channel_data', 'id'));
  const firstName = asString(pick(contact, 'channel_data', 'first_name'));
  const lastName = asString(pick(contact, 'channel_data', 'last_name'));
  const profilePicUrl = asString(pick(contact, 'channel_data', 'profile_pic'));

  return {
    sendpulseContactId,
    igUsername,
    igUserId,
    firstName,
    lastName,
    profilePicUrl,
    text,
    mediaUrl,
    mediaType,
    sendpulseMessageId,
    rawEvent: event,
  };
}

export function parseWebhookBody(body: unknown): ParseResult {
  // SendPulse usually wraps events in an array, but tolerate a single object too.
  const events: unknown[] = Array.isArray(body) ? body : [body];
  const messages: ParsedIncomingMessage[] = [];
  let ignored = 0;
  for (const ev of events) {
    const parsed = parseEvent(ev);
    if (parsed) messages.push(parsed);
    else ignored += 1;
  }
  return { messages, ignored };
}
