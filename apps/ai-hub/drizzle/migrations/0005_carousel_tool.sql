-- Carousel tool — alias for kie/nano-banana-2 backend, surfaced as the
-- 5th nav button in the Hub. UX-wise identical to /play/nano-banana-2:
-- prompt + up to 14 reference images + aspect_ratio + resolution + format,
-- one image per Run. Repeat with the same inputs to produce carousel slides
-- in a consistent style.
--
-- Idempotent: ON CONFLICT (slug) DO UPDATE keeps re-running this migration
-- safe; rerun after editing description/cost without churning history.

insert into "ai_tools" (slug, name, description, category, provider, model, token_cost, input_schema, status, sort_order)
values
  ('carousel', 'Карусель',
   'Слайды для Instagram-карусели в едином стиле. Загрузи до 14 референсов, задай промпт — каждый Run даёт один слайд. Под капотом — Google Gemini 2.5 Flash Image (Nano Banana 2 через kie.ai), та же модель, что и /play/nano-banana-2.',
   'image', 'kie', 'nano-banana-2', 12,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('prompt'),
     'properties', jsonb_build_object(
       'prompt', jsonb_build_object('type','string','minLength',3,'maxLength',2000),
       'image_input', jsonb_build_object(
         'type','array',
         'items', jsonb_build_object('type','string','format','uri'),
         'maxItems',14
       ),
       'aspect_ratio', jsonb_build_object(
         'type','string',
         'enum', jsonb_build_array('Auto','1:1','16:9','9:16','4:3','3:4'),
         'default','Auto'
       ),
       'resolution', jsonb_build_object(
         'type','string',
         'enum', jsonb_build_array('1K','2K','4K'),
         'default','1K'
       ),
       'output_format', jsonb_build_object(
         'type','string',
         'enum', jsonb_build_array('JPG','PNG'),
         'default','JPG'
       )
     )),
   'active', 2)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  provider = excluded.provider,
  model = excluded.model,
  token_cost = excluded.token_cost,
  input_schema = excluded.input_schema,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = now();
