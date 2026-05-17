import Anthropic from '@anthropic-ai/sdk';

import type { Classification, MessageClass } from './types.js';
import { MESSAGE_CLASSES } from './types.js';

const SYSTEM_PROMPT = `Ты — классификатор сообщений Telegram-чата для AI-ассистента Ильи Палии.
Илья продаёт обучение нейросетям, консультации и связанные продукты.
Твоя задача — определить тип входящего сообщения, чтобы агент решил, стоит ли отвечать.

Классы:
- GENERAL_CHAT — обычный диалог между участниками: приветствия, шутки, обсуждения не по теме продукта.
- QUESTION — пользователь задал содержательный вопрос (по AI, нейросетям, бизнесу, обучению, инструментам).
- PRODUCT_INTEREST — интерес к курсам / обучению / продуктам / консультациям Ильи без явного запроса цены.
- PRICE_REQUEST — пользователь спрашивает цену, условия, ссылку, как купить, где оплатить.
- OBJECTION — сомнение или возражение по продукту ("дорого", "не сработает", "у меня не получится").
- BUYING_INTENT — явно готов купить / оставить заявку / получить доступ ("хочу купить", "куда оплатить", "беру").
- NEGATIVE — токсичное, агрессивное, провокационное сообщение в адрес автора или продукта.
- SUPPORT_REQUEST — просьба помочь с уже купленным продуктом / доступом / техникой.
- OWNER_REQUEST — прямое обращение к Илье лично (упоминание по имени, @, просьба ответить лично).
- SPAM — реклама, флуд, нерелевантные ссылки, бессмыслица.

Правила:
- Один класс на сообщение. Выбирай тот, что лучше всего описывает намерение.
- confidence — твоя уверенность от 0 до 1. Если сомневаешься между двумя классами или сообщение очень короткое и неоднозначное — ставь ниже 0.7.
- reasoning — одна короткая фраза на русском, почему именно этот класс.
- Не отвечай ничего, кроме вызова инструмента classify.`;

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

export interface Classifier {
  classify(text: string): Promise<Classification>;
}

export function createClassifier({ apiKey, model }: ClassifierOptions): Classifier {
  const client = new Anthropic({ apiKey });

  return {
    async classify(text: string): Promise<Classification> {
      const response = await client.messages.create({
        model,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
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

      return parseClassification(toolUse.input);
    },
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
