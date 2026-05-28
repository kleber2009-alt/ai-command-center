// Per-format on/off switch for the scheduled bot. Persisted to
// data/bot-state.json so the toggle survives container restarts.
// Manual generation via /api/generate and manual scheduler triggers are NOT
// gated — only the cron callbacks consult this state.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { dataPath } from './paths.js';

export interface BotState {
  carousel: boolean;
  reels: boolean;
}

const STATE_PATH = dataPath('bot-state.json');
const DEFAULT_STATE: BotState = { carousel: true, reels: true };

export function readBotState(): BotState {
  if (!existsSync(STATE_PATH)) return { ...DEFAULT_STATE };
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as Partial<BotState>;
    return {
      carousel: typeof parsed.carousel === 'boolean' ? parsed.carousel : DEFAULT_STATE.carousel,
      reels: typeof parsed.reels === 'boolean' ? parsed.reels : DEFAULT_STATE.reels,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeBotState(patch: Partial<BotState>): BotState {
  const current = readBotState();
  const next: BotState = {
    carousel: typeof patch.carousel === 'boolean' ? patch.carousel : current.carousel,
    reels: typeof patch.reels === 'boolean' ? patch.reels : current.reels,
  };
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
