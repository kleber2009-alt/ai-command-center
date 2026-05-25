import {
  BROLL,
  type BRollCandidate,
  type TranscriptSegment,
  brollCandidateSchema,
  renderBRollPrompt,
} from '@vp/shared';
import type { BrollEngineDeps } from './deps.js';

function parseCandidate(segment: TranscriptSegment, raw: string): BRollCandidate | null {
  let json: unknown;
  try {
    json = extractJson(raw);
  } catch {
    return null;
  }
  const parsed = brollCandidateSchema.safeParse(json);
  if (!parsed.success) return null;

  const d = parsed.data;
  return {
    segment,
    shouldInsert: d.should_insert_broll,
    reasoning: d.reasoning,
    keywords: d.keywords,
    visualConcept: d.visual_concept,
    style: d.style,
    suggestedDurationMs: d.suggested_duration_ms,
    // Trust the segment window over a hallucinated timestamp.
    insertAtMs: clamp(d.insert_at_ms, segment.startMs, segment.endMs),
  };
}

/**
 * Step 2 (§4.2): ask the LLM whether each segment warrants B-roll. Enforces the
 * "max 1 insert per 8s" rule deterministically on top of the model's judgement,
 * so spacing never depends on the model behaving.
 */
export async function extractCandidates(
  segments: TranscriptSegment[],
  deps: BrollEngineDeps,
): Promise<BRollCandidate[]> {
  const accepted: BRollCandidate[] = [];
  let lastInsertMs = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i] as TranscriptSegment;
    const prevContext = i > 0 ? (segments[i - 1] as TranscriptSegment).text : '';

    const prompt = renderBRollPrompt({
      transcript: segment.text,
      startMs: segment.startMs,
      endMs: segment.endMs,
      prevContext,
    });

    let raw: string;
    try {
      raw = await deps.llmComplete(prompt);
    } catch (err) {
      deps.logger?.('broll candidate llm failed', { segment: i, err: String(err) });
      continue;
    }

    const candidate = parseCandidate(segment, raw);
    if (!candidate || !candidate.shouldInsert) continue;

    // Spacing rule: skip if too close to the previous accepted insert.
    if (candidate.insertAtMs - lastInsertMs < BROLL.minSpacingMs) {
      deps.logger?.('broll candidate skipped: spacing', { at: candidate.insertAtMs });
      continue;
    }

    accepted.push(candidate);
    lastInsertMs = candidate.insertAtMs;
  }

  return accepted;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

// Local import to avoid a circular dep with packages/ai; mirrors its extractor.
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1]?.trim() ?? text.trim();
  const start = body.search(/[[{]/);
  if (start === -1) throw new Error('no JSON');
  const open = body[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(body.slice(start, i + 1));
  }
  throw new Error('unterminated JSON');
}
