// Loads a prompt template from disk and interpolates {{variable}} placeholders.
// Templates live in data/prompts/*.md. Fails fast on an unfilled placeholder so
// a missing variable surfaces in tests rather than reaching the Claude API.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export type PromptVariables = Record<string, string | number | boolean>;

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

export function interpolate(template: string, variables: PromptVariables): string {
  const rendered = template.replace(PLACEHOLDER, (_match, key: string) => {
    if (!(key in variables)) {
      throw new Error(`Prompt placeholder "{{${key}}}" has no provided value`);
    }
    return String(variables[key]);
  });

  const leftover = rendered.match(PLACEHOLDER);
  if (leftover) {
    throw new Error(`Unresolved prompt placeholders: ${leftover.join(', ')}`);
  }
  return rendered;
}

export async function loadPrompt(
  promptFile: string,
  variables: PromptVariables = {},
): Promise<string> {
  const absolute = resolve(process.cwd(), promptFile);
  const template = await readFile(absolute, 'utf8');
  return interpolate(template, variables);
}
