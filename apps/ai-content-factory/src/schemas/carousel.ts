// JSON Schema + TypeScript types for a 10-slide Instagram carousel.
//
// Six slide types as defined in the ТЗ: cover / quote / list / stat / code / cta.
// The schema is the contract between the Claude generator (Phase 2) and the
// Puppeteer renderer (Phase 2). Visual code (accent colour, handle, fonts) is
// supplied per-rubric at render time, NOT stored on the slide.

import type { JSONSchemaType } from 'ajv';

export type SlideType = 'cover' | 'quote' | 'list' | 'stat' | 'code' | 'cta';

export interface CoverSlide {
  type: 'cover';
  title: string;
  subtitle?: string;
  label?: string;
}

export interface QuoteSlide {
  type: 'quote';
  text: string;
  author?: string;
}

export interface ListSlide {
  type: 'list';
  title?: string;
  items: string[];
}

export interface StatSlide {
  type: 'stat';
  value: string;
  caption: string;
}

export interface CodeSlide {
  type: 'code';
  code: string;
  language?: string;
  caption?: string;
}

export interface CtaSlide {
  type: 'cta';
  headline: string;
  action: string;
}

export type Slide = CoverSlide | QuoteSlide | ListSlide | StatSlide | CodeSlide | CtaSlide;

export interface Carousel {
  rubric: string;
  topic: string;
  episode: number;
  slides: Slide[];
}

// ajv schema. `discriminator` keeps validation errors readable: ajv reports
// against the single branch matching `type`, not all six.
export const carouselSchema: JSONSchemaType<Carousel> = {
  type: 'object',
  additionalProperties: false,
  required: ['rubric', 'topic', 'episode', 'slides'],
  properties: {
    rubric: { type: 'string', minLength: 1 },
    topic: { type: 'string', minLength: 1 },
    episode: { type: 'integer', minimum: 0 },
    slides: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['type'],
        discriminator: { propertyName: 'type' },
        oneOf: [
          {
            properties: {
              type: { const: 'cover' },
              title: { type: 'string', minLength: 1 },
              subtitle: { type: 'string' },
              label: { type: 'string' },
            },
            required: ['type', 'title'],
            additionalProperties: false,
          },
          {
            properties: {
              type: { const: 'quote' },
              text: { type: 'string', minLength: 1 },
              author: { type: 'string' },
            },
            required: ['type', 'text'],
            additionalProperties: false,
          },
          {
            properties: {
              type: { const: 'list' },
              title: { type: 'string' },
              items: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
            },
            required: ['type', 'items'],
            additionalProperties: false,
          },
          {
            properties: {
              type: { const: 'stat' },
              value: { type: 'string', minLength: 1 },
              caption: { type: 'string', minLength: 1 },
            },
            required: ['type', 'value', 'caption'],
            additionalProperties: false,
          },
          {
            properties: {
              type: { const: 'code' },
              code: { type: 'string', minLength: 1 },
              language: { type: 'string' },
              caption: { type: 'string' },
            },
            required: ['type', 'code'],
            additionalProperties: false,
          },
          {
            properties: {
              type: { const: 'cta' },
              headline: { type: 'string', minLength: 1 },
              action: { type: 'string', minLength: 1 },
            },
            required: ['type', 'headline', 'action'],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  // ajv's JSONSchemaType is stricter than the discriminator/oneOf shape above;
  // the cast keeps the rich runtime schema while preserving the Carousel type.
} as unknown as JSONSchemaType<Carousel>;
