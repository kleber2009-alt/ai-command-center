// Per-screen metadata sidecar (parallel to footage-meta). Stored at
// data/assets/screens/<slot>/.meta.json as a flat map
// { "<filename>": { description, autoTags?, widthPx?, heightPx?, status, updatedAt } }.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { dataPath } from './paths.js';

export type ScreenStatus = 'pending' | 'describing' | 'ready' | 'failed';

export interface ScreenMeta {
  description?: string;
  autoTags?: string[];
  widthPx?: number;
  heightPx?: number;
  status: ScreenStatus;
  error?: string;
  updatedAt: string;
}

const SCREENS_ROOT = dataPath('assets', 'screens');

function metaPath(tag: string): string {
  return join(SCREENS_ROOT, tag, '.meta.json');
}

function load(tag: string): Record<string, ScreenMeta> {
  const p = metaPath(tag);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<string, ScreenMeta>;
  } catch {
    return {};
  }
}

function save(tag: string, data: Record<string, ScreenMeta>): void {
  const p = metaPath(tag);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function getScreenMeta(tag: string, file: string): ScreenMeta | undefined {
  return load(tag)[file];
}

export function getAllScreenMeta(tag: string): Record<string, ScreenMeta> {
  return load(tag);
}

export function setScreenMeta(tag: string, file: string, patch: Partial<ScreenMeta>): ScreenMeta {
  const data = load(tag);
  const prev = data[file] ?? { status: 'pending' as ScreenStatus, updatedAt: new Date().toISOString() };
  const next: ScreenMeta = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  data[file] = next;
  save(tag, data);
  return next;
}

export function deleteScreenMeta(tag: string, file: string): void {
  const data = load(tag);
  if (file in data) {
    delete data[file];
    save(tag, data);
  }
}
