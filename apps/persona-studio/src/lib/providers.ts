// Is a paid image/video provider actually configured? A fresh server ships
// KIE_API_KEY=unset (env.ts requires a value), so "present" ≠ "usable".
// Routes check this BEFORE charging tokens and queueing work, so users get one
// clear error instead of a batch of failed jobs.

const PLACEHOLDERS = new Set(['', 'unset', 'build', 'changeme', 'CHANGE_ME']);

export function kieConfigured(): boolean {
  return !PLACEHOLDERS.has((process.env.KIE_API_KEY ?? '').trim());
}

export const PROVIDER_NOT_CONFIGURED = {
  error: 'provider_not_configured',
  message: 'Генерация пока не подключена: администратору нужно добавить ключ провайдера.',
} as const;
