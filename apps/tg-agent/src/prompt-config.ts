import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CLASSIFIER_SYSTEM_PROMPT,
  RESPONDER_STRATEGIES,
  RESPONDER_TONE,
} from './prompts.js';

const FILE = 'prompts.json';

export interface PromptOverrides {
  tone?: string;
  strategies?: Record<string, string>;
  classifierExtra?: string;
}

export interface PromptConfig {
  getTone(): string;
  getStrategies(): Record<string, string>;
  getClassifierExtra(): string;
  getAll(): PromptOverrides;
  save(overrides: PromptOverrides): void;
  reload(): void;
}

export function createPromptConfig(dataDir: string): PromptConfig {
  const filePath = join(dataDir, FILE);
  let cache: PromptOverrides | null = null;

  function load(): PromptOverrides {
    if (existsSync(filePath)) {
      try { return JSON.parse(readFileSync(filePath, 'utf-8')) as PromptOverrides; } catch { /* fallback */ }
    }
    return {};
  }

  function get(): PromptOverrides { if (!cache) cache = load(); return cache; }

  return {
    getTone() { return get().tone ?? RESPONDER_TONE; },
    getStrategies() { return { ...RESPONDER_STRATEGIES, ...(get().strategies ?? {}) }; },
    getClassifierExtra() { return get().classifierExtra ?? ''; },
    getAll() { return get(); },
    save(overrides) {
      writeFileSync(filePath, JSON.stringify(overrides, null, 2), 'utf-8');
      cache = overrides;
    },
    reload() { cache = load(); },
  };
}

export { RESPONDER_STRATEGIES, RESPONDER_TONE, CLASSIFIER_SYSTEM_PROMPT };
