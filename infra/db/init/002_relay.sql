-- ═══════════════════════════════════════════════════════════════════
-- 002_relay.sql — Phase 5 · Commit 4 (subscriber relay flow)
-- ───────────────────────────────────────────────────────────────────
-- Tracks inbound messages from subscribers, owner approval state,
-- AI-drafted replies, and the linked voice generation.
--
-- On fresh DBs this runs automatically alongside 001_schema.sql via
-- docker-entrypoint-initdb.d. To apply to an already-running DB:
--   docker exec -i infra-postgres-1 psql -U aio -d aio < 002_relay.sql
-- ═══════════════════════════════════════════════════════════════════

create table if not exists voice_relay_inbound (
  id                     uuid primary key default gen_random_uuid(),
  owner_handle           text not null,
  subscriber_chat_id     bigint not null,
  subscriber_user_id     bigint,
  subscriber_username    text,
  subscriber_message_id  bigint,
  inbound_text           text not null,
  status                 text not null default 'pending',
    -- pending | drafted | voice_ready | sent | rejected | ignored
  draft_text             text,
  voice_generation_id    uuid references voice_generations(id) on delete set null,
  approval_message_id    bigint,
    -- TG message_id of the approval bubble the bot showed to owner
  meta                   jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists voice_relay_inbound_owner_status_idx
  on voice_relay_inbound (owner_handle, status, created_at desc);

create index if not exists voice_relay_inbound_subscriber_idx
  on voice_relay_inbound (subscriber_chat_id, created_at desc);

-- Auto-update updated_at on row change
create or replace function voice_relay_inbound_touch()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists voice_relay_inbound_touch_trg on voice_relay_inbound;
create trigger voice_relay_inbound_touch_trg
  before update on voice_relay_inbound
  for each row execute function voice_relay_inbound_touch();
