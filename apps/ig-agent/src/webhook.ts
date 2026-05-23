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
  // text is what we store in DB / show in UI. For events that don't carry
  // user-authored text (media-only, story reply, reaction, subscribe), we
  // synthesize a `[tag]` placeholder so the row is visible and searchable.
  text: string | null;
  // True only when `text` is real user-authored content (free-form message
  // or quick-reply button payload). The pipeline uses this to decide
  // whether to invoke the AI responder — we never want to reply to
  // synthesized placeholders like "[image]" or "[subscribed]".
  hasUserText: boolean;
  // Raw event title from SendPulse (incoming_message, subscribed,
  // chat_opened, message_reaction, ...) — kept so the analyst and UI
  // can branch on event type without re-parsing rawEvent.
  eventTitle: string | null;
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

// Status-only event titles SendPulse delivers that don't represent a real
// user-authored message. We persist everything else.
const STATUS_TITLES = new Set([
  'message_delivered',
  'message_read',
  'message_reaction_removed',
]);

function parseEvent(event: unknown): ParsedIncomingMessage | null {
  if (!event || typeof event !== 'object') return null;

  // The shape we see in prod: { title, service, info: { message, ... }, contact }.
  // We accept ALL titles except pure status events — even subscribes,
  // chat_opens, story replies, reactions etc. so the owner sees every
  // signal the user generates.
  const title = asString(pick(event, 'title'));
  if (title && STATUS_TITLES.has(title)) return null;

  // The actual message lives at info.message (with channel_data nested
  // deeper for Instagram-specific fields).
  const message = pick(event, 'info', 'message') ?? pick(event, 'message');

  const contact = pick(event, 'contact');
  const sendpulseContactId =
    asString(pick(contact, 'id')) ??
    asString(pick(event, 'contact_id'));
  if (!sendpulseContactId) return null;

  // The "channel_data" envelope wraps the IG-native message shape (mirrors
  // Meta's Instagram Messaging API).
  const channel =
    pick(message, 'channel_data') ?? pick(contact, 'channel_data') ?? null;
  // For Instagram, channel_data.message carries the actual text:
  //   { title: "Проверить подписку✅", payload: "...", mid, is_echo, ... }
  const igMsg = pick(channel, 'message');

  // is_echo=true means the event is the bot's own outbound message
  // bouncing back as a webhook — never reply to those, drop entirely.
  if (pick(igMsg, 'is_echo') === true) return null;

  // Attachments — Instagram sends them in channel_data.message.attachments
  // or channel_data.media. Capture URL + type for the inbox preview.
  const mediaUrl =
    asString(pick(igMsg, 'attachments', '0', 'payload', 'url')) ??
    asString(pick(channel, 'media', 'url')) ??
    asString(pick(message, 'attachments', '0', 'payload', 'url'));
  const mediaType = mediaUrl
    ? asString(pick(igMsg, 'attachments', '0', 'type')) ??
      asString(pick(channel, 'media', 'type')) ??
      asString(pick(message, 'attachments', '0', 'type')) ??
      'image'
    : null;

  // Pull text from every place SendPulse might stash it. If none has text
  // but we know it's a media/story/reaction event, synthesize a tag so the
  // row is searchable and the inbox preview is meaningful.
  const userText =
    asString(pick(igMsg, 'title')) ??
    asString(pick(igMsg, 'text')) ??
    asString(pick(igMsg, 'payload')) ??
    asString(pick(message, 'text')) ??
    asString(pick(contact, 'last_message'));

  let text: string | null = userText;
  let hasUserText = userText != null;

  if (!text) {
    if (pick(igMsg, 'reaction')) {
      const emoji = asString(pick(igMsg, 'reaction', 'emoji'));
      text = emoji ? `[reaction] ${emoji}` : '[reaction]';
    } else if (pick(igMsg, 'story_reply') || pick(igMsg, 'reply_to', 'story')) {
      text = '[story reply]';
    } else if (mediaUrl) {
      text = `[${mediaType ?? 'media'}]`;
    } else if (title === 'subscribed' || title === 'new_subscriber') {
      text = '[subscribed]';
    } else if (title === 'unsubscribed') {
      text = '[unsubscribed]';
    } else if (title === 'chat_opened') {
      text = '[chat opened]';
    } else if (title && title !== 'incoming_message') {
      text = `[${title}]`;
    }
  }

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
    hasUserText,
    eventTitle: title,
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
