// Remix copy (hooks A/B, code word, caption, slide order) via claudeChat —
// Anthropic first, transparent OpenAI fallback (lib/research/claude.ts).
// Vision: the original slides are attached when they are reachable by the
// provider (public https, not localhost); on a provider error with images we
// retry text-only, and with no provider at all the caller uses the template
// fallback in buildRemixSpec().

import { claudeChat, isClaudeConfigured, parseJsonResponse } from '@/lib/research/claude';
import { buildRemixUserPrompt, coerceRemixAi, REMIX_SYSTEM, type RemixAi, type SourceKind } from './remix';

function providerReachable(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(u.hostname) && !u.hostname.endsWith('.local');
  } catch {
    return false;
  }
}

export async function generateRemixCopy(input: {
  caption: string;
  slideImages: string[];
  sourceKind: SourceKind;
  metrics: { likes: number; comments: number; shares: number };
  medians?: { likes: number; comments: number; shares: number } | null;
  ageDays: number | null;
  niche?: string | null;
  oldCodeWord: string | null;
}): Promise<{ ai: RemixAi | null; sawImages: boolean; error?: string }> {
  if (!isClaudeConfigured()) return { ai: null, sawImages: false, error: 'no_ai_provider' };
  const images = input.slideImages.filter(providerReachable).slice(0, 8);

  const ask = async (withImages: boolean) =>
    claudeChat({
      system: REMIX_SYSTEM,
      user: buildRemixUserPrompt({ ...input, slideCount: input.slideImages.length, withImages }),
      imageUrls: withImages ? images : undefined,
      maxTokens: 1600,
      timeoutMs: 60_000,
    });

  let sawImages = images.length > 0;
  let res = await ask(sawImages);
  if (!res.ok && sawImages) {
    sawImages = false;
    res = await ask(false);
  }
  if (!res.ok) return { ai: null, sawImages: false, error: `${res.status}: ${res.details.slice(0, 200)}` };

  const ai = coerceRemixAi(parseJsonResponse<unknown>(res.text));
  return ai ? { ai, sawImages } : { ai: null, sawImages: false, error: 'unparseable_ai_answer' };
}
