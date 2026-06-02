-- Store each user's most recent IANA time zone so the inactivity sweep can
-- compute their local day without scanning progress rows. Updated on every
-- course answer (the client sends its current tz).
alter table cdd_users add column if not exists last_tz text not null default 'UTC';
