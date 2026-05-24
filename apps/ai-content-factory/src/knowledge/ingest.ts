// Ingest a content file into the knowledge base: validate each record, embed it
// via Voyage (batched), and store row + vector. Accepts a JSON array or JSONL
// (one JSON object per line).

import { readFile } from 'node:fs/promises';
import { Ajv } from 'ajv';
import { getDb } from '../db/index.js';
import { addContent } from './store.js';
import { embedTexts } from '../embeddings/voyage.js';
import { contentItemSchema, embeddingText, type RawContentItem } from '../schemas/content.js';
import { log } from '../lib/logger.js';

const EMBED_BATCH = 64;

function parseRecords(raw: string): unknown[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed) as unknown[];
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

export async function ingestFile(path: string): Promise<{ ingested: number }> {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(contentItemSchema);

  const records = parseRecords(await readFile(path, 'utf8'));
  const items: RawContentItem[] = records.map((rec, i) => {
    if (!validate(rec)) {
      throw new Error(`Record ${i} is invalid: ${ajv.errorsText(validate.errors, { separator: '; ' })}`);
    }
    return rec as RawContentItem;
  });

  if (items.length === 0) {
    log.warn('No records found to ingest', { path });
    return { ingested: 0 };
  }

  const db = getDb();
  let ingested = 0;
  for (let i = 0; i < items.length; i += EMBED_BATCH) {
    const batch = items.slice(i, i + EMBED_BATCH);
    const embeddings = await embedTexts(batch.map(embeddingText), 'document');
    const insert = db.transaction((rows: RawContentItem[]) => {
      rows.forEach((item, j) => addContent(db, item, embeddings[j]!));
    });
    insert(batch);
    ingested += batch.length;
    log.info(`Embedded & stored ${Math.min(i + EMBED_BATCH, items.length)}/${items.length}`);
  }

  return { ingested };
}
