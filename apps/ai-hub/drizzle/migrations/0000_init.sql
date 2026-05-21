-- Initial schema. Generated to match src/lib/db/schema.ts
-- Run with `npm run db:migrate` (or apply manually via psql).
--
-- This file is canonical for now. After Stage 2 you should switch to
-- drizzle-kit generated migrations (`npm run db:generate`).

create extension if not exists "pgcrypto";

-- ====== Auth.js core ====================================================
create table if not exists "users" (
  "id"            text primary key,
  "email"         text not null unique,
  "emailVerified" timestamp,
  "name"          text,
  "image"         text,
  "role"          text not null default 'user' check (role in ('user','admin')),
  "created_at"    timestamp not null default now()
);

create table if not exists "accounts" (
  "userId"            text not null references "users"("id") on delete cascade,
  "type"              text not null,
  "provider"          text not null,
  "providerAccountId" text not null,
  "refresh_token"     text,
  "access_token"      text,
  "expires_at"        integer,
  "token_type"        text,
  "scope"             text,
  "id_token"          text,
  "session_state"     text,
  primary key ("provider", "providerAccountId")
);

create table if not exists "sessions" (
  "sessionToken" text primary key,
  "userId"       text not null references "users"("id") on delete cascade,
  "expires"      timestamp not null
);

create table if not exists "verification_tokens" (
  "identifier" text not null,
  "token"      text not null,
  "expires"    timestamp not null,
  primary key ("identifier", "token")
);

-- ====== Wallet ==========================================================
create table if not exists "token_wallets" (
  "id"              uuid primary key default gen_random_uuid(),
  "user_id"         text not null unique references "users"("id") on delete cascade,
  "available"       bigint not null default 0 check (available >= 0),
  "reserved"        bigint not null default 0 check (reserved  >= 0),
  "total_purchased" bigint not null default 0,
  "total_spent"     bigint not null default 0,
  "created_at"      timestamp not null default now(),
  "updated_at"      timestamp not null default now()
);

create table if not exists "token_transactions" (
  "id"            uuid primary key default gen_random_uuid(),
  "user_id"       text not null references "users"("id") on delete cascade,
  "type"          text not null check (type in ('purchase','spend','refund','bonus','reserve','release','adjustment')),
  "amount"        bigint not null,
  "balance_after" bigint not null,
  "tool_id"       uuid,
  "job_id"        uuid,
  "payment_id"    uuid,
  "description"   text,
  "metadata"      jsonb not null default '{}'::jsonb,
  "created_at"    timestamp not null default now()
);
create index if not exists token_tx_user_created_idx on "token_transactions"("user_id","created_at" desc);
create index if not exists token_tx_job_idx          on "token_transactions"("job_id");
create index if not exists token_tx_type_idx         on "token_transactions"("type");

-- ====== AI tools ========================================================
create table if not exists "ai_tools" (
  "id"            uuid primary key default gen_random_uuid(),
  "slug"          text not null unique,
  "name"          text not null,
  "description"   text,
  "category"      text not null check (category in ('image','video','audio','face','content','analysis')),
  "provider"      text not null check (provider in ('fal','replicate','kling','runware','modelslab','internal')),
  "model"         text not null,
  "token_cost"    integer not null check (token_cost > 0),
  "input_schema"  jsonb not null default '{}'::jsonb,
  "output_schema" jsonb not null default '{}'::jsonb,
  "example"       jsonb,
  "limits"        jsonb not null default '{}'::jsonb,
  "status"        text not null default 'active' check (status in ('active','beta','disabled')),
  "sort_order"    integer not null default 100,
  "created_at"    timestamp not null default now(),
  "updated_at"    timestamp not null default now()
);
create index if not exists ai_tools_category_idx on "ai_tools"("category");
create index if not exists ai_tools_status_idx   on "ai_tools"("status");

