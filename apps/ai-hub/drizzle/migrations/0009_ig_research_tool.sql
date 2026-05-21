-- IG Research v0 tool. Provider=internal, model=ig-research (handled inline by
-- the internal adapter via lib/research/ig.ts). Cost: 50 ai-hub tokens per
-- analysis (covers ~$0.025 Apify + Claude Haiku spend with margin).

INSERT INTO ai_tools (slug, name, description, category, provider, model, token_cost,
  input_schema, output_schema, status, sort_order)
VALUES (
  'ig-research',
  'Instagram Research',
  'Анализ Instagram-аккаунта: последние 12 постов → хуки, визуал, CTA, паттерны вирусности и слабые места. Парсинг через Apify, анализ Claude Haiku.',
  'analysis',
  'internal',
  'ig-research',
  50,
  '{"type":"object","required":["username"],"properties":{"username":{"type":"string","minLength":1,"maxLength":40,"description":"Instagram username без @"}}}'::jsonb,
  '{}'::jsonb,
  'active',
  500
)
ON CONFLICT (slug) DO UPDATE SET
  description  = EXCLUDED.description,
  category     = EXCLUDED.category,
  provider     = EXCLUDED.provider,
  model        = EXCLUDED.model,
  token_cost   = EXCLUDED.token_cost,
  input_schema = EXCLUDED.input_schema,
  status       = EXCLUDED.status;
