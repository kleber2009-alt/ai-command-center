-- Reels Creator agent (v0). Same internal-provider pattern as ig-research.
-- Cost: 30 tokens. Claude-only, no Apify/image-gen calls.

INSERT INTO ai_tools (slug, name, description, category, provider, model, token_cost,
  input_schema, output_schema, status, sort_order)
VALUES (
  'reels-creator',
  'Reels Creator',
  'Полный пакет Reels: hook → 5 кадров с voiceover и визуальным брифом → caption → hashtags → CTA. Каждый visual_brief сразу можно отдать в Nano Banana 2.',
  'content',
  'internal',
  'reels-creator',
  30,
  '{"type":"object","required":["niche","topic"],"properties":{"niche":{"type":"string","minLength":1},"topic":{"type":"string","minLength":3},"tone":{"type":"string","default":"premium"},"language":{"type":"string","enum":["ru","en"],"default":"ru"}}}'::jsonb,
  '{}'::jsonb,
  'active',
  510
)
ON CONFLICT (slug) DO UPDATE SET
  description  = EXCLUDED.description,
  category     = EXCLUDED.category,
  provider     = EXCLUDED.provider,
  model        = EXCLUDED.model,
  token_cost   = EXCLUDED.token_cost,
  input_schema = EXCLUDED.input_schema,
  status       = EXCLUDED.status;
