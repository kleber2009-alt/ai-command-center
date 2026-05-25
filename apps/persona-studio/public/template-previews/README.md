# Submagic template previews

Сюда кладутся preview-картинки для шаблонов из [src/lib/edit-templates.ts](../../src/lib/edit-templates.ts).

Submagic API не отдаёт превью через REST — поэтому файлы тут заводятся
руками. Пока файла нет — карточка шаблона рендерится с градиент-плейсхолдером
(graceful fallback через `<img onError>`).

## Конвенция именования

`<slug>.jpg` где slug = `name.toLowerCase().replace(/\s+/g, '-')`.

Маппинг slug → Submagic name:

| Файл                  | Submagic template |
|-----------------------|-------------------|
| `hormozi-1.jpg`       | Hormozi 1         |
| `hormozi-2.jpg`       | Hormozi 2         |
| `hormozi-3.jpg`       | Hormozi 3         |
| `hormozi-4.jpg`       | Hormozi 4         |
| `hormozi-5.jpg`       | Hormozi 5         |
| `beast.jpg`           | Beast             |
| `iman.jpg`            | Iman              |
| `ali.jpg`             | Ali               |
| `devin.jpg`           | Devin             |
| `jack.jpg`            | Jack              |
| `leon.jpg`            | Leon              |
| `jason.jpg`           | Jason             |
| `william.jpg`         | William           |
| `bob.jpg`             | Bob               |
| `mark.jpg`            | Mark              |
| `karl.jpg`            | Karl              |
| `daniel.jpg`          | Daniel            |
| `david.jpg`           | David             |
| `michael.jpg`         | Michael           |
| `caleb.jpg`           | Caleb             |
| `doug.jpg`            | Doug              |
| `carlos.jpg`          | Carlos            |
| `luke.jpg`            | Luke              |
| `noah.jpg`            | Noah              |
| `lewis.jpg`           | Lewis             |
| `kendrick.jpg`        | Kendrick          |
| `matt.jpg`            | Matt              |
| `nick.jpg`            | Nick              |
| `dan.jpg`             | Dan               |
| `dan-2.jpg`           | Dan 2             |
| `jess.jpg`            | Jess              |
| `laura.jpg`           | Laura             |
| `claire.jpg`          | Claire            |
| `leila.jpg`           | Leila             |
| `sara.jpg`            | Sara              |
| `ella.jpg`            | Ella              |
| `tayo.jpg`            | Tayo              |
| `tracy.jpg`           | Tracy             |
| `maya.jpg`            | Maya              |
| `umi.jpg`             | Umi               |
| `kelly-2.jpg`         | Kelly 2           |
| `gstaad.jpg`          | Gstaad            |
| `malta.jpg`           | Malta             |
| `nema.jpg`            | Nema              |
| `seth.jpg`            | seth              |

## Технические требования

- **Формат:** JPEG (`.jpg`). WebP не поддерживается (URL хардкодит `.jpg`).
- **Соотношение сторон:** 4:5 портрет (под карточку в галерее). Любой
  другой формат crop-нется через `object-fit: cover`.
- **Размер:** ширина 600-800px достаточно (выше будет ретина-перевес).
- **Вес:** держать под 80-120 KB на файл (jpeg quality 75-85).
- **Контент:** скриншот из Submagic dashboard / реального вывода данного
  шаблона — текст субтитров, типичный кадр.

## Как наполнить

Самый простой путь:

1. Зайти на https://submagic.co/ → создать demo-проект для каждого шаблона.
2. Сохранить first-frame готового видео как jpg (через video-tag → canvas
   → toDataURL, или через ffmpeg).
3. Положить в эту папку под нужным именем.
4. `git add` + commit + push — деплой подхватит в следующий docker build.

Альтернатива: вместо ручного сбора собирать автоматически из готовых
правок пользователей (`VideoEdit.resultUrl`) — но это уже отдельная задача.

## Где это используется

- [src/lib/edit-templates.ts](../../src/lib/edit-templates.ts) — функция `previewUrl(name)`.
- [src/components/edit-form.tsx](../../src/components/edit-form.tsx) — карточка шаблона в галерее.
- [src/components/edit-card.tsx](../../src/components/edit-card.tsx) — thumb рядом с заголовком (опционально).
