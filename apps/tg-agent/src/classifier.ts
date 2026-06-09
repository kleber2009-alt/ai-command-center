import OpenAI from 'openai';

import { createLlmClient, cacheReadTokens, type ReasoningEffort } from './llm.js';
import { CLASSIFIER_SYSTEM_PROMPT } from './prompts.js';
import type { PromptConfig } from './prompt-config.js';
import type { Classification, MessageClass } from './types.js';
import { MESSAGE_CLASSES } from './types.js';

const TOOL_NAME = 'classify';

// Reasoning tokens count against the completion budget on gpt-5.x.
// 1024 leaves plenty of room for low-effort reasoning + the small
// JSON tool payload, so the forced tool call never gets truncated.
const MAX_CLASSIFY_TOKENS = 1024;

const classifyTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: TOOL_NAME,
    description: 'Return the message classification.',
    parameters: {
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
  },
};

export interface ClassifierOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  promptConfig?: PromptConfig;
}

export interface ClassificationResult {
  classification: Classification;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface Classifier {
  classify(text: string): Promise<Classification>;
  // Same as classify, but exposes prompt cache hit stats. codex.sale
  // applies automatic prefix caching on the (large, static) system
  // prompt; cached input tokens show up under cacheReadInputTokens.
  classifyWithStats(text: string): Promise<ClassificationResult>;
}

export function createClassifier({
  apiKey,
  baseUrl,
  model,
  reasoningEffort = 'low',
  promptConfig,
}: ClassifierOptions): Classifier {
  const client = createLlmClient({ apiKey, baseUrl });

  async function call(text: string): Promise<ClassificationResult> {
    const systemText = (() => {
      const extra = promptConfig?.getClassifierExtra();
      return extra ? `${CLASSIFIER_SYSTEM_PROMPT}\n\n${extra}` : CLASSIFIER_SYSTEM_PROMPT;
    })();

    const response = await client.chat.completions.create({
      model,
      max_completion_tokens: MAX_CLASSIFY_TOKENS,
      reasoning_effort: reasoningEffort,
      messages: [
        // The classifier prompt is fully static — same bytes for
        // every message — so codex.sale serves it from its prompt
        // cache once the prefix is large enough.
        { role: 'system', content: systemText },
        {
          role: 'user',
          content: `Сообщение из Telegram-чата:\n\n"""\n${text}\n"""`,
        },
      ],
      tools: [classifyTool],
      tool_choice: { type: 'function', function: { name: TOOL_NAME } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.find(
      (tc) => tc.type === 'function' && tc.function.name === TOOL_NAME,
    );

    if (!toolCall || toolCall.type !== 'function') {
      throw new Error('Classifier did not return a tool call');
    }

    return {
      classification: parseClassification(safeJsonParse(toolCall.function.arguments)),
      cacheReadInputTokens: cacheReadTokens(response.usage),
      cacheCreationInputTokens: 0,
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

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Classifier returned non-JSON tool arguments: ${raw.slice(0, 200)}`);
  }
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
