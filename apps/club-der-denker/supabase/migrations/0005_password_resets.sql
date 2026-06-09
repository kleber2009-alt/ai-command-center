-- Password reset codes (Stage 1: email login completeness).
-- A short-lived 6-digit code is emailed; only its hash is stored.
create table cdd_password_resets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references cdd_users(id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index cdd_password_resets_user_idx on cdd_password_resets(user_id);
create index cdd_password_resets_expires_idx on cdd_password_resets(expires_at);
