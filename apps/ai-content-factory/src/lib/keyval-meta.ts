// Generic per-tag .meta.json store. Used by references (image library) and
// prompts (text library); footage-meta / screen-meta stay as their own
// files to avoid disturbing the existing migrations.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { dataPath } from './paths.js';

export interface AssetMetaBase {
  status: string;
  updatedAt: string;
  error?: string;
}

export interface MetaStore<M extends AssetMetaBase> {
  root: string;
  getAll(tag: string): Record<string, M>;
  get(tag: string, file: string): M | undefined;
  set(tag: string, file: string, patch: Partial<M>): M;
  delete(tag: string, file: string): void;
}

export function createMetaStore<M extends AssetMetaBase>(...rootSegments: string[]): MetaStore<M> {
  const root = dataPath(...rootSegments);

  function metaPath(tag: string): string {
    return join(root, tag, '.meta.json');
  }

  function load(tag: string): Record<string, M> {
    const p = metaPath(tag);
    if (!existsSync(p)) return {};
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as Record<string, M>;
    } catch {
      return {};
    }
  }

  function save(tag: string, data: Record<string, M>): void {
    const p = metaPath(tag);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  return {
    root,
    getAll: (tag) => load(tag),
    get: (tag, file) => load(tag)[file],
    set: (tag, file, patch) => {
      const data = load(tag);
      const prev = data[file] ?? ({ status: 'pending', updatedAt: new Date().toISOString() } as M);
      const next = { ...prev, ...patch, updatedAt: new Date().toISOString() } as M;
      data[file] = next;
      save(tag, data);
      return next;
    },
    delete: (tag, file) => {
      const data = load(tag);
      if (file in data) {
        delete data[file];
        save(tag, data);
      }
    },
  };
}
