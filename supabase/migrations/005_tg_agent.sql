-- tg-agent (apps/tg-agent) — chats, users, messages, lead statuses.
-- Run in the Supabase SQL editor.
--
-- Idempotent: uses IF NOT EXISTS so re-running is safe.

create table if not exists tg_chats (
  chat_id        bigint primary key,
  title          text,
  -- kill switch: when false, the bot logs and classifies but does not reply
  -- and does not send owner notifications. /admin will toggle this per chat.
  auto_reply     boolean      not null default true,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

create table if not exists tg_users (
  chat_id              bigint not null,
  user_id              bigint not null,
  username             text,
  first_name           text,
  last_name            text,
  -- new | cold | warm | hot | buyer | support | negative
  status               text   not null default 'new',
  status_updated_at    timestamptz not null default now(),
  last_seen_at         timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create index if not exists tg_users_status_idx on tg_users (status);
create index if not exists tg_users_last_seen_idx on tg_users (last_seen_at desc);

create table if not exists tg_messages (
  id                     bigserial primary key,
  chat_id                bigint not null,
  user_id                bigint,
  telegram_message_id    bigint not null,
  text                   text   not null,
  class                  text,
  confidence             real,
  action                 text,
  reasoning              text,
  -- the response the bot actually sent (null when action did not produce one)
  response               text,
  created_at             timestamptz not null default now()
);

create index if not exists tg_messages_chat_created_idx
  on tg_messages (chat_id, created_at desc);
create index if not exists tg_messages_user_created_idx
  on tg_messages (chat_id, user_id, created_at desc);
create index if not exists tg_messages_class_idx
  on tg_messages (class);
