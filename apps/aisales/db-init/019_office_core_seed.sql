-- ============================================================
-- AI Command Center · Migration 019 · Office core seed
-- ============================================================
-- Начальный набор данных для Web Office и Telegram HQ.

INSERT INTO office_agents (
  slug, name, kind, mission, cadence, primary_channels, source_systems, default_scope
) VALUES
  ('chief-of-staff', 'Chief of Staff', 'chief_of_staff', 'Фильтрует сигналы, собирает приоритеты и выдает CEO-ready brief.', '08:30 brief · 19:00 wrap-up', ARRAY['CEO DM', 'HQ Room', 'Decision Inbox'], ARRAY['apps/command-center', 'all'], '["decisions","briefs","triage"]'::jsonb),
  ('product-agent', 'Product Agent', 'product', 'Следит за качеством продукта, багами, воронкой фич и пользовательским трением.', 'daily health + backlog triage', ARRAY['HQ Room', 'Web Office / Projects'], ARRAY['apps/persona-studio', 'apps/transcribe', 'apps/persona-train', 'apps/ai-hub', 'apps/ig-content'], '["product","quality","roadmap"]'::jsonb),
  ('growth-agent', 'Growth Agent', 'growth', 'Ищет рычаги роста, упаковки, дистрибуции и landing improvements.', 'daily ideas + weekly campaign', ARRAY['Content Room', 'Web Office / Content'], ARRAY['apps/ai-content-factory', 'apps/ai-office', 'landings/*'], '["growth","distribution","landing"]'::jsonb),
  ('research-agent', 'Research Agent', 'research', 'Конвертирует тренды и конкурентные сигналы в тестируемые гипотезы.', 'trend batch + weekly radar', ARRAY['Content Room', 'Web Office / Memory'], ARRAY['services/node/infra-worker', 'apps/persona-studio'], '["research","trends","hypotheses"]'::jsonb),
  ('sales-agent', 'Sales Agent', 'sales', 'Ловит hot leads, зависшие диалоги и паттерны потерь в CRM.', 'real-time hot lead alerts', ARRAY['Sales Room', 'CEO DM'], ARRAY['apps/tg-agent', 'apps/ig-agent', 'apps/ai-sales'], '["sales","lead-ops","handoff"]'::jsonb),
  ('support-agent', 'Support Agent', 'support', 'Собирает повторяющуюся боль и превращает ее в product/growth inputs.', 'daily voice-of-customer', ARRAY['HQ Room', 'Web Office / Memory'], ARRAY['apps/tg-agent', 'apps/ig-agent', 'manual support'], '["support","customer-voice"]'::jsonb),
  ('ops-agent', 'Ops Agent', 'ops', 'Следит за инфраструктурой, очередями, деплоями, webhook и failure spikes.', 'real-time incidents + daily health', ARRAY['Ops Room', 'CEO DM'], ARRAY['infra/', 'services/node/infra-worker', 'services/python/ytdlp', 'apps/persona-studio'], '["infra","incidents","deploys"]'::jsonb),
  ('finance-agent', 'Finance Agent', 'finance', 'Смотрит на burn, token costs, infra spend и сигналы монетизации.', 'weekly CFO digest', ARRAY['HQ Room', 'Web Office / Dashboard'], ARRAY['billing tables', 'product usage', 'infra costs'], '["finance","costs","monetization"]'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  mission = EXCLUDED.mission,
  cadence = EXCLUDED.cadence,
  primary_channels = EXCLUDED.primary_channels,
  source_systems = EXCLUDED.source_systems,
  default_scope = EXCLUDED.default_scope,
  updated_at = NOW();

INSERT INTO office_event_sources (
  id, slug, system_kind, display_name, repo_path, owner_agent_slug, emits
) VALUES
  ('00000000-0000-0000-0000-000000000101', 'persona-studio', 'app', 'Persona Studio', 'apps/persona-studio', 'product-agent', ARRAY['generation.failed', 'generation.completed', 'billing.tokens_spent', 'research.batch_ready']),
  ('00000000-0000-0000-0000-000000000102', 'transcribe', 'app', 'Transcribe', 'apps/transcribe', 'product-agent', ARRAY['transcript.created', 'generation.cached', 'api.error_spike']),
  ('00000000-0000-0000-0000-000000000103', 'tg-agent', 'app', 'TG Agent', 'apps/tg-agent', 'sales-agent', ARRAY['lead.hot', 'lead.stalled', 'conversation.negative']),
  ('00000000-0000-0000-0000-000000000104', 'ig-agent', 'app', 'IG Agent', 'apps/ig-agent', 'sales-agent', ARRAY['lead.hot', 'manual.takeover', 'recommendation.ready']),
  ('00000000-0000-0000-0000-000000000105', 'infra-worker', 'service', 'Infra Worker', 'services/node/infra-worker', 'ops-agent', ARRAY['job.failed', 'trend.batch_ready', 'scheduler.drift']),
  ('00000000-0000-0000-0000-000000000106', 'ytdlp', 'service', 'ytdlp', 'services/python/ytdlp', 'ops-agent', ARRAY['extract.failed', 'extract.latency_spike'])
ON CONFLICT (slug) DO UPDATE SET
  system_kind = EXCLUDED.system_kind,
  display_name = EXCLUDED.display_name,
  repo_path = EXCLUDED.repo_path,
  owner_agent_slug = EXCLUDED.owner_agent_slug,
  emits = EXCLUDED.emits,
  updated_at = NOW();

INSERT INTO office_events (
  id, source_id, event_type, severity, title, summary, payload, project_slug, dedupe_key, occurred_at, ingested_at
) VALUES
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'generation.failed', 'critical', 'Avatar queue failure spike', 'Persona Studio avatar jobs failed 7 times in 20 minutes after worker restart.', '{"jobFailures":7,"windowMinutes":20}'::jsonb, 'persona-studio', 'seed:generation.failed:persona-studio', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '9 minutes'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000103', 'lead.hot', 'high', 'Hot lead waiting 34 minutes', 'TG Agent marked a buyer-intent lead as hot and owner reply is still pending.', '{"waitMinutes":34}'::jsonb, 'tg-agent', 'seed:lead.hot:tg-agent', NOW() - INTERVAL '34 minutes', NOW() - INTERVAL '33 minutes'),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000105', 'trend.batch_ready', 'medium', 'Viral Discover found 12 creator hooks', 'Research batch produced 3 high-confidence hook patterns for AI creator positioning.', '{"hooks":12,"highConfidence":3}'::jsonb, 'viral-discover', 'seed:trend.batch_ready:infra-worker', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '110 minutes'),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000106', 'extract.latency_spike', 'low', 'yt-dlp extraction slower than baseline', 'Median extraction time is up 42% over the last 3 hours.', '{"latencyIncreasePct":42}'::jsonb, 'transcribe', 'seed:extract.latency_spike:ytdlp', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '170 minutes')
ON CONFLICT (id) DO NOTHING;

