// Sanity tests for the footage-tags catalog file and the validation patterns
// the server uses to gate uploads/deletes. We don't boot the server here —
// just lock in the contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SAFE_TAG = /^[a-z0-9][a-z0-9_-]{0,40}$/i;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(mp4|mov|m4v|webm)$/i;

test('footage-tags.json defines tags with required keys', () => {
  const p = resolve(__dirname, '..', 'data', 'assets', 'footage-tags.json');
  const parsed = JSON.parse(readFileSync(p, 'utf8')) as { tags: { tag: string; label?: string; description?: string }[] };
  assert.ok(Array.isArray(parsed.tags));
  assert.ok(parsed.tags.length >= 4, 'at least 4 tags expected');
  for (const t of parsed.tags) {
    assert.equal(typeof t.tag, 'string');
    assert.ok(SAFE_TAG.test(t.tag), `tag "${t.tag}" must match SAFE_TAG`);
  }
});

test('SAFE_TAG accepts realistic tag names and rejects shenanigans', () => {
  assert.equal(SAFE_TAG.test('talking-head'), true);
  assert.equal(SAFE_TAG.test('b-roll-typing'), true);
  assert.equal(SAFE_TAG.test('screen-cast'), true);
  assert.equal(SAFE_TAG.test('A1_b-c'), true);
  // path traversal / sneaky inputs
  assert.equal(SAFE_TAG.test('../../etc'), false);
  assert.equal(SAFE_TAG.test('hello world'), false);
  assert.equal(SAFE_TAG.test('-leading-dash'), false);
  assert.equal(SAFE_TAG.test(''), false);
  assert.equal(SAFE_TAG.test('тег'), false);
});

test('SAFE_FILE accepts only the four media extensions', () => {
  assert.equal(SAFE_FILE.test('1234-clip.mp4'), true);
  assert.equal(SAFE_FILE.test('clip.MOV'), true);
  assert.equal(SAFE_FILE.test('clip.webm'), true);
  assert.equal(SAFE_FILE.test('clip.m4v'), true);
  // wrong extensions / traversal
  assert.equal(SAFE_FILE.test('clip.gif'), false);
  assert.equal(SAFE_FILE.test('clip.mp4.sh'), false);
  assert.equal(SAFE_FILE.test('../clip.mp4'), false);
  assert.equal(SAFE_FILE.test('.mp4'), false);
});
