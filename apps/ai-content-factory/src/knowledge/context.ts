// Render a RagContext into a prompt block (Russian) that gets injected ahead of
// the output contract, grounding generation in what has worked before.

import type { RagContext, RagExample } from './retrieve.js';

const SNIPPET_LEN = 280;

function snippet(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > SNIPPET_LEN ? `${clean.slice(0, SNIPPET_LEN)}…` : clean;
}

function renderExample(e: RagExample, i: number): string {
  return [
    `${i + 1}. [score ${Math.round(e.performance_score)} · ${e.type}] ${e.topic ?? ''}`.trim(),
    `   Хук: ${e.hook ?? '—'}`,
    `   ${snippet(e.content)}`,
  ].join('\n');
}

export function formatRagContext(ctx: RagContext | null): string {
  if (!ctx) return '';
  const blocks: string[] = [];

  if (ctx.good.length > 0) {
    blocks.push(
      '## Что у тебя уже заходило (перенять тон, структуру и тип хука — не копировать дословно)',
      ctx.good.map(renderExample).join('\n'),
    );
  }
  if (ctx.bad.length > 0) {
    blocks.push(
      '## Что заходило плохо (избегать таких ходов)',
      ctx.bad.map(renderExample).join('\n'),
    );
  }
  if (ctx.learnings.length > 0) {
    blocks.push(
      '## Выводы из прошлого опыта',
      ctx.learnings.map((l) => `- ${l.insight}`).join('\n'),
    );
  }

  if (blocks.length === 0) return '';
  return `# Контекст из базы знаний\n\n${blocks.join('\n\n')}`;
}