-- ====== AI jobs =========================================================
create table if not exists "ai_jobs" (
  "id"                uuid primary key default gen_random_uuid(),
  "user_id"           text not null references "users"("id") on delete cascade,
  "tool_id"           uuid not null references "ai_tools"("id") on delete restrict,
  "provider"          text not null,
  "model"             text not null,
  "status"            text not null default 'pending'
                      check (status in ('pending','queued','processing','completed','failed','refunded','cancelled')),
  "input"             jsonb not null default '{}'::jsonb,
  "output"            jsonb,
  "cost_tokens"       integer not null,
  "charged_tokens"    integer,
  "provider_job_id"   text,
  "provider_cost_usd" numeric(10,4),
  "error_code"        text,
  "error_message"     text,
  "retry_count"       integer not null default 0,
  "idempotency_key"   text,
  "created_at"        timestamp not null default now(),
  "started_at"        timestamp,
  "completed_at"      timestamp,
  "updated_at"        timestamp not null default now()
);
create index if not exists ai_jobs_user_created_idx   on "ai_jobs"("user_id","created_at" desc);
create index if not exists ai_jobs_status_idx         on "ai_jobs"("status") where status in ('pending','queued','processing');
create index if not exists ai_jobs_provider_jobid_idx on "ai_jobs"("provider","provider_job_id") where provider_job_id is not null;
create unique index if not exists ai_jobs_idem_idx    on "ai_jobs"("user_id","idempotency_key") where idempotency_key is not null;

-- ====== Media ===========================================================
create table if not exists "media_assets" (
  "id"            uuid primary key default gen_random_uuid(),
  "user_id"       text not null references "users"("id") on delete cascade,
  "job_id"        uuid references "ai_jobs"("id") on delete set null,
  "type"          text not null check (type in ('image','video','audio','text')),
  "storage_path"  text not null,
  "url"           text,
  "thumbnail_url" text,
  "mime_type"     text,
  "size_bytes"    bigint,
  "width"         integer,
  "height"        integer,
  "duration_ms"   integer,
  "metadata"      jsonb not null default '{}'::jsonb,
  "is_favorite"   boolean not null default false,
  "created_at"    timestamp not null default now()
);
create index if not exists media_user_created_idx on "media_assets"("user_id","created_at" desc);
create index if not exists media_job_idx          on "media_assets"("job_id");

-- ====== Payments ========================================================
create table if not exists "payment_packages" (
  "id"              uuid primary key default gen_random_uuid(),
  "slug"            text not null unique,
  "name"            text not null,
  "tokens"          integer not null check (tokens > 0),
  "bonus_tokens"    integer not null default 0,
  "price_cents"     integer not null check (price_cents > 0),
  "currency"        text not null default 'USD',
  "stripe_price_id" text,
  "is_active"       boolean not null default true,
  "sort_order"      integer not null default 100,
  "created_at"      timestamp not null default now()
);

create table if not exists "payments" (
  "id"                  uuid primary key default gen_random_uuid(),
  "user_id"             text not null references "users"("id") on delete cascade,
  "package_id"          uuid references "payment_packages"("id"),
  "provider"            text not null check (provider in ('stripe','paddle','yookassa','cloudpayments','manual')),
  "provider_payment_id" text,
  "amount_cents"        integer not null,
  "currency"            text not null,
  "tokens_to_add"       integer not null,
  "status"              text not null default 'pending' check (status in ('pending','succeeded','failed','refunded','cancelled')),
  "metadata"            jsonb not null default '{}'::jsonb,
  "created_at"          timestamp not null default now(),
  "completed_at"        timestamp
);
create index if not exists payments_user_created_idx on "payments"("user_id","created_at" desc);
create index if not exists payments_provider_id_idx  on "payments"("provider","provider_payment_id");

create table if not exists "promo_codes" (
  "id"              uuid primary key default gen_random_uuid(),
  "code"            text not null unique,
  "bonus_tokens"    integer not null check (bonus_tokens > 0),
  "max_redemptions" integer,
  "redemptions"     integer not null default 0,
  "expires_at"      timestamp,
  "is_active"       boolean not null default true,
  "created_at"      timestamp not null default now()
);

create table if not exists "promo_redemptions" (
  "id"           uuid primary key default gen_random_uuid(),
  "promo_id"     uuid not null references "promo_codes"("id"),
  "user_id"      text not null references "users"("id") on delete cascade,
  "bonus_tokens" integer not null,
  "created_at"   timestamp not null default now()
);
create unique index if not exists promo_redemptions_unique on "promo_redemptions"("promo_id","user_id");

-- ====== updated_at touch ================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists wallets_touch on "token_wallets";
create trigger wallets_touch before update on "token_wallets"
  for each row execute function public.touch_updated_at();

drop trigger if exists tools_touch on "ai_tools";
create trigger tools_touch before update on "ai_tools"
  for each row execute function public.touch_updated_at();

drop trigger if exists jobs_touch on "ai_jobs";
create trigger jobs_touch before update on "ai_jobs"
  for each row execute function public.touch_updated_at();
