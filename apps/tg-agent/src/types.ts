export const MESSAGE_CLASSES = [
  'GENERAL_CHAT',
  'QUESTION',
  'PRODUCT_INTEREST',
  'PRICE_REQUEST',
  'OBJECTION',
  'BUYING_INTENT',
  'NEGATIVE',
  'SUPPORT_REQUEST',
  'OWNER_REQUEST',
  'SPAM',
] as const;

export type MessageClass = (typeof MESSAGE_CLASSES)[number];

export type Action =
  | 'IGNORE'
  | 'REPLY'
  | 'REPLY_SOFT'
  | 'REPLY_AND_NOTIFY'
  | 'NOTIFY_ONLY'
  | 'DRAFT_FOR_OWNER';

export interface Classification {
  class: MessageClass;
  confidence: number;
  reasoning: string;
}

export interface Decision {
  classification: Classification;
  action: Action;
  // Why this action was chosen (e.g. "low confidence → draft").
  rationale: string;
}

export interface IncomingMessage {
  chatId: number;
  chatTitle: string | undefined;
  userId: number | undefined;
  username: string | undefined;
  messageId: number;
  text: string;
}
