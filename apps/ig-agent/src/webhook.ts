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

function splitName(full: string | null): { first: string | null; last: string | null } {
  if (!full) return { first: null, last: null };
  const trimmed = full.trim();
  if (!trimmed) return { first: null, last: null };
  // SendPulse contact names are noisy ("Илья Палий | Нейросети | ИИ"). Split
  // on whitespace, take first token as first_name, rest as last_name.
  const parts = trimmed.split(/\s+/);
  const first = parts[0] ?? null;
  const last = parts.length > 1 ? parts.slice(1).join(' ') : null;
  return { first, last };
}

function parseEvent(event: unknown): ParsedIncomingMessage | null {
  if (!event || typeof event !== 'object') return null;

  // Drop non-message events early — SendPulse delivers subscribe events
  // with title="subscribed", chat_open with title="chat_opened", etc. We
  // only handle incoming user messages.
  const title = asString(pick(event, 'title'));
  if (title && title !== 'incoming_message') return null;

  // Service-style envelope: { service, info, contact, ... }. The actual
  // message lives at info.message (with channel_data nested deeper for
  // Instagram-specific fields).
  const message = pick(event, 'info', 'message') ?? pick(event, 'message');
  if (!message || typeof message !== 'object') return null;

  const contact = pick(event, 'contact');
  const sendpulseContactId =
    asString(pick(contact, 'id')) ??
    asString(pick(event, 'contact_id'));
  if (!sendpulseContactId) return null;

  // The "channel_data" envelope wraps the IG-native message shape (mirrors
  // Meta's Instagram Messaging API).
  const channel = pick(message, 'channel_data') ?? pick(contact, 'channel_data');
  // For Instagram, channel_data.message carries the actual text:
  //   { title: "Проверить подписку✅", payload: "...", mid, is_echo, ... }
  // `title` is the human-visible label; `payload` is the quick-reply
  // callback id (often emoji-mangled). Title is the right field for both
  // free-form messages and button taps.
  const igMsg = pick(channel, 'message');

  // is_echo=true means the event is the bot's own outbound message
  // bouncing back as a webhook — never reply to those, drop entirely.
  if (pick(igMsg, 'is_echo') === true) return null;

  const text =
    asString(pick(igMsg, 'title')) ??
    asString(pick(igMsg, 'text')) ??
    asString(pick(igMsg, 'payload')) ??
    asString(pick(message, 'text')) ??
    asString(pick(contact, 'last_message'));

  // Attachments — Instagram sends them in channel_data.media. We just
  // capture a hint; full media handling is out of scope for v0.1.
  const mediaUrl =
    asString(pick(channel, 'media', 'url')) ??
    asString(pick(message, 'attachments', '0', 'payload', 'url'));
  const mediaType = mediaUrl
    ? asString(pick(channel, 'media', 'type')) ??
      asString(pick(message, 'attachments', '0', 'type')) ??
      'image'
    : null;

  const sendpulseMessageId =
    asString(pick(igMsg, 'mid')) ??
    asString(pick(channel, 'message_id')) ??
    asString(pick(message, 'id')) ??
    asString(pick(event, 'id'));

  // First-touch enrichment. SendPulse exposes IG-native fields directly
  // on contact (username/name/photo) — not under channel_data like older
  // versions of their schema suggested.
  const igUsername =
    asString(pick(contact, 'username')) ??
    asString(pick(contact, 'channel_data', 'user_name'));
  const igUserId =
    asString(pick(contact, 'channel_data', 'id')) ??
    asString(pick(contact, 'external_id'));
  const profilePicUrl =
    asString(pick(contact, 'photo')) ??
    asString(pick(contact, 'channel_data', 'profile_pic'));

  const namePieces = splitName(asString(pick(contact, 'name')));
  const firstName =
    asString(pick(contact, 'channel_data', 'first_name')) ?? namePieces.first;
  const lastName =
    asString(pick(contact, 'channel_data', 'last_name')) ?? namePieces.last;

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
