// Forum mode core: the default agent roster, report routing into
// topics (Flow 1), and an optional Claude-based direction classifier
// used when a source chat has no explicit route.

import Anthropic from '@anthropic-ai/sdk';
import type { Bot } from 'grammy';
import type { Message } from 'grammy/types';

import type { AgentRow, AgentSeed, AgentService } from './db/agents.js';
import type { ForumStore } from './db/forum.js';
import { splitForTelegram } from './digest.js';
import type { Logger } from './logger.js';

// Telegram's General topic isn't addressable by a message_thread_id in
// sendMessage — you post without the param. We model it internally as
// thread_id = 1 so it has a stable key in tg_agents / tg_thread_messages.
export const GENERAL_THREAD_ID = 1;

// Role template from the spec (§5). Each agent answers only within its
// lane and treats the reports routed to it as primary context.
function buildSystemPrompt(name: string, role: string, scope: string): string {
  return [
    `Ты — ${name}, AI-${role} в команде Ильи.`,
    `Ты отвечаешь ТОЛЬКО по своему направлению (${scope}).`,
    'Тебе на вход приходят отчёты и данные из чатов по этому направлению —',
    'используй их как основной контекст при ответах. Не выдумывай факты,',
    'которых нет в отчётах и истории ветки.',
    'Если вопрос вне твоей зоны — коротко перенаправь в нужную ветку.',
    'Тон: по делу, без воды. Пиши по-русски.',
  ].join('\n');
}

// Default roster seeded on first run. thread_id stays unbound (NULL)
// except General (=1); the owner binds the rest via /bindthread or
// auto-binding on forum_topic_created.
export function defaultAgentSeeds(model: string): AgentSeed[] {
  return [
    {
      slug: 'content',
      name: 'Контент',
      model,
      system_prompt: buildSystemPrompt(
        'Контент',
        'контент-маркетолог',
        'Reels-сценарии, заголовки, контент-план, разбор контент-метрик из отчётов',
      ),
    },
    {
      slug: 'product',
      name: 'Продуктолог',
      model,
      system_prompt: buildSystemPrompt(
        'Продуктолог',
        'продакт-менеджер',
        'архитектура продукта, юнит-экономика, приоритизация фич, гипотезы',
      ),
    },
    {
      slug: 'finance',
      name: 'Финансист',
      model,
      system_prompt: buildSystemPrompt(
        'Финансист',
        'финансовый директор',
        'P&L, прогнозы, бюджеты, разбор финансовых отчётов',
      ),
    },
    {
      slug: 'assistant',
      name: 'Ассистент',
      model,
      system_prompt: buildSystemPrompt(
        'Ассистент',
        'личный ассистент',
        'задачи, напоминания, саммари по сотрудникам и встречам',
      ),
    },
    {
      slug: 'general',
      name: 'General',
      model,
      thread_id: GENERAL_THREAD_ID,
      system_prompt: [
        'Ты — диспетчер командного форума Ильи. В группе есть темы-ветки:',
        'Контент, Продуктолог, Финансист, Ассистент. Каждая — отдельный',
        'профильный AI-агент. Твоя задача — коротко ответить на общий вопрос',
        'или подсказать, в какую ветку лучше написать. Тон: по делу, по-русски.',
      ].join('\n'),
    },
  ];
}

// ── Report routing (Flow 1) ───────────────────────────────────────

export interface RoutedReport {
  sourceChatId: number;
  sourceLabel?: string;
  summary: string;
  raw?: unknown;
  periodStart?: string | null;
  periodEnd?: string | null;
  // Idempotency key. When omitted, defaults to
  // `${sourceChatId}:${periodEnd}`. Callers with a stable per-report
  // identity (e.g. a digest row id) should pass it explicitly so
  // retries dedup but distinct reports don't.
  dedupKey?: string;
}

export interface RouteResult {
  delivered: boolean;
  agentSlug: string | null;
  threadId: number | null;
  skippedReason: 'duplicate' | 'no_target' | 'send_failed' | null;
}

export type DirectionClassifier = (
  summary: string,
  candidates: AgentRow[],
) => Promise<string | null>;

export interface ForumRouterDeps {
  bot: Bot;
  groupId: number;
  agents: AgentService;
  forum: ForumStore;
  logger: Logger;
  // Optional fallback when no source_route matches.
  classifyDirection?: DirectionClassifier;
}

export interface ForumRouter {
  routeReport(report: RoutedReport): Promise<RouteResult>;
  sendToThread(threadId: number | null, text: string): Promise<Message | null>;
}

