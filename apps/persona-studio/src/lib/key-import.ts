// Pull known provider keys out of a free-form pasted text (a notes dump with
// labels, other services' secrets, passwords…). Only integration keys we
// recognise with confidence are returned; everything else is ignored.

type Rule = { key: string; re: RegExp; near?: RegExp };

// `near`: the label must appear within ~80 chars before the value — used for
// formats that are too generic on their own (hex keys).
const RULES: Rule[] = [
  { key: 'ANTHROPIC_API_KEY', re: /sk-ant-api\d\d-[A-Za-z0-9_-]{80,}/ },
  { key: 'OPENAI_API_KEY', re: /sk-proj-[A-Za-z0-9_-]{40,}/ },
  { key: 'HEYGEN_API_KEY', re: /sk_V2_hgu_[A-Za-z0-9_]{20,}/ },
  { key: 'APIFY_TOKEN', re: /apify_api_[A-Za-z0-9]{20,}/ },
  { key: 'VOYAGE_API_KEY', re: /\bpa-[A-Za-z0-9_-]{30,}/ },
  { key: 'ELEVENLABS_API_KEY', re: /\bsk_[a-f0-9]{48}\b/, near: /eleven/i },
  { key: 'SUBMAGIC_API_KEY', re: /\bsk-[a-f0-9]{64}\b/, near: /submagic/i },
  { key: 'KIE_API_KEY', re: /\b[a-f0-9]{32}\b/, near: /kie/i },
  { key: 'TELEGRAM_BOT_TOKEN', re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/ },
  { key: 'CRYPTOBOT_TOKEN', re: /\b\d{4,7}:AA[A-Za-z0-9_-]{30,}\b/, near: /crypto/i },
  { key: 'AUTH_GOOGLE_ID', re: /\b\d{6,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com\b/ },
  { key: 'AUTH_GOOGLE_SECRET', re: /\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
  { key: 'POSTMYPOST_API_TOKEN', re: /\b[A-Za-z0-9]{40,}\b/, near: /postmypost/i },
];

export function extractKeys(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`);
    for (const m of text.matchAll(re)) {
      if (rule.near) {
        const before = text.slice(Math.max(0, (m.index ?? 0) - 80), m.index ?? 0);
        if (!rule.near.test(before)) continue;
      }
      found[rule.key] = m[0];
      break; // first match wins (e.g. the first of two Anthropic keys)
    }
  }
  return found;
}
