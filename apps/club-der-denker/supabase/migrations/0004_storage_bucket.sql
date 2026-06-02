-- Media storage for course items and community posts (spec 6: media files).
-- A public bucket keeps reads simple (unguessable random object paths);
-- uploads go through the admin API using the service role, which bypasses RLS.
--
-- NOTE: for strictly gated paid media, switch `public` to false and serve
-- per-request signed URLs instead.
insert into storage.buckets (id, name, public)
values ('cdd-media', 'cdd-media', true)
on conflict (id) do nothing;
