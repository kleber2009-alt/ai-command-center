// Input contract for knowledge-base ingestion: one record per piece of content
// (your own posts, competitor references, hooks, offers, reviews) with optional
// Instagram metrics used to compute the performance score.

import type { ContentMetrics } from '../lib/performance.js';

export type ContentType =
  | 'reels'
  | 'carousel'
  | 'post'
  | 'story'
  | 'dm'
  | 'reference'
  | 'hook'
  | 'offer'
  | 'review';

export const CONTENT_TYPES: ContentType[] = [
  'reels',
  'carousel',
  'post',
  'story',
  'dm',
  'reference',
  'hook',
  'offer',
  'review',
];

export interface RawContentItem {
  type: ContentType;
  /** Origin, e.g. "own" | "competitor". */
  source?: string;
  topic?: string;
  hook?: string;
  /** Main text / script — the field that gets embedded. Required. */
  content: string;
  cta?: string;
  format?: string;
  visual_style?: string;
  metrics?: ContentMetrics;
}

const metricFields = ['views', 'likes', 'comments', 'saves', 'shares', 'follows', 'leads'];

// Plain JSON Schema (ajv-compiled at the call site). Optional fields are simply
// omitted from `required`; unknown keys are rejected.
export const contentItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'content'],
  properties: {
    type: { type: 'string', enum: CONTENT_TYPES },
    source: { type: 'string' },
    topic: { type: 'string' },
    hook: { type: 'string' },
    content: { type: 'string', minLength: 1 },
    cta: { type: 'string' },
    format: { type: 'string' },
    visual_style: { type: 'string' },
    metrics: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(metricFields.map((f) => [f, { type: 'number', minimum: 0 }])),
    },
  },
} as const;

// Concatenate the human-meaningful fields into the text we embed.
export function embeddingText(item: RawContentItem): string {
  return [item.topic, item.hook, item.content, item.cta]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join('\n')
    .slice(0, 8000);
}
