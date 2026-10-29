// Base URLs of external APIs that have no *_BASE setting in env.ts. Overridable
// so the whole app can run against local fakes (QA) or an egress proxy; the
// defaults are the real endpoints.

const trim = (u: string) => u.replace(/\/+$/, '');

export const ANTHROPIC_BASE = trim(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com');
export const OPENAI_BASE = trim(process.env.OPENAI_BASE_URL || 'https://api.openai.com');
export const TELEGRAM_API_BASE = trim(process.env.TELEGRAM_API_BASE || 'https://api.telegram.org');
export const APIFY_API_BASE = trim(process.env.APIFY_API_BASE || 'https://api.apify.com');
export const VOYAGE_API_BASE = trim(process.env.VOYAGE_API_BASE || 'https://api.voyageai.com');
