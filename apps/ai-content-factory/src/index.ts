// Entry point. The cron scheduler lands in Phase 5 (src/scheduler.ts); for now
// this just loads environment config and reports that the foundation is wired.

import 'dotenv/config';
import { log } from './lib/logger.js';

function main(): void {
  log.info('AI Content Factory — foundation ready (Phase 1)');
  if (!process.env.ANTHROPIC_API_KEY) {
    log.warn('ANTHROPIC_API_KEY is not set — Claude calls will fail until configured');
  }
}

main();
