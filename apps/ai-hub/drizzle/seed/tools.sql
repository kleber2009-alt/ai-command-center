-- Seed data. Run via `npm run db:seed`.
-- Field names in input_schema MUST match the provider's API contract exactly —
-- the runner passes the form values straight through to the adapter.

insert into "ai_tools" (slug, name, description, category, provider, model, token_cost, input_schema, status, sort_order)
values
  ('text-to-image', 'Text → Image',
   'Сгенерировать изображение из текстового описания (FLUX-1 dev).',
   'image', 'fal', 'fal-ai/flux/dev', 5,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('prompt'),
     'properties', jsonb_build_object(
       'prompt', jsonb_build_object('type','string','minLength',3,'maxLength',2000),
       'image_size', jsonb_build_object('type','string',
         'enum', jsonb_build_array('square_hd','square','portrait_4_3','portrait_16_9','landscape_4_3','landscape_16_9'),
         'default','square_hd'),
       'num_images', jsonb_build_object('type','integer','minimum',1,'maximum',4,'default',1)
     )), 'active', 10),

  ('image-edit', 'Image Edit',
   'Отредактировать существующее изображение по инструкции (FLUX Pro Kontext).',
   'image', 'fal', 'fal-ai/flux-pro/kontext', 8,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('image_url','prompt'),
     'properties', jsonb_build_object(
       'image_url', jsonb_build_object('type','string','format','uri'),
       'prompt', jsonb_build_object('type','string','minLength',3,'maxLength',1000)
     )), 'active', 20),

  ('image-upscale', 'Image Upscale',
   'Увеличить разрешение фото без потери качества (Real-ESRGAN, до 10x).',
   'image', 'replicate', 'nightmareai/real-esrgan', 3,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('image'),
     'properties', jsonb_build_object(
       'image', jsonb_build_object('type','string','format','uri'),
       'scale', jsonb_build_object('type','integer','minimum',2,'maximum',10,'default',4),
       'face_enhance', jsonb_build_object('type','boolean','default',false)
     )), 'active', 30),

  ('background-remove', 'Background Remover',
   'Убрать фон с изображения (BiRefNet v2).',
   'image', 'fal', 'fal-ai/birefnet/v2', 2,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('image_url'),
     'properties', jsonb_build_object(
       'image_url', jsonb_build_object('type','string','format','uri')
     )), 'active', 40),

  -- Kling 1.6 идёт через fal.ai (не нужен отдельный JWT-адаптер) —
  -- fal проксирует Kling и подписывает результат своим webhook'ом.
  ('image-to-video', 'Image → Video',
   'Анимировать статичное изображение (Kling 1.6 через fal.ai, 5 sec).',
   'video', 'fal', 'fal-ai/kling-video/v1.6/standard/image-to-video', 80,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('image_url'),
     'properties', jsonb_build_object(
       'image_url', jsonb_build_object('type','string','format','uri'),
       'prompt', jsonb_build_object('type','string','maxLength',500),
       'duration', jsonb_build_object('type','string','enum', jsonb_build_array('5','10'),'default','5'),
       'aspect_ratio', jsonb_build_object('type','string','enum', jsonb_build_array('16:9','9:16','1:1'),'default','16:9')
     )), 'active', 50),

  ('text-to-video', 'Text → Video',
   'Видео из текстового описания (Kling 1.6 через fal.ai, 5 sec).',
   'video', 'fal', 'fal-ai/kling-video/v1.6/standard/text-to-video', 100,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('prompt'),
     'properties', jsonb_build_object(
       'prompt', jsonb_build_object('type','string','minLength',5,'maxLength',2000),
       'aspect_ratio', jsonb_build_object('type','string','enum', jsonb_build_array('16:9','9:16','1:1'),'default','9:16'),
       'duration', jsonb_build_object('type','string','enum', jsonb_build_array('5','10'),'default','5')
     )), 'active', 60),

  ('face-swap', 'Face Swap',
   'Заменить лицо на изображении.',
   'face', 'replicate', 'cdingram/face-swap', 10,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('input_image','swap_image'),
     'properties', jsonb_build_object(
       'input_image', jsonb_build_object('type','string','format','uri'),
       'swap_image',  jsonb_build_object('type','string','format','uri')
     )), 'active', 70),

  ('reels-script', 'Reels Script Generator',
   'Сценарий Reels/Shorts под нишу и продукт.',
   'content', 'internal', 'claude-sonnet-4-6', 4,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('topic'),
     'properties', jsonb_build_object(
       'topic', jsonb_build_object('type','string','minLength',3,'maxLength',500),
       'tone', jsonb_build_object('type','string','enum', jsonb_build_array('educational','funny','inspirational','salesy'),'default','educational'),
       'language', jsonb_build_object('type','string','enum', jsonb_build_array('ru','en'),'default','ru'),
       'count', jsonb_build_object('type','integer','minimum',1,'maximum',5,'default',3)
     )), 'active', 80),

  -- ====== FEATURED · NANO BANANA 2 (kie.ai) ======
  -- Первый "premium" продукт на отдельном playground UI (/play/nano-banana-2).
  -- kie.ai списывает 8 credits/call → у нас 12 токенов (margin ~50%).
  ('nano-banana-2', 'Nano Banana 2',
   'Google Gemini 2.5 Flash Image. Премиум-генерация и редактирование с сохранением идентичности. Поддержка до 14 input-изображений.',
   'image', 'kie', 'nano-banana-2', 12,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('prompt'),
     'properties', jsonb_build_object(
       'prompt', jsonb_build_object('type','string','minLength',3,'maxLength',2000),
       'image_input', jsonb_build_object('type','array','items', jsonb_build_object('type','string','format','uri'),'maxItems',14),
       'aspect_ratio', jsonb_build_object('type','string','enum', jsonb_build_array('Auto','1:1','16:9','9:16','4:3','3:4'),'default','Auto'),
       'resolution', jsonb_build_object('type','string','enum', jsonb_build_array('1K','2K','4K'),'default','1K'),
       'output_format', jsonb_build_object('type','string','enum', jsonb_build_array('JPG','PNG'),'default','JPG')
     )), 'active', 1),

  -- ====== TOP-3 FLAGSHIPS · NANO BANANA ======
  -- Google Gemini 2.5 Flash Image — SOTA для image-edit с сохранением идентичности
  ('nano-banana', 'Nano Banana',
   'Google Gemini 2.5 Flash Image. Лучшее качество изображений на рынке (Aug 2025+).',
   'image', 'fal', 'fal-ai/nano-banana', 10,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('prompt'),
     'properties', jsonb_build_object(
       'prompt', jsonb_build_object('type','string','minLength',3,'maxLength',2000),
       'num_images', jsonb_build_object('type','integer','minimum',1,'maximum',4,'default',1)
     )), 'active', 5),

  ('nano-banana-edit', 'Nano Banana Edit',
   'Редактирование фото через Gemini 2.5. Сохраняет лица и композицию лучше всех.',
   'image', 'fal', 'fal-ai/nano-banana/edit', 12,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('image_url','prompt'),
     'properties', jsonb_build_object(
       'image_url', jsonb_build_object('type','string','format','uri'),
       'prompt', jsonb_build_object('type','string','minLength',3,'maxLength',1000),
       'num_images', jsonb_build_object('type','integer','minimum',1,'maximum',4,'default',1)
     )), 'active', 15),

  -- ====== TOP-3 FLAGSHIPS · KLING 2.1 MASTER (PRO TIER) ======
  -- Кинематографичное качество, премиум-уровень над v1.6 standard
  ('image-to-video-pro', 'Image → Video · Pro',
   'Kling 2.1 Master. Кинематографическое качество для премиум-контента.',
   'video', 'fal', 'fal-ai/kling-video/v2.1/master/image-to-video', 220,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('image_url'),
     'properties', jsonb_build_object(
       'image_url', jsonb_build_object('type','string','format','uri'),
       'prompt', jsonb_build_object('type','string','maxLength',500),
       'duration', jsonb_build_object('type','string','enum', jsonb_build_array('5','10'),'default','5'),
       'cfg_scale', jsonb_build_object('type','number','minimum',0,'maximum',1,'default',0.5),
       'negative_prompt', jsonb_build_object('type','string','maxLength',500)
     )), 'active', 55),

  ('text-to-video-pro', 'Text → Video · Pro',
   'Kling 2.1 Master. Видео из описания, кинематографические сцены и движение.',
   'video', 'fal', 'fal-ai/kling-video/v2.1/master/text-to-video', 250,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('prompt'),
     'properties', jsonb_build_object(
       'prompt', jsonb_build_object('type','string','minLength',5,'maxLength',2000),
       'aspect_ratio', jsonb_build_object('type','string','enum', jsonb_build_array('16:9','9:16','1:1'),'default','16:9'),
       'duration', jsonb_build_object('type','string','enum', jsonb_build_array('5','10'),'default','5'),
       'negative_prompt', jsonb_build_object('type','string','maxLength',500)
     )), 'active', 65),

  -- ====== VIDEO UPSCALE (Этап 6 · spec) ======
  ('video-upscale', 'Video Upscale',
   'Увеличение разрешения видео (Topaz Video AI через fal.ai).',
   'video', 'fal', 'fal-ai/topaz/upscale/video', 60,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('video_url'),
     'properties', jsonb_build_object(
       'video_url', jsonb_build_object('type','string','format','uri'),
       'upscale_factor', jsonb_build_object('type','integer','enum', jsonb_build_array(2,4),'default',2),
       'target_fps', jsonb_build_object('type','integer','minimum',24,'maximum',60,'default',30)
     )), 'beta', 67),

  -- ====== TOP-3 FLAGSHIPS · CLARITY UPSCALE (PRO TIER) ======
  -- Topaz-уровень качества для фотограф/контент-мейкеров
  ('image-upscale-pro', 'Image Upscale · Pro',
   'Clarity Upscaler. Премиум-апскейл с детализацией. Для фото-контента и печати.',
   'image', 'replicate', 'philz1337x/clarity-upscaler', 8,
   jsonb_build_object(
     'type','object','required', jsonb_build_array('image'),
     'properties', jsonb_build_object(
       'image', jsonb_build_object('type','string','format','uri'),
       'scale_factor', jsonb_build_object('type','number','enum', jsonb_build_array(2,4),'default',2),
       'dynamic', jsonb_build_object('type','number','minimum',1,'maximum',50,'default',6),
       'creativity', jsonb_build_object('type','number','minimum',0,'maximum',1,'default',0.35),
       'resemblance', jsonb_build_object('type','number','minimum',0,'maximum',3,'default',0.6)
     )), 'active', 35)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  provider = excluded.provider, model = excluded.model,
  token_cost = excluded.token_cost, input_schema = excluded.input_schema,
  status = excluded.status, sort_order = excluded.sort_order;

insert into "payment_packages" (slug, name, tokens, bonus_tokens, price_cents, currency, is_active, sort_order)
values
  ('starter', 'Starter Pack', 500,   50,   990,  'USD', true, 10),
  ('creator', 'Creator Pack', 2000,  400,  2990, 'USD', true, 20),
  ('pro',     'Pro Pack',     6000,  2000, 6990, 'USD', true, 30),
  ('studio',  'Studio Pack',  20000, 8000, 19900,'USD', true, 40)
on conflict (slug) do nothing;
