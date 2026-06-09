// Per-thread dialog agent (Flow 2). When the owner writes in a forum
// topic, the agent bound to that thread answers grounded in three
// layers of context: its role (system_prompt), the recent reports
// routed to its direction, and the thread's own conversation history.

import Anthropic from '@anthropic-ai/sdk';

import type { AgentRow } from './db/agents.js';
import type { ForumStore, ReportRow, ThreadMessageRow } from './db/forum.js';
import { GENERAL_THREAD_ID } from './forum.js';
import type { Logger } from './logger.js';

const MAX_ANSWER_TOKENS = 1200;
// Context depth — tunable per the spec (§12): start N=10 reports,
// M=20 history messages.
const DEFAULT_REPORTS = 10;
const DEFAULT_HISTORY = 20;

export interface ForumAgentDeps {
  apiKey: string;
  forum: ForumStore;
  logger: Logger;
  reportsLimit?: number;
  historyLimit?: number;
}

export interface ForumAgent {
  // Answers one question for the given agent/thread. The caller is
  // responsible for persisting the user turn and the returned reply to
  // tg_thread_messages AFTER this resolves, so history fetched here
  // excludes the live question.
  ask(agent: AgentRow, userText: string): Promise<string>;
}

export function createForumAgent(deps: ForumAgentDeps): ForumAgent {
  const { apiKey, forum, logger } = deps;
  const client = new Anthropic({ apiKey });
  const reportsLimit = deps.reportsLimit ?? DEFAULT_REPORTS;
  const historyLimit = deps.historyLimit ?? DEFAULT_HISTORY;

  return {
    async ask(agent, userText): Promise<string> {
      const threadId = agent.thread_id ?? GENERAL_THREAD_ID;
      const reports = forum.recentReportsForAgent(agent.id, reportsLimit);
      // recentThreadMessages is newest-first; flip to chronological.
      const history = forum.recentThreadMessages(threadId, historyLimit).reverse();

      const systemText = [
        agent.system_prompt,
        '',
        '# Свежие отчёты по твоему направлению',
        reports.length > 0 ? renderReports(reports) : '(отчётов пока нет)',
      ].join('\n');

      const userBlocks: string[] = [];
      if (history.length > 0) {
        userBlocks.push('# История этой ветки', renderHistory(history), '');
      }
      userBlocks.push('# Новый вопрос от владельца', userText);

      const response = await client.messages.create({
        model: agent.model,
        max_tokens: MAX_ANSWER_TOKENS,
        system: [
          { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: userBlocks.join('\n') }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();

      if (!text) {
        logger.warn('forum_agent: empty reply', { agent: agent.slug });
        return 'Не получилось сформулировать ответ. Попробуй переформулировать.';
      }
      return text;
    },
  };
}

function renderReports(reports: ReportRow[]): string {
  return reports
    .map((r) => {
      const when = r.created_at.slice(0, 16).replace('T', ' ');
      return `• [${when}] ${r.summary.slice(0, 600)}`;
    })
    .join('\n');
}

function renderHistory(history: ThreadMessageRow[]): string {
  return history
    .map((m) => {
      const who =
        m.role === 'user'
          ? 'Владелец'
          : m.role === 'assistant'
            ? 'Ты'
            : m.role === 'report'
              ? 'Отчёт'
              : 'Система';
      return `${who}: ${m.content.slice(0, 800)}`;
    })
    .join('\n');
}
