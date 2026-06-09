// ═══════════════════════════════════════════════════════════════════
// handlers/index.js — registry of job-kind → handler
// ═══════════════════════════════════════════════════════════════════

import { handle as dailyBriefing } from './daily_briefing.js';
import { handle as weeklyRecap } from './weekly_recap.js';
import { handle as welcomeSequence } from './welcome_sequence.js';
import { handle as welcomeVoice } from './welcome_voice.js';
import { handle as subscriptionExpiryCheck } from './subscription_expiry_check.js';
import { handle as monthlyCalendar } from './monthly_calendar.js';
import { handle as viralClone } from './viral_clone.js';
import { handle as viralCloneSweep } from './viral_clone_sweep.js';
import { handle as viralDiscover } from './viral_discover.js';

const REGISTRY = {
  daily_briefing: dailyBriefing,
  weekly_recap: weeklyRecap,
  welcome_sequence: welcomeSequence,
  welcome_voice: welcomeVoice,
  subscription_expiry_check: subscriptionExpiryCheck,
  monthly_calendar: monthlyCalendar,
  viral_clone: viralClone,
  viral_clone_sweep: viralCloneSweep,
  viral_discover: viralDiscover,
};

export function getHandler(kind) {
  return REGISTRY[kind] || null;
}

export const SUPPORTED_KINDS = Object.keys(REGISTRY);
