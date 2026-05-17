import Anthropic from '@anthropic-ai/sdk';

import { CLASSIFIER_SYSTEM_PROMPT } from './prompts.js';
import type { Classification, MessageClass } from './types.js';
import { MESSAGE_CLASSES } from './types.js';

const TOOL_NAME = 'classify';

const classifyTool: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Return the message classification.',
  input_schema: {
    type: 'object',
    properties: {
      class: {
        type: 'string',
        enum: [...MESSAGE_CLASSES],
        description: 'The single best matching class.',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in the chosen class, 0..1.',
      },
      reasoning: {
        type: 'string',
        description: 'One short Russian sentence explaining the choice.',
      },
    },
    required: ['class', 'confidence', 'reasoning'],
  },
};

export interface ClassifierOptions {
  apiKey: string;
  model: string;
}

export interface ClassificationResult {
  classification: Classification;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface Classifier {
  classify(text: string): Promise<Classification>;
  // Same as classify, but exposes prompt cache hit stats. Useful for
  // confirming caching is actually firing once the KB / classifier
  // prefix gets large enough to cross the per-model minimum.
  classifyWithStats(text: string): Promise<ClassificationResult>;
}

export function createClassifier({ apiKey, model }: ClassifierOptions): Classifier {
  const client = new Anthropic({ apiKey });

  async function call(text: string): Promise<ClassificationResult> {
    const response = await client.messages.create({
      model,
      max_tokens: 256,
      // The classifier prompt is fully static — same bytes for every
      // message. Marking it cacheable lets Anthropic serve it from
      // the prompt cache once the prefix crosses the per-model
      // minimum (4096 tokens on Haiku 4.5).
      system: [
        {
          type: 'text',
          text: CLASSIFIER_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [classifyTool],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: `Сообщение из Telegram-чата:\n\n"""\n${text}\n"""`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === TOOL_NAME,
    );

    if (!toolUse) {
      throw new Error('Classifier did not return a tool_use block');
    }

    return {
      classification: parseClassification(toolUse.input),
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    };
  }

  return {
    async classify(text): Promise<Classification> {
      const r = await call(text);
      return r.classification;
    },
    classifyWithStats: call,
  };
}

function parseClassification(raw: unknown): Classification {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Classifier tool input is not an object');
  }
  const obj = raw as Record<string, unknown>;

  const cls = obj.class;
  if (typeof cls !== 'string' || !MESSAGE_CLASSES.includes(cls as MessageClass)) {
    throw new Error(`Classifier returned invalid class: ${String(cls)}`);
  }

  const confidence = obj.confidence;
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    throw new Error(`Classifier returned invalid confidence: ${String(confidence)}`);
  }

  const reasoning = obj.reasoning;
  if (typeof reasoning !== 'string' || reasoning.trim() === '') {
    throw new Error('Classifier returned empty reasoning');
  }

  return {
    class: cls as MessageClass,
    confidence,
    reasoning: reasoning.trim(),
  };
}
