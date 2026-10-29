# Генерация обложек и фактур

Инструмент: ChatPlace `virale_image_generate` (баланс ИИ компании — тот же, что тратит ИИ-менеджер в Директе; проверка —
`virale_ai_balance`, цена — `virale_generation_estimate`). Higgsfield — если там есть кредиты (`gpt_image_2_5`, референсы лица).

## Портрет Ильи (обложка)

`provider: gemini_pro`, `aspectRatio: 4:5`, `imageSize: 2K` (≈17¢), `images`: 2 публичных фото лица — mediaUrl обложек
его постов из `automations_triggers_list_instagram_media` (подходят DebBB0YjP0a — крупно в очках, Deokl3UkiEf — в пальто;
ссылки CDN живут ~2 недели, бери свежие). Шаблон:

> Cinematic editorial portrait of the SAME man from the reference photos (keep his exact face and hairstyle). <сцена, одежда,
> поза, взгляд в камеру>. <свет: warm amber tungsten / city rim light / hard side light>, deep shadows, 50–85mm, film grain,
> premium men's magazine aesthetic. Vertical, lower 35% darker for headline. No text, no logos.

Сцены, которые уже сработали: кейс у груди в библиотеке; чёрный костюм под подвесными лампами; руки скрещены у окна ночного
города; кресло режиссёра рядом с выключенной камерой; белая рубашка на ступенях из чёрного камня; ч/б в водолазке; монтажная
с кофе; кожаное кресло с ноутбуком; зелёный костюм у окна пентхауса; на фоне светящейся оранжевой звезды.

## Фактура

`provider: gemini_2`, 2K (≈13¢): «Full-frame texture of <материал>, <свет>, photographic, no objects, no text». Центр должен быть
спокойным. Если по краю белая рамка (у «бумаги» бывает) — обрежь 5–6 % по краям.

Опрос статуса: `virale_generation_status(taskId)` или `virale_gallery_list` (если вызов упал по таймауту, задача всё равно идёт —
сначала проверь галерею, не запускай повторно).