INSERT INTO office_tasks (
  id, kind, status, priority, title, summary, description, project_slug, owner_agent_slug, source_event_id, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000301', 'incident_investigation', 'in_progress', 'p0', 'Investigate Persona Studio worker failures', 'Check BullMQ queue backlog, Gemini provider errors, and refund exposure.', 'Run failure triage and decide if traffic should be paused.', 'persona-studio', 'ops-agent', '00000000-0000-0000-0000-000000000201', NOW() - INTERVAL '9 minutes', NOW() - INTERVAL '5 minutes'),
  ('00000000-0000-0000-0000-000000000302', 'lead_handoff', 'waiting_approval', 'p1', 'Prepare manual reply for hot TG lead', 'Lead asked about paid rollout timeline and team onboarding.', 'Draft the owner reply or take over the conversation directly.', 'tg-agent', 'sales-agent', '00000000-0000-0000-0000-000000000202', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '20 minutes'),
  ('00000000-0000-0000-0000-000000000303', 'growth_translation', 'triaged', 'p2', 'Convert Viral Discover findings into 3 content bets', 'Map trending hooks into short-form content plan for the week.', 'Turn research output into a concrete creator content brief.', 'ai-content-factory', 'growth-agent', '00000000-0000-0000-0000-000000000203', NOW() - INTERVAL '100 minutes', NOW() - INTERVAL '90 minutes'),
  ('00000000-0000-0000-0000-000000000304', 'regression_note', 'new', 'p3', 'Document ytdlp latency regression', 'Capture before/after metrics and decide whether it needs an incident record.', 'Create a note for future infra tuning and possible postmortem.', 'transcribe', 'ops-agent', '00000000-0000-0000-0000-000000000204', NOW() - INTERVAL '160 minutes', NOW() - INTERVAL '160 minutes')
ON CONFLICT (id) DO NOTHING;

INSERT INTO office_decisions (
  id, title, summary, status, project_slug, requested_by_agent_slug, source_task_id, recommended_option_key, resolved_option_key, requested_at, resolved_at, resolution_note
) VALUES
  ('00000000-0000-0000-0000-000000000401', 'Pause paid Persona Studio traffic for 24 hours?', 'Failure spike affects paid avatar generations and refund exposure is growing.', 'pending', 'persona-studio', 'chief-of-staff', '00000000-0000-0000-0000-000000000301', 'pause_24h', NULL, NOW() - INTERVAL '7 minutes', NULL, NULL),
  ('00000000-0000-0000-0000-000000000402', 'Take over the hot TG lead manually?', 'Sales Agent suggests direct owner reply instead of AI continuation.', 'pending', 'tg-agent', 'sales-agent', '00000000-0000-0000-0000-000000000302', 'manual_takeover', NULL, NOW() - INTERVAL '25 minutes', NULL, NULL),
  ('00000000-0000-0000-0000-000000000403', 'Turn this week into a Persona Studio reliability sprint?', 'Product Agent sees reliability as the main blocker for monetization confidence.', 'deferred', 'persona-studio', 'product-agent', '00000000-0000-0000-0000-000000000301', 'shift_focus', 'split_focus', NOW() - INTERVAL '1 day', NOW() - INTERVAL '12 hours', 'Keep monetization work moving, but reserve one focused reliability block.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO office_decision_options (
  decision_id, option_key, label, tradeoffs, is_recommended
) VALUES
  ('00000000-0000-0000-0000-000000000401', 'pause_24h', 'Pause for 24h', 'Reduces refund exposure, but slows revenue.', TRUE),
  ('00000000-0000-0000-0000-000000000401', 'watch_2h', 'Watch 2h', 'Keeps traffic on while validating if spike is transient.', FALSE),
  ('00000000-0000-0000-0000-000000000401', 'keep_running', 'Keep running', 'Protects momentum, but risks customer frustration.', FALSE),
  ('00000000-0000-0000-0000-000000000402', 'manual_takeover', 'Manual takeover', 'Best odds for conversion, but needs founder time.', TRUE),
  ('00000000-0000-0000-0000-000000000402', 'draft_reply_only', 'Draft only', 'Saves time, but still delays human judgment.', FALSE),
  ('00000000-0000-0000-0000-000000000402', 'let_ai_continue', 'Let AI continue', 'Fastest path, but weaker for a hot lead.', FALSE),
  ('00000000-0000-0000-0000-000000000403', 'shift_focus', 'Reliability sprint', 'Fastest quality recovery, but pauses other bets.', TRUE),
  ('00000000-0000-0000-0000-000000000403', 'split_focus', 'Split focus', 'Balanced approach, but slower to reduce incidents.', FALSE),
  ('00000000-0000-0000-0000-000000000403', 'keep_current_plan', 'Keep current plan', 'No disruption, but reliability risk stays high.', FALSE)
ON CONFLICT (decision_id, option_key) DO UPDATE SET
  label = EXCLUDED.label,
  tradeoffs = EXCLUDED.tradeoffs,
  is_recommended = EXCLUDED.is_recommended;

INSERT INTO office_memory_entries (
  id, kind, title, summary, body_markdown, project_slug, tags, importance, created_by_agent_slug, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000501', 'incident', 'Persona Studio queue instability after worker restart', 'Worker restarts can create retry storms and hide refund exposure unless queue state is checked first.', 'Check queue state before restarting workers and record refund impact in the incident notes.', 'persona-studio', ARRAY['bullmq', 'incident', 'refunds'], 90, 'ops-agent', NOW() - INTERVAL '6 days', NOW()),
  ('00000000-0000-0000-0000-000000000502', 'research', 'Creator trend: "AI clone, but with my own face" hook keeps outperforming tooling-first framing', 'Trend batches show stronger response to identity transformation than generic automation language.', 'Use creator identity hooks first, then explain the workflow underneath.', 'persona-studio', ARRAY['hooks', 'positioning', 'creator'], 80, 'research-agent', NOW() - INTERVAL '2 days', NOW()),
  ('00000000-0000-0000-0000-000000000503', 'customer_voice', 'Support pain cluster: users want faster explanation of token spend before generation starts', 'Users understand output value, but not pricing timing and refund behavior.', 'Pre-generation pricing language needs to be clearer and closer to the CTA.', 'persona-studio', ARRAY['billing', 'ux', 'support'], 75, 'support-agent', NOW() - INTERVAL '3 days', NOW()),
  ('00000000-0000-0000-0000-000000000504', 'weekly_review', 'Week 23 review', 'Biggest opportunity came from tighter handoff between research, growth, and product reliability.', 'Weekly review summary for the founder office.', 'portfolio', ARRAY['weekly', 'ceo', 'review'], 70, 'chief-of-staff', NOW() - INTERVAL '5 days', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO office_journal_entries (
  id, entity_kind, entity_id, action_kind, actor_type, actor_id, narrative, metadata, created_at
) VALUES
  ('00000000-0000-0000-0000-000000000601', 'office_event', '00000000-0000-0000-0000-000000000201', 'event.ingested', 'agent', 'ops-agent', 'Ops Agent captured a critical failure spike from Persona Studio workers.', '{"source":"persona-studio"}'::jsonb, NOW() - INTERVAL '10 minutes'),
  ('00000000-0000-0000-0000-000000000602', 'office_task', '00000000-0000-0000-0000-000000000301', 'task.created', 'agent', 'chief-of-staff', 'Chief of Staff created a p0 investigation task for the failure spike.', '{"priority":"p0"}'::jsonb, NOW() - INTERVAL '9 minutes'),
  ('00000000-0000-0000-0000-000000000603', 'office_decision', '00000000-0000-0000-0000-000000000401', 'decision.requested', 'agent', 'chief-of-staff', 'Chief of Staff opened a decision to pause paid traffic for 24 hours.', '{"recommended":"pause_24h"}'::jsonb, NOW() - INTERVAL '7 minutes'),
  ('00000000-0000-0000-0000-000000000604', 'office_memory', '00000000-0000-0000-0000-000000000502', 'memory.created', 'agent', 'research-agent', 'Research Agent stored a new high-performing positioning pattern from Viral Discover.', '{"kind":"research"}'::jsonb, NOW() - INTERVAL '2 hours')
ON CONFLICT (id) DO NOTHING;

INSERT INTO office_daily_briefs (
  id, brief_date, channel, summary, priorities_json, risks_json, decisions_json, created_by_agent_slug, created_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000701',
    CURRENT_DATE,
    'web-office',
    'Persona Studio reliability + sales follow-up discipline',
    '["Investigate avatar queue failures","Reply to hot TG lead","Turn trend batch into content bets"]'::jsonb,
    '["Refund exposure from failed paid generations","Manual lead response lag"]'::jsonb,
    '["Pause paid Persona Studio traffic for 24 hours?","Take over the hot TG lead manually?"]'::jsonb,
    'chief-of-staff',
    NOW()
  )
ON CONFLICT (brief_date, channel) DO UPDATE SET
  summary = EXCLUDED.summary,
  priorities_json = EXCLUDED.priorities_json,
  risks_json = EXCLUDED.risks_json,
  decisions_json = EXCLUDED.decisions_json,
  created_by_agent_slug = EXCLUDED.created_by_agent_slug;
