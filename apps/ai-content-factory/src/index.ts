// Entry point: starts the cabinet HTTP server + the cron scheduler. Both run
// in the same Node process — the server stays alive, the scheduler hooks fire
// on configured times (default crons in src/scheduler.ts).

import './server.js';
import { startScheduler } from './scheduler.js';

startScheduler();
