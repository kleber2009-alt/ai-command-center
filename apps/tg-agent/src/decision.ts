import type { Action, Classification, Decision, MessageClass } from './types.js';

const BASE_ACTIONS: Record<MessageClass, Action> = {
  GENERAL_CHAT: 'IGNORE',
  QUESTION: 'REPLY',
  PRODUCT_INTEREST: 'REPLY',
  PRICE_REQUEST: 'REPLY_AND_NOTIFY',
  OBJECTION: 'REPLY_SOFT',
  BUYING_INTENT: 'REPLY_AND_NOTIFY',
  NEGATIVE: 'IGNORE',
  SUPPORT_REQUEST: 'REPLY',
  OWNER_REQUEST: 'NOTIFY_ONLY',
  SPAM: 'IGNORE',
};

// Classes where silence is the safest default — never gate them behind
// "draft for owner". A low-confidence GENERAL_CHAT just means we stay quiet.
const SAFE_TO_IGNORE: ReadonlySet<MessageClass> = new Set([
  'GENERAL_CHAT',
  'NEGATIVE',
  'SPAM',
]);

export function decide(
  classification: Classification,
  confidenceThreshold: number,
): Decision {
  const baseAction = BASE_ACTIONS[classification.class];

  if (
    classification.confidence < confidenceThreshold &&
    !SAFE_TO_IGNORE.has(classification.class) &&
    baseAction !== 'IGNORE'
  ) {
    return {
      classification,
      action: 'DRAFT_FOR_OWNER',
      rationale: `confidence ${classification.confidence.toFixed(2)} < ${confidenceThreshold} → draft for owner`,
    };
  }

  return {
    classification,
    action: baseAction,
    rationale: `class ${classification.class} → ${baseAction}`,
  };
}
