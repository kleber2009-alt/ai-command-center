# neuro-funnel — CLAUDE.md

Курс «Нейроворонка»: уроки, которые читает цифровой двойник Ильи (HeyGen), слайды собирает Claude, а конвейер
склеивает в видео 1920×1080. Курс продаётся через саму нейроворонку: контент → кодовое слово → лид-магнит →
ИИ-агент в Директе (ChatPlace) → сайт → оплата → автовыдача.

- Методология (путь ученика, 9 уроков): https://claude.ai/artifact/WMFVEkC6qqEDAqpEWYae7k
- Лендинг (пока артефакт): https://claude.ai/artifact/6z4UBbZhGNcCpVmJUp487P, макет — https://claude.ai/artifact/9xAM7woBmzLosiCnZt6uMe
- В реестре Command Center — slug `neuro-funnel`.

## Файлы

- `course/outline.json` — программа: этапы, уроки, инструмент / задание / результат / «вау» каждого урока. Источник для
  уроков, сайта и базы знаний агента.
- `course/avatars.json` — образы HeyGen по урокам (группа ilia.paliy, образы 51/55/56/57/58, голос по умолчанию группы).
- `lessons/NN/lesson.json` — урок: слайды (`layout` + поля экрана) и `say` — текст суфлёра для аватара; `spell` —
  написание для субтитров (Клод → Claude).
- `lessons/NN/materials/` — инструмент урока (промпты, шаблоны, чек-лист).
- `lessons/NN/prompter.md` — суфлёр по слайдам (генерирует `check_script.py`).
- `lessons/NN/build/` — артефакты сборки (в git не идут): `slides/NN.png`, `avatar/NN.mp4`, `segments/`, `lesson-NN.mp4`, `.srt`.

## Конвейер урока

```bash
cd apps/neuro-funnel
python3 pipeline/check_script.py lessons/01        # суфлёр: длина, цифры/латиница словами, фразы ≤ 22 слов
node pipeline/render_slides.mjs lessons/01         # слайды → build/slides/NN.png (Playwright, шрифты локально в pipeline/fonts)
# аватар: по одному видео HeyGen на слайд — create_video_from_avatar(look из avatars.json, voice, script = say,
#   engine avatar_v, 9:16, 1080p), video_url → build/avatar/NN.mp4
python3 pipeline/build_lesson.py lessons/01        # склейка → build/lesson-01.mp4 + .srt (--only 1,2 — пилот, --burn — субтитры в кадре)
```

Правила текста `say` — как у аватара в `.claude/skills/remake-top-reel/references/script-rules.md`: короткие фразы,
числа словами, латиница как произносится (Клод, Хейджен, Чат Плейс), без скобок и ремарок.

Геометрия: экран 1920×1080 делится 35/65 — слева аватар 672×1080 (9:16 по ширине, обрезка по высоте `CROP_TOP`),
справа слайд 1248×1080 (`.slide` в `pipeline/slides.html`, `SLIDE_W` в `build_lesson.py`). Круг из аватара делается на монтаже.