export function createForumRouter(deps: ForumRouterDeps): ForumRouter {
  const { bot, groupId, agents, forum, logger, classifyDirection } = deps;

  async function sendToThread(
    threadId: number | null,
    text: string,
  ): Promise<Message | null> {
    let first: Message | null = null;
    for (const chunk of splitForTelegram(text)) {
      // General (thread 1) is posted without message_thread_id.
      const opts: Parameters<typeof bot.api.sendMessage>[2] = {
        link_preview_options: { is_disabled: true },
      };
      if (threadId && threadId !== GENERAL_THREAD_ID) {
        opts.message_thread_id = threadId;
      }
      const msg = await bot.api.sendMessage(groupId, chunk, opts);
      if (!first) first = msg;
    }
    return first;
  }

  return {
    sendToThread,

    async routeReport(report): Promise<RouteResult> {
      const dedupKey = report.dedupKey ?? `${report.sourceChatId}:${report.periodEnd ?? ''}`;
      if (forum.reportExists(dedupKey)) {
        logger.info('forum: report deduped', { dedupKey });
        return { delivered: false, agentSlug: null, threadId: null, skippedReason: 'duplicate' };
      }

      // 1) explicit route → 2) model classification → 3) General.
      let agent = agents.routeForSource(report.sourceChatId);
      if (!agent && classifyDirection) {
        try {
          const slug = await classifyDirection(report.summary, agents.listActive());
          if (slug) agent = agents.getBySlug(slug);
        } catch (err) {
          logger.warn('forum: direction classify failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (!agent) agent = agents.getBySlug('general');
      if (!agent) {
        logger.error('forum: no agent to route to (seed missing?)', {
          sourceChatId: report.sourceChatId,
        });
        return { delivered: false, agentSlug: null, threadId: null, skippedReason: 'no_target' };
      }

      // Deliver to the agent's bound thread; fall back to General if
      // the topic isn't bound yet so reports are never lost.
      const targetThread = agent.thread_id ?? GENERAL_THREAD_ID;
      const text = formatReport(report);

      let msg: Message | null = null;
      try {
        msg = await sendToThread(targetThread, text);
      } catch (err) {
        logger.error('forum: send to thread failed', {
          agent: agent.slug,
          threadId: targetThread,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          delivered: false,
          agentSlug: agent.slug,
          threadId: targetThread,
          skippedReason: 'send_failed',
        };
      }

      forum.saveReport({
        agentId: agent.id,
        sourceChatId: report.sourceChatId,
        summary: report.summary,
        raw: report.raw,
        periodStart: report.periodStart ?? null,
        periodEnd: report.periodEnd ?? null,
        tgMessageId: msg?.message_id ?? null,
        dedupKey,
      });
      forum.appendThreadMessage({
        agentId: agent.id,
        threadId: targetThread,
        role: 'report',
        content: report.summary,
        tgMessageId: msg?.message_id ?? null,
      });

      logger.info('forum: report routed', {
        sourceChatId: report.sourceChatId,
        agent: agent.slug,
        threadId: targetThread,
      });
      return { delivered: true, agentSlug: agent.slug, threadId: targetThread, skippedReason: null };
    },
  };
}

function formatReport(report: RoutedReport): string {
  const head = report.sourceLabel ? `📥 ${report.sourceLabel}` : '📥 Отчёт';
  const period =
    report.periodEnd && report.periodStart
      ? ` · ${report.periodStart.slice(0, 16).replace('T', ' ')} → ${report.periodEnd
          .slice(0, 16)
          .replace('T', ' ')}`
      : '';
  return `${head}${period}\n\n${report.summary}`;
}

// ── Direction classifier (fallback for un-routed reports) ─────────

const CLASSIFY_TOOL_NAME = 'pick_direction';

export function createDirectionClassifier(opts: {
  apiKey: string;
  model: string;
}): DirectionClassifier {
  const client = new Anthropic({ apiKey: opts.apiKey });

  return async (summary, candidates): Promise<string | null> => {
    const slugs = candidates.map((a) => a.slug);
    if (slugs.length === 0) return null;
    const roster = candidates.map((a) => `${a.slug} — ${a.name}`).join('\n');

    const response = await client.messages.create({
      model: opts.model,
      max_tokens: 256,
      tools: [
        {
          name: CLASSIFY_TOOL_NAME,
          description: 'Выбери направление (агента), которому относится отчёт.',
          input_schema: {
            type: 'object',
            properties: {
              slug: { type: 'string', enum: slugs },
            },
            required: ['slug'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: CLASSIFY_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: `Направления:\n${roster}\n\nОтчёт:\n${summary.slice(0, 2000)}\n\nВыбери slug направления.`,
        },
      ],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === CLASSIFY_TOOL_NAME,
    );
    const slug = (toolUse?.input as { slug?: string } | undefined)?.slug;
    return slug && slugs.includes(slug) ? slug : null;
  };
}
