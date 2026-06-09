-- Club Der Denker — universal course engine
-- Initial schema (Postgres / Supabase)
-- All business rules are enforced here where cheap, and in src/lib/* where they need logic.

-- =====================================================================
-- ENUMS
-- =====================================================================

create type cdd_locale as enum ('de', 'en', 'ru', 'es', 'fr', 'it'); -- 6 languages (i18n)

create type cdd_item_kind as enum (
  'free',       -- one of the 3 anonymous free-funnel elements
  'case',       -- the practical case shown after the free phase
  'course'      -- one of the 112 paid course elements
);

create type cdd_media_kind as enum ('text', 'image', 'video');

create type cdd_user_status as enum ('guest', 'lead', 'active', 'blocked');

create type cdd_product_kind as enum (
  'course_access',        -- Product 1: non-consumable IAP
  'community_subscription'-- Product 2: auto-renewing monthly subscription
);

create type cdd_purchase_platform as enum ('apple', 'google', 'web');

create type cdd_purchase_status as enum ('pending', 'active', 'expired', 'refunded', 'revoked');

-- =====================================================================
-- USERS / LEADS
-- The funnel creates an anonymous lead first (email only), then on paid
-- account creation it is promoted to a full user (password set).
-- =====================================================================

create table cdd_users (
  id              uuid primary key default gen_random_uuid(),
  email           text unique not null,
  password_hash   text,                      -- null until Step 7 (account creation)
  status          cdd_user_status not null default 'lead',
  display_name    text,
  locale          cdd_locale not null default 'de',
  -- progress engine
  items_completed int not null default 0,    -- total course items completed (drives levels)
  level           int not null default 1 check (level between 1 and 5),
  -- streak / joker
  streak_days     int not null default 0,
  joker_available boolean not null default false, -- granted once on course purchase
  joker_used      boolean not null default false,
  last_active_day date,                       -- last local day the user completed items
  -- community read access window
  community_access_until timestamptz,         -- purchase date + 28 days
  -- auth providers
  google_sub      text unique,
  apple_sub       text unique,
  -- gdpr
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz                 -- soft delete for GDPR account removal
);

create index cdd_users_status_idx on cdd_users(status);
create index cdd_users_created_idx on cdd_users(created_at);

-- Lead funnel analytics: which funnel variant the anonymous user chose (A/B).
create table cdd_lead_events (
  id          bigserial primary key,
  user_id     uuid references cdd_users(id) on delete cascade,
  device_id   text,                            -- anonymous device identifier pre-email
  step        text not null,                   -- 'start','free_answer','case','branch_a','branch_b','email','purchase'
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index cdd_lead_events_user_idx on cdd_lead_events(user_id);
create index cdd_lead_events_step_idx on cdd_lead_events(step);

-- =====================================================================
-- COURSE CONTENT
-- 112 course items + 3 free items + 1 case. Each item is localized.
-- Hard invariant: exactly 4 course items per day_index, day_index 1..28.
-- =====================================================================

create table cdd_items (
  id          uuid primary key default gen_random_uuid(),
  kind        cdd_item_kind not null,
  -- ordering: for 'course', global_order 1..112 and day_index 1..28 / slot 1..4.
  global_order int,                            -- 1..112 for course, 1..3 for free, null for case
  day_index   int,                             -- 1..28 for course items
  day_slot    int,                             -- 1..4 within a day
  media_kind  cdd_media_kind not null default 'text',
  media_url   text,                            -- image/video asset url
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint cdd_items_course_shape check (
    kind <> 'course' or (global_order between 1 and 112
                          and day_index between 1 and 28
                          and day_slot between 1 and 4)
  ),
  constraint cdd_items_free_shape check (
    kind <> 'free' or (global_order between 1 and 3)
  )
);

create unique index cdd_items_course_order_uq
  on cdd_items(global_order) where kind = 'course';
create unique index cdd_items_course_day_slot_uq
  on cdd_items(day_index, day_slot) where kind = 'course';
create unique index cdd_items_free_order_uq
  on cdd_items(global_order) where kind = 'free';

-- Localized body + answer options per item per locale.
create table cdd_item_translations (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references cdd_items(id) on delete cascade,
  locale      cdd_locale not null,
  body        text not null,                   -- display content (markdown allowed)
  -- multiple choice: 3-4 options, exactly one rationale of feedback per option
  options     jsonb not null default '[]',     -- [{ "key":"a", "label":"...", "feedback":"..." }]
  unique (item_id, locale)
);

-- =====================================================================
-- PROGRESS
-- One row per answered item. Drives items_completed and streak.
-- =====================================================================

create table cdd_progress (
  id            bigserial primary key,
  user_id       uuid not null references cdd_users(id) on delete cascade,
  item_id       uuid not null references cdd_items(id) on delete cascade,
  selected_key  text,                          -- which option the user picked
  -- correctness is irrelevant to levels but stored for analytics
  is_correct    boolean,
  local_day     date not null,                 -- local (device-tz) calendar day of completion
  local_tz      text not null,                 -- IANA tz captured at completion
  created_at    timestamptz not null default now(),
  unique (user_id, item_id)
);

create index cdd_progress_user_idx on cdd_progress(user_id);
create index cdd_progress_user_day_idx on cdd_progress(user_id, local_day);

-- =====================================================================
-- COMMUNITY FEED (read-only)
-- Admin-authored posts only. No user actions.
-- =====================================================================

create table cdd_feed_categories (
  id      uuid primary key default gen_random_uuid(),
  slug    text unique not null,
  sort    int not null default 0
);

create table cdd_feed_category_translations (
  category_id uuid not null references cdd_feed_categories(id) on delete cascade,
  locale      cdd_locale not null,
  name        text not null,
  primary key (category_id, locale)
);

create table cdd_feed_posts (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references cdd_feed_categories(id) on delete set null,
  media_kind   cdd_media_kind not null default 'text',
  media_url    text,
  published_at timestamptz,                     -- null = draft
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table cdd_feed_post_translations (
  post_id  uuid not null references cdd_feed_posts(id) on delete cascade,
  locale   cdd_locale not null,
  title    text not null,
  body     text not null,
  primary key (post_id, locale)
);

create index cdd_feed_posts_published_idx on cdd_feed_posts(published_at);

-- =====================================================================
-- PAYMENTS / IAP
-- Server-side receipt validation results + access flags.
-- Card/payment data is NEVER stored here (PCI-DSS via store interfaces).
-- =====================================================================

create table cdd_purchases (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references cdd_users(id) on delete cascade,
  product             cdd_product_kind not null,
  platform            cdd_purchase_platform not null,
  status              cdd_purchase_status not null default 'pending',
  -- opaque store identifiers, never raw card data
  store_transaction_id text,
  original_transaction_id text,                 -- for subscription renewals
  receipt_ref         text,                     -- pointer/hash to validated receipt, not card data
  purchased_at        timestamptz,
  expires_at          timestamptz,              -- for subscription
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (platform, store_transaction_id)
);

create index cdd_purchases_user_idx on cdd_purchases(user_id);

-- Raw webhook log for Apple/Google/web server notifications (idempotency + audit).
create table cdd_iap_webhooks (
  id            bigserial primary key,
  platform      cdd_purchase_platform not null,
  event_type    text,
  signature_ok  boolean not null default false,
  raw           jsonb not null,
  processed_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- =====================================================================
-- ADMIN
-- =====================================================================

create table cdd_admins (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- updated_at trigger helper
create or replace function cdd_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger cdd_users_touch before update on cdd_users
  for each row execute function cdd_touch_updated_at();
create trigger cdd_items_touch before update on cdd_items
  for each row execute function cdd_touch_updated_at();
create trigger cdd_feed_posts_touch before update on cdd_feed_posts
  for each row execute function cdd_touch_updated_at();
create trigger cdd_purchases_touch before update on cdd_purchases
  for each row execute function cdd_touch_updated_at();
