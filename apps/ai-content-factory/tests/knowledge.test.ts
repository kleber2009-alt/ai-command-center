import { test } from 'node:test';
import assert from 'node:assert/strict';

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { Ajv } from 'ajv';

import { applySchema, floatsToBuffer, type DB } from '../src/db/index.js';
import {
  addContent,
  contentCount,
  searchSimilar,
  logGeneration,
  getLearnings,
} from '../src/knowledge/store.js';
import { performanceScore } from '../src/lib/performance.js';
import { formatRagContext } from '../src/knowledge/context.js';
import { contentItemSchema, embeddingText } from '../src/schemas/content.js';

const DIM = 4;

function freshDb(): DB {
  const db = new Database(':memory:');
  sqliteVec.load(db);
  applySchema(db, DIM);
  return db;
}

test('performanceScore rewards saves/shares/follows/leads over views, ignores likes', () => {
  assert.equal(performanceScore(), 0);
  // views 1000*0.2=200, saves 10*2=20, shares 5*3=15, comments 4*1.5=6, follows 3*5=15, leads 2*10=20
  assert.equal(
    performanceScore({ views: 1000, likes: 9999, comments: 4, saves: 10, shares: 5, follows: 3, leads: 2 }),
    276,
  );
  // likes never move the score
  assert.equal(performanceScore({ likes: 100000 }), 0);
});

test('addContent stores rows + vectors and searchSimilar ranks by cosine similarity', () => {
  const db = freshDb();
  addContent(db, { type: 'reels', topic: 'A', content: 'alpha' }, [1, 0, 0, 0]);
  addContent(db, { type: 'reels', topic: 'B', content: 'beta' }, [0.9, 0.1, 0, 0]);
  addContent(db, { type: 'carousel', topic: 'C', content: 'gamma' }, [0, 1, 0, 0]);

  assert.equal(contentCount(db), 3);

  const results = searchSimilar(db, [1, 0, 0, 0], { limit: 3 });
  assert.equal(results.length, 3);
  // Closest first: A (identical) then B (near) then C (orthogonal).
  assert.deepEqual(
    results.map((r) => r.topic),
    ['A', 'B', 'C'],
  );
  assert.ok(results[0]!.similarity > results[2]!.similarity);
  // Orthogonal vector → cosine similarity ~0.
  assert.ok(Math.abs(results[2]!.similarity) < 1e-5);
});

test('searchSimilar can filter by content type', () => {
  const db = freshDb();
  addContent(db, { type: 'reels', topic: 'A', content: 'a' }, [1, 0, 0, 0]);
  addContent(db, { type: 'carousel', topic: 'C', content: 'c' }, [0.99, 0.01, 0, 0]);

  const onlyReels = searchSimilar(db, [1, 0, 0, 0], { limit: 5, type: 'reels' });
  assert.deepEqual(onlyReels.map((r) => r.type), ['reels']);
});

test('floatsToBuffer produces little-endian float32 bytes', () => {
  const buf = floatsToBuffer([1, 0]);
  assert.equal(buf.length, 8);
  assert.equal(buf.readFloatLE(0), 1);
  assert.equal(buf.readFloatLE(4), 0);
});

test('logGeneration and getLearnings round-trip through the DB', () => {
  const db = freshDb();
  const id = logGeneration(db, {
    inputContext: { topic: 'x' },
    retrievedExamples: { good: [1, 2], bad: [3] },
    generatedOutput: { slides: 7 },
    finalStatus: 'generated',
  });
  assert.ok(id > 0);
  assert.deepEqual(getLearnings(db), []); // empty until the learning engine writes
});

test('formatRagContext renders good/bad/learnings sections (and empty for null)', () => {
  assert.equal(formatRagContext(null), '');
  const block = formatRagContext({
    good: [{ id: 1, type: 'reels', topic: 'Хорошее', hook: 'Хук', content: 'текст', format: null, performance_score: 91, similarity: 0.9 }],
    bad: [{ id: 2, type: 'carousel', topic: 'Слабое', hook: null, content: 'текст2', format: null, performance_score: 3, similarity: 0.5 }],
    learnings: [{ insight: 'Личный опыт заходит лучше', learning_type: null, confidence: 0.8 }],
  });
  assert.match(block, /Контекст из базы знаний/);
  assert.match(block, /уже заходило/);
  assert.match(block, /заходило плохо/);
  assert.match(block, /Выводы из прошлого опыта/);
  assert.match(block, /Личный опыт заходит лучше/);
});

test('content schema validates required fields and embeddingText concatenates', () => {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(contentItemSchema);
  assert.ok(validate({ type: 'reels', content: 'hi' }));
  assert.equal(validate({ type: 'reels' }), false); // missing content
  assert.equal(validate({ type: 'unknown', content: 'x' }), false); // bad enum
  assert.equal(validate({ type: 'reels', content: 'x', bogus: 1 }), false); // extra key

  assert.equal(
    embeddingText({ type: 'reels', topic: 'T', hook: 'H', content: 'C', cta: 'X' }),
    'T\nH\nC\nX',
  );
});
