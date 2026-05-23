// Analyst agent (Claude Sonnet 4.6 by default).
//
// Runs after every inbound message — independent from the responder, with
// its own model + prompt. Uses tool_use to extract structured signal:
//
//   - intent / sentiment for the incoming message (annotates messages row)
//   - 0..N recommendations (next_message / action / segment_change / warning)
//   - optional lead_status + qualification suggestion when confidence is high
//
// Fire-and-forget from the pipeline — analyst failures must never block
// the webhook response. Errors are logged, nothing rolls back.

import Anthropic from '@anthropic-ai/sdk';

import type { Logger } from './logger.js';
import type { Contact, ContactService, LeadStatus } from './db/contacts.js';
import type { Conversation } from './db/conversations.js';
import type { Message, MessageStore } from './db/messages.js';
import type {
  RecommendationStore,
  RecommendationType,
  RecommendationPriority,
} from './db/recommendations.js';

export interface AnalystResult {
  intent: string | null;
  sentiment: string | null;
  recommendationsWritten: number;
  leadStatusChanged: LeadStatus | null;
  qualificationChanged: string | null;
  tokensUsed: number;
}

export interface AnalyzeInput {
  contact: Contact;
  conversation: Conversation | null;
  history: Message[];
  // The incoming message that triggered this analysis. Its id is used to
  // backfill messages.intent / messages.sentiment.
  incomingMessageId: string;
  incomingText: string;
}

export interface Analyst {
  analyze(input: AnalyzeInput): Promise<AnalystResult>;
}

export interface AnalystOptions {
  apiKey: string;
  model: string;
  logger: Logger;
  contacts: ContactService;
  messages: MessageStore;
  recommendations: RecommendationStore;
  // How many prior messages to feed the analyst. Smaller than responder's
  // window — analyst needs context, not full transcript.
  historyWindow?: number;
  // Maximum response tokens. Tool output is small JSON, 1500 is comfortable.
  maxTokens?: number;
}

const SYSTEM_PROMPT = `Ты — AI-аналитик продаж в Instagram DM. Твоя задача — каждый раз когда приходит сообщение от пользователя, выдать структурированный сигнал владельцу: что человек хочет, его эмоция, и 1–4 конкретные рекомендации.

Принципы:
- Будь резок и конкретен. «Возражение цены» лучше чем «возможно, не уверен».
- Не пиши общих фраз вроде «продолжай диалог». Каждая рекомендация — действие или предложение текста.
- Меняй lead_status / qualification ТОЛЬКО если уверен. Если сомневаешься — не меняй.
- priority='high' — только если действие реально срочное (горячий лид готов покупать, или эскалация).
- intent — короткий код на английском: question_price, objection_competitor, ready_to_buy, support_request, greeting, off_topic, etc.
- sentiment — positive | neutral | negative.

Контекст контакта, история диалога и последнее сообщение даны ниже. Вызови инструмент record_analysis ровно один раз.`;

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: 'record_analysis',
  description:
    'Запиши структурированный анализ последнего сообщения пользователя: интент, тональность, рекомендации, опциональные обновления статуса/квалификации.',
  input_schema: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        description:
          'Короткий ярлык интента на английском (snake_case): question_price, objection_competitor, ready_to_buy, greeting, support_request, off_topic и т.п.',
      },
      sentiment: {
        type: 'string',
        enum: ['positive', 'neutral', 'negative'],
      },
      recommendations: {
        type: 'array',
        description: '1–4 конкретные рекомендации владельцу. Пустой массив запрещён.',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['next_message', 'action', 'segment_change', 'warning'],
            },
            content: {
              type: 'string',
              description:
                'Текст рекомендации. Для next_message — готовая фраза которую можно вставить в окно ответа.',
            },
            priority: {
              type: 'string',
              enum: ['low', 'normal', 'high'],
            },
          },
          required: ['type', 'content', 'priority'],
        },
      },
      lead_status_suggestion: {
        type: 'string',
        enum: ['new', 'warm', 'hot', 'customer', 'lost'],
        description:
          'ОПЦИОНАЛЬНО. Заполни только если на 100% уверен что нужно изменить статус. Иначе НЕ включай это поле.',
      },
      qualification_suggestion: {
        type: 'string',
        enum: ['A', 'B', 'C', 'D'],
        description:
          'ОПЦИОНАЛЬНО. Заполни только если впервые квалифицируешь или нужно изменить квалификацию.',
      },
    },
    required: ['intent', 'sentiment', 'recommendations'],
  },
};

