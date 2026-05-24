// CLI: load content (your posts, references, hooks, offers, reviews) into the
// knowledge base so generation can learn from it.
//
//   npm run ingest -- --file data/knowledge/seed.example.jsonl
//
// Input is a JSON array or JSONL; each record must match the content schema
// (see data/knowledge/seed.example.jsonl). Requires VOYAGE_API_KEY.

import 'dotenv/config';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { ingestFile } from '../knowledge/ingest.js';
import { contentCount } from '../knowledge/store.js';
import { getDb } from '../db/index.js';
import { log } from '../lib/logger.js';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { file: { type: 'string' } } });
  if (!values.file) {
    throw new Error('--file is required (path to a JSON array or JSONL of content records)');
  }

  const { ingested } = await ingestFile(resolve(process.cwd(), values.file));
  log.info('Ingestion complete', { ingested, total: contentCount(getDb()) });
}

main().catch((err) => {
  log.error('Ingest CLI failed', { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});
