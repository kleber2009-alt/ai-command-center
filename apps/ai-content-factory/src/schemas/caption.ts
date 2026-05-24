// Schema + helpers for a post caption (Instagram), produced by post-caption.md.

import type { JSONSchemaType } from 'ajv';

export interface CaptionContent {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
}

// Exact field contract injected into the caption prompt (the schema is strict).
export const CAPTION_CONTRACT = `Верни СТРОГО валидный JSON ровно с этими полями, без лишних:
{ "hook": "первая строка ≤125 символов", "body": "основной текст", "cta": "призыв с кодовым словом", "hashtags": ["#тег", "..."] }`;

export const captionSchema: JSONSchemaType<CaptionContent> = {
  type: 'object',
  additionalProperties: false,
  required: ['hook', 'body', 'cta', 'hashtags'],
  properties: {
    hook: { type: 'string', minLength: 1 },
    body: { type: 'string', minLength: 1 },
    cta: { type: 'string', minLength: 1 },
    hashtags: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
};

// Assemble the parts into the final caption text for publishing.
export function formatCaption(caption: CaptionContent): string {
  return [caption.hook, caption.body, caption.cta, caption.hashtags.join(' ')]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}