interface AnalysisToolInput {
  intent: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  recommendations: Array<{
    type: RecommendationType;
    content: string;
    priority: RecommendationPriority;
  }>;
  lead_status_suggestion?: LeadStatus;
  qualification_suggestion?: string;
}

function buildUserMessage(input: AnalyzeInput): string {
  const c = input.contact;
  const name =
    c.first_name || c.last_name
      ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
      : c.ig_username
        ? `@${c.ig_username}`
        : c.sendpulse_contact_id;
  const tags = c.tags?.length ? c.tags.join(', ') : '—';
  const transcript = input.history
    .filter((m) => m.text)
    .map((m) => {
      const who = m.direction === 'incoming' ? 'USER' : m.source === 'manual' ? 'OWNER' : 'AI';
      return `[${who}] ${m.text}`;
    })
    .join('\n');

  return [
    `КОНТАКТ: ${name} · IG @${c.ig_username ?? '—'}`,
    `Статус: ${c.lead_status} · qualification: ${c.qualification ?? '—'} · tags: ${tags}`,
    `Первый контакт: ${c.first_seen_at} · последнее: ${c.last_message_at ?? '—'}`,
    '',
    'ИСТОРИЯ ДИАЛОГА (старые → новые):',
    transcript || '(пусто)',
    '',
    'НОВОЕ СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ:',
    input.incomingText,
  ].join('\n');
}

export function createAnalyst(opts: AnalystOptions): Analyst {
  const anthropic = new Anthropic({ apiKey: opts.apiKey });
  const maxTokens = opts.maxTokens ?? 1500;

  return {
    async analyze(input) {
      const userMsg = buildUserMessage(input);

      const res = await anthropic.messages.create({
        model: opts.model,
        max_tokens: maxTokens,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [
          {
            ...ANALYSIS_TOOL,
            cache_control: { type: 'ephemeral' },
          } as Anthropic.Tool,
        ],
        // Force the model to call record_analysis — we don't accept a
        // plain-text fallback, the whole point is structured output.
        tool_choice: { type: 'tool', name: 'record_analysis' },
        messages: [{ role: 'user', content: userMsg }],
      });

      const toolBlock = res.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'record_analysis',
      );
      if (!toolBlock) {
        throw new Error('analyst did not call record_analysis');
      }
      const parsed = toolBlock.input as AnalysisToolInput;

      // Backfill the incoming message row.
      await opts.messages.updateAnalysis(
        input.incomingMessageId,
        parsed.intent ?? null,
        parsed.sentiment ?? null,
      );

      // Persist recommendations. Trim defensively — Claude occasionally
      // produces empty content under heavy refusal pressure.
      let written = 0;
      for (const r of parsed.recommendations ?? []) {
        const content = (r.content ?? '').trim();
        if (!content) continue;
        await opts.recommendations.insert({
          contactId: input.contact.id,
          conversationId: input.conversation?.id ?? null,
          type: r.type,
          content,
          priority: r.priority,
        });
        written += 1;
      }

      // Optional status / qualification updates. Only apply when the model
      // explicitly suggested AND the value would actually change.
      let leadStatusChanged: LeadStatus | null = null;
      if (
        parsed.lead_status_suggestion &&
        parsed.lead_status_suggestion !== input.contact.lead_status
      ) {
        await opts.contacts.setLeadStatus(input.contact.id, parsed.lead_status_suggestion);
        leadStatusChanged = parsed.lead_status_suggestion;
      }
      let qualificationChanged: string | null = null;
      if (
        parsed.qualification_suggestion &&
        parsed.qualification_suggestion !== input.contact.qualification
      ) {
        await opts.contacts.setQualification(input.contact.id, parsed.qualification_suggestion);
        qualificationChanged = parsed.qualification_suggestion;
      }

      const tokensUsed =
        (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);

      opts.logger.info('analyst done', {
        contactId: input.contact.id,
        intent: parsed.intent,
        sentiment: parsed.sentiment,
        recommendations: written,
        leadStatusChanged,
        qualificationChanged,
        tokens: tokensUsed,
      });

      return {
        intent: parsed.intent ?? null,
        sentiment: parsed.sentiment ?? null,
        recommendationsWritten: written,
        leadStatusChanged,
        qualificationChanged,
        tokensUsed,
      };
    },
  };
}
