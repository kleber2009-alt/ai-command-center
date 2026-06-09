-- Example seed (NON-content): structural placeholders only, so the engine and
-- admin can be exercised end-to-end. Real course content is entered via the
-- admin panel and is intentionally NOT stored in the repo.
--
-- Inserts: 3 free items, 1 case, and the full 112-item course skeleton
-- (28 days × 4 slots) with empty German translations to fill in later.

-- Free items 1..3
insert into cdd_items (kind, global_order, media_kind)
select 'free', g, 'text' from generate_series(1, 3) as g;

-- Practical case
insert into cdd_items (kind, media_kind) values ('case', 'text');

-- 112 course items, day_index 1..28, day_slot 1..4, global_order 1..112
insert into cdd_items (kind, global_order, day_index, day_slot, media_kind)
select 'course',
       n,
       ((n - 1) / 4) + 1,            -- day_index 1..28
       ((n - 1) % 4) + 1,            -- day_slot 1..4
       'text'
from generate_series(1, 112) as n;

-- Empty 'de' translations so rows are visible/editable in the admin panel.
insert into cdd_item_translations (item_id, locale, body, options)
select id, 'de', '', '[]'::jsonb from cdd_items;

-- A starter feed category.
insert into cdd_feed_categories (slug, sort) values ('allgemein', 0);
insert into cdd_feed_category_translations (category_id, locale, name)
select id, 'de', 'Allgemein' from cdd_feed_categories where slug = 'allgemein';
