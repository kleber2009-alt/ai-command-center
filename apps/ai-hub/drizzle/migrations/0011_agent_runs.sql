-- Multi-agent v1 infra.
--   agent_runs   — one row per agent invocation. Linked to ai_jobs via job_id
--                  so wallet/refund/queue infra is reused.
--   agent_events — phase-by-phase event log. SSE endpoint tails this table.

CREATE TABLE IF NOT EXISTS agent_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id       uuid REFERENCES ai_jobs(id) ON DELETE SET NULL,
  agent_type   text NOT NULL,                                 -- 'reels-agent-v1'
  status       text NOT NULL DEFAULT 'pending',               -- pending|running|completed|failed
  input        jsonb NOT NULL DEFAULT '{}'::jsonb,
  output       jsonb,
  error_message text,
  created_at   timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);
CREATE INDEX IF NOT EXISTS agent_runs_user_idx ON agent_runs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigserial NOT NULL,                             -- monotonic order key for SSE polling
  run_id      uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  phase       text NOT NULL,                                  -- 'strategist'|'hook_writer'|'visual_director'|'copywriter'|'qa'|'finalize'
  event_type  text NOT NULL,                                  -- 'phase_started'|'phase_thinking'|'phase_progress'|'phase_completed'|'phase_failed'|'run_completed'|'run_failed'
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_events_run_idx ON agent_events (run_id, seq);
