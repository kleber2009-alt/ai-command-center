// Per-clip metadata sidecar. Stored at data/assets/footage/<tag>/.meta.json
// as a flat map { "<filename>": { description, autoTags?, durationSec?, status,
// updatedAt } }. The Claude reels generator reads this so it can pick clips
// by content, not just by folder.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { dataPath } from './paths.js';

export type ClipStatus = 'pending' | 'describing' | 'ready' | 'failed';

export interface ClipMeta {
  description?: string;
  autoTags?: string[];
  durationSec?: number;
  status: ClipStatus;
  error?: string;
  updatedAt: string;
}

const FOOTAGE_ROOT = dataPath('assets', 'footage');

function metaPath(tag: string): string {
  return join(FOOTAGE_ROOT, tag, '.meta.json');
}

function load(tag: string): Record<string, ClipMeta> {
  const p = metaPath(tag);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<string, ClipMeta>;
  } catch {
    return {};
  }
}

function save(tag: string, data: Record<string, ClipMeta>): void {
  const p = metaPath(tag);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function getClipMeta(tag: string, file: string): ClipMeta | undefined {
  return load(tag)[file];
}

export function getAllClipMeta(tag: string): Record<string, ClipMeta> {
  return load(tag);
}

export function setClipMeta(tag: string, file: string, patch: Partial<ClipMeta>): ClipMeta {
  const data = load(tag);
  const prev = data[file] ?? { status: 'pending' as ClipStatus, updatedAt: new Date().toISOString() };
  const next: ClipMeta = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  data[file] = next;
  save(tag, data);
  return next;
}

export function deleteClipMeta(tag: string, file: string): void {
  const data = load(tag);
  if (file in data) {
    delete data[file];
    save(tag, data);
  }
}
