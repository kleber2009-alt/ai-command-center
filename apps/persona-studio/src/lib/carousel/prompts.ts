// Prompt-builder для AI Carousel Engine v2.
//
// Содержит:
//   1) STYLE_DNA       — DNA каждого из 5 стилей в формате описания для AI
//                        (палитра, типографика, layout, иконки, vibe).
//   2) COVER_TYPE_DNA  — описание 4 типов обложки (avatar / object / split / ui).
//   3) buildSlideCopyPrompt   — Claude system+user для генерации копи карусели
//                              с учётом выбранного стиля.
//   4) buildSlideRegenPrompt  — Claude system+user для регенерации ОДНОГО слайда
//                              (title/body) с учётом стиля и соседей.
//   5) buildSlideImagePrompt  — GPT-Image-2 prompt для editorial layout слайда.
//   6) buildHeroAvatarPrompt  — Nano Banana 2 prompt для cinematic-аватара
//                              cover-слайда.
//
// Все функции возвращают plain text. Сам fetch к Anthropic / Gemini /
// GPT-Image сидит в отдельных libs (lib/parser/claude.ts, lib/gemini.ts).

import type { CarouselStyleId } from './styles';

// ─────────────────────────────────────────────────────────────────────
// COVER TYPES
// ─────────────────────────────────────────────────────────────────────

export const COVER_TYPES = ['avatar', 'object', 'split', 'ui'] as const;
export type CoverType = (typeof COVER_TYPES)[number];

export const COVER_TYPE_LABEL: Record<CoverType, string> = {
  avatar: 'Avatar',
  object: 'Object',
  split: 'Split',
  ui: 'UI / Screen',
};

export const COVER_TYPE_DESC: Record<CoverType, string> = {
  avatar: 'Большое лицо/портрет автора + крупный заголовок + 3D AI-иконки. Максимум CTR.',
  object: 'Огромный объект (куб, телефон, продукт) центрально + минимальный фон + huge typography.',
  split: 'Левая половина = тезис A, правая = тезис B. AI vs Human, Paid vs Free, Old vs New.',
  ui: 'Скриншот дашборда / приложения / браузера как hero. Подходит для tutorials и кейсов.',
};

export function isValidCoverType(v: unknown): v is CoverType {
  return typeof v === 'string' && (COVER_TYPES as readonly string[]).includes(v);
}

// ─────────────────────────────────────────────────────────────────────
// STYLE DNA — описания, которые мы передаём в AI для context-aware
// генерации копи и картинок. Соответствуют CAROUSEL_STYLES в styles.ts.
// ─────────────────────────────────────────────────────────────────────

type StyleDNA = {
  label: string;
  palette: string;
  typography: string;
  layout: string;
  vibe: string;
  voice: string;
  copyLimits: {
    coverTitle: string;
    coverBody: string;
    revealTitle: string;
    revealBody: string;
    ctaTitle: string;
    ctaBody: string;
  };
};

export const STYLE_DNA: Record<CarouselStyleId, StyleDNA> = {
  'persona-minimal': {
    label: 'Bold Dark',
    palette: 'matte black #080808 background, cream #f5f0e8 text, lime #c8f060 accent, warm gold #f0c860 secondary',
    typography: 'Tinos serif for headings (oversized, bold), JetBrainsMono UPPERCASE for labels',
    layout: 'cinematic full-bleed avatar on cover, dark gradient overlay, big headline at bottom; reveal slides use mono label + serif headline + lime underline',
    vibe: 'aggressive hooks, cinematic lighting, hyper-contrast, AI-creator energy',
    voice: 'прямой, дерзкий, без воды, с провокацией',
    copyLimits: {
      coverTitle: '3–7 слов',
      coverBody: '10–18 слов',
      revealTitle: '3–6 слов',
      revealBody: '20–35 слов',
      ctaTitle: '2–5 слов',
      ctaBody: '10–20 слов',
    },
  },
  'clickbait-bold': {
    label: 'Clean Light',
    palette: 'white #FFFFFF background, black #0A0A0A text, cobalt #2D5BFF accent',
    typography: 'Tinos bold UPPERCASE for headlines, JetBrainsMono for steps + checklist',
    layout: 'editorial strict grid, lots of whitespace, top tag-line + "NN. ШАГ" + huge UPPERCASE title, optional checklist with cobalt ✓',
    vibe: 'tech-блогер, чистый, viral, чек-листы, шаги',
    voice: 'обучающий, по шагам, с сильным хуком и UPPERCASE-якорями',
    copyLimits: {
      coverTitle: '4–8 слов UPPERCASE',
      coverBody: '12–22 слова',
      revealTitle: '3–7 слов',
      revealBody: '20–40 слов или 3–6 буллетов',
      ctaTitle: '3–6 слов',
      ctaBody: '12–25 слов',
    },
  },
  'knox-cream': {
    label: 'Grid Pastel',
    palette: 'cream #F5EFE0 background, deep brown #3A2B0F + gold #B58620 duotone',
    typography: 'Tinos bold для duotone headline, gold italic для подзаголовка, JetBrainsMono для номеров',
    layout: 'premium magazine: фото сверху ~55%, gold-разделитель, cream-плашка с serif-заголовком; reveal — карточка с brown-бордером',
    vibe: 'editorial, premium YouTube-инфографика, knox-style',
    voice: 'спокойный, экспертный, с премиум-vibes, без хайпа',
    copyLimits: {
      coverTitle: '3–6 слов',
      coverBody: '8–16 слов',
      revealTitle: '3–5 слов',
      revealBody: '18–32 слова',
      ctaTitle: '2–4 слова',
      ctaBody: '10–18 слов',
    },
  },
  'neon-tech': {
    label: 'Neon Tech',
    palette: 'deep purple/black #0A001F gradient, cyan #00F0FF + neon pink #FF2DAA + electric blue #2D5BFF',
    typography: 'Tinos bold с cyan glow для заголовков, JetBrainsMono для cyber-меток типа "// 01"',
    layout: 'sci-fi grid wireframe фоном, glass-cards rgba+border, neon-glow тени, аватар в круге с cyan-обводкой',
    vibe: 'AI OS / cyber UI / sci-fi minimal, futuristic, hi-tech',
    voice: 'технологичный, лаконичный, с лёгким cyber-флёром',
    copyLimits: {
      coverTitle: '3–6 слов',
      coverBody: '10–18 слов',
      revealTitle: '3–6 слов',
      revealBody: '18–32 слова',
      ctaTitle: '2–5 слов',
      ctaBody: '10–18 слов',
    },
  },
  'handwritten-viral': {
    label: 'Handwritten Viral',
    palette: 'cream paper #F4ECD8, ink #1A1612, red marker #E63946, yellow highlighter #FFD400',
    typography: 'Tinos italic bold (рукописный feel), JetBrainsMono UPPERCASE для меток',
    layout: 'бумага в клетку, sticky-notes под углом, highlighter-полосы под заголовками, чек-листы с jitter rotation',
    vibe: 'creator-notes, brainstorm, viral coaching, marker-energy',
    voice: 'дружелюбный, тёплый, как заметка наставника, с лайфхак-энергией',
    copyLimits: {
      coverTitle: '4–7 слов',
      coverBody: '10–18 слов',
      revealTitle: '3–6 слов',
      revealBody: '18–35 слов или 3–5 коротких буллетов',
      ctaTitle: '2–4 слова',
      ctaBody: '10–18 слов',
    },
  },
};

function dnaBlock(styleId: CarouselStyleId): string {
  const d = STYLE_DNA[styleId];
  return [
    `СТИЛЬ КАРУСЕЛИ: ${d.label}`,
    `Палитра: ${d.palette}`,
    `Типографика: ${d.typography}`,
    `Layout: ${d.layout}`,
    `Vibe: ${d.vibe}`,
    `Голос автора: ${d.voice}`,
    'Лимиты по словам:',
    `  - Обложка: title ${d.copyLimits.coverTitle}, body ${d.copyLimits.coverBody}`,
    `  - Раскрытие: title ${d.copyLimits.revealTitle}, body ${d.copyLimits.revealBody}`,
    `  - CTA: title ${d.copyLimits.ctaTitle}, body ${d.copyLimits.ctaBody}`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// 1. buildSlideCopyPrompt — для полной генерации N слайдов
// ─────────────────────────────────────────────────────────────────────

export function buildSlideCopyPrompt(args: {
  styleId: CarouselStyleId;
  niche: string;
  userName: string;
  slidesCount: number;
  topic: string;
  fitWhy?: string | null;
}): { system: string; user: string } {
  const { styleId, niche, userName, slidesCount, topic, fitWhy } = args;
  const n = Math.max(3, Math.min(20, slidesCount));
  const dna = dnaBlock(styleId);

  const system = `Ты — сценарист Instagram-каруселей нового поколения (AI Carousel Engine v2) для эксперта ${userName}.

Ниша эксперта: ${niche || 'не указана'}

${dna}

Тебе показывают тему или «залетевший» пост конкурента. Твоя задача — разбить его на ${n} слайдов карусели, НЕ цитируя оригинал дословно, а перепиcав суть голосом эксперта ${userName} под выбранный стиль и его нишу.

Структура карусели на ${n} слайдов:
- Слайд 1 = ОБЛОЖКА: провокационный хук-заголовок + подзаголовок, который заставит листать дальше.
- Слайды 2..${n - 1} = РАСКРЫТИЕ: каждый слайд = ОДНА идея/инсайт/шаг. Принцип «1 идея = 1 слайд», без перегруза.
- Слайд ${n} = CTA: чёткий призыв (Сохрани / Поделись / Напиши в комменты / Подпишись).

Верни СТРОГО JSON-массив длины ${n}, без markdown, без преамбулы, без \`\`\`:
[
  { "title": "...", "body": "..." },
  ...
]

ТРЕБОВАНИЯ:
- Ровно ${n} объектов.
- title непустой, body непустой.
- Соблюдай словесные лимиты выбранного стиля.
- Голос соответствует "voice" стиля.
- Русский язык, без эмодзи, без хэштегов, без markdown в title/body.
- Не повторяй один и тот же тезис на разных слайдах.
- Каждый body можно структурировать буллетами через "·" если стиль это поддерживает (Clean Light, Handwritten Viral).`;

  const userMsg = `Тема / источник:
"""
${topic.slice(0, 1500)}
"""${fitWhy ? `\n\nКонтекст (зачем это для нас): ${fitWhy}` : ''}

Верни JSON-массив из ${n} слайдов под стиль "${STYLE_DNA[styleId].label}":`;

  return { system, user: userMsg };
}

// ─────────────────────────────────────────────────────────────────────
// 2. buildSlideRegenPrompt — регенерация ОДНОГО слайда
// ─────────────────────────────────────────────────────────────────────

type SlideContext = { title: string; body: string };

export function buildSlideRegenPrompt(args: {
  styleId: CarouselStyleId;
  niche: string;
  userName: string;
  slideIndex: number; // 0-based
  slidesTotal: number;
  current: SlideContext;
  neighbors: { prev?: SlideContext; next?: SlideContext };
  intent?: string; // optional user hint: "сделай острее", "добавь цифру"
}): { system: string; user: string } {
  const { styleId, niche, userName, slideIndex, slidesTotal, current, neighbors, intent } = args;
  const isCover = slideIndex === 0;
  const isCTA = slideIndex === slidesTotal - 1;
  const role = isCover ? 'ОБЛОЖКА' : isCTA ? 'CTA' : 'РАСКРЫТИЕ';
  const dna = dnaBlock(styleId);
  const limits = STYLE_DNA[styleId].copyLimits;
  const limit = isCover
    ? `title ${limits.coverTitle}, body ${limits.coverBody}`
    : isCTA
      ? `title ${limits.ctaTitle}, body ${limits.ctaBody}`
      : `title ${limits.revealTitle}, body ${limits.revealBody}`;

  const system = `Ты — сценарист Instagram-каруселей AI Carousel Engine v2 для эксперта ${userName}.
Ниша: ${niche || 'не указана'}

${dna}

Тебе нужно ПЕРЕГЕНЕРИРОВАТЬ ОДИН слайд карусели — слайд №${slideIndex + 1} из ${slidesTotal}. Роль слайда: ${role}.

Лимиты этого слайда: ${limit}.

ВАЖНО:
- Сохрани суть и место слайда в потоке (не дублируй соседей).
- Соблюдай голос и стиль автора.
- Русский, без эмодзи, без markdown, без хэштегов.
- Один title (короткий, цепляющий) + один body (раскрытие).

Верни СТРОГО JSON без markdown, без преамбулы, без \`\`\`:
{ "title": "...", "body": "..." }`;

  const neighborsBlock = [
    neighbors.prev
      ? `Слайд ${slideIndex} (предыдущий): "${neighbors.prev.title}" — ${neighbors.prev.body.slice(0, 200)}`
      : null,
    neighbors.next
      ? `Слайд ${slideIndex + 2} (следующий): "${neighbors.next.title}" — ${neighbors.next.body.slice(0, 200)}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const userMsg = [
    `Текущий вариант слайда №${slideIndex + 1} (${role}):`,
    `title: "${current.title}"`,
    `body: "${current.body}"`,
    neighborsBlock ? `\nКонтекст соседей:\n${neighborsBlock}` : '',
    intent ? `\nЧто изменить: ${intent}` : '\nЦель: сделать сильнее, конкретнее, в духе стиля.',
    '\nВерни JSON { title, body }:',
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user: userMsg };
}

// ─────────────────────────────────────────────────────────────────────
// 3. buildSlideImagePrompt — GPT-Image-2 для editorial-композиций слайдов
// ─────────────────────────────────────────────────────────────────────

export function buildSlideImagePrompt(args: {
  styleId: CarouselStyleId;
  kind: 'cover' | 'reveal' | 'cta';
  coverType?: CoverType;
  title: string;
  body: string;
  topic: string;
  niche?: string;
}): string {
  const dna = STYLE_DNA[args.styleId];
  const aspect = '4:5 (1080×1350)';
  const lines: (string | null)[] = [
    'Generate a single Instagram-carousel slide as a finished design composition (NOT a photo, a designed slide).',
    `Style DNA — ${dna.label}: ${dna.palette}. ${dna.typography}. ${dna.layout}. Vibe: ${dna.vibe}.`,
    args.kind === 'cover'
      ? `Layout role: COVER (slide 1). Cover type: ${args.coverType || 'avatar'}. ${args.coverType ? COVER_TYPE_DESC[args.coverType] : COVER_TYPE_DESC.avatar}`
      : args.kind === 'cta'
        ? 'Layout role: FINAL CTA. Strong action element (button/sticker) plus headline.'
        : 'Layout role: REVEAL. Single concept per slide. Big readable headline + supporting body card.',
    `Headline text (accurate spelling, large, readable): "${args.title}"`,
    `Supporting body text: "${args.body}"`,
    args.niche ? `Audience / niche: ${args.niche}.` : null,
    `Topic: ${args.topic.slice(0, 200)}.`,
    'COMPOSITION:',
    '- Instagram safe zones: 120px top, 140px bottom, 70px left/right.',
    '- 12-column grid, 32px gaps, consistent margins.',
    '- Max 2 fonts. Strong typographic hierarchy. Oversized hook, minimal body text.',
    '- Editorial, cinematic, designed for attention — NOT Canva-template look.',
    `- Aspect ratio: ${aspect}.`,
    '- No watermark, no extra random text, no logos beyond the typography above.',
  ];
  return lines.filter(Boolean).join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// 4. buildHeroAvatarPrompt — Nano Banana 2 для cinematic-hero аватара
// для cover-слайда. Identity-first: тот же человек, новый сеттинг.
// ─────────────────────────────────────────────────────────────────────

export function buildHeroAvatarPrompt(args: {
  styleId: CarouselStyleId;
  topic: string;
}): string {
  const dna = STYLE_DNA[args.styleId];
  return [
    'TASK: Re-photograph the EXACT same person shown in the input image as the hero of an Instagram carousel cover.',
    '',
    'CRITICAL IDENTITY RULE — read this first:',
    '- The output MUST clearly show the SAME individual as the input photo.',
    '- Preserve face shape, eyes, nose, lips, eyebrows, hairline, skin tone,',
    '  ethnicity, apparent age, beard / stubble pattern, scars, moles,',
    '  and every distinguishing feature 100%.',
    '- Do NOT generate a different person. Do NOT idealize, beautify, age-shift, slim down.',
    '',
    `NEW SETTING (Style DNA — ${dna.label}):`,
    `- Palette: ${dna.palette}.`,
    `- Vibe: ${dna.vibe}.`,
    `- Lighting: cinematic, matching the palette.`,
    `- Topic context: ${args.topic.slice(0, 200)}.`,
    '',
    'OUTPUT REQUIREMENTS:',
    '- 4:5 portrait, social-media ready.',
    '- Photorealistic, high-end editorial quality.',
    '- Sharp facial details, natural skin texture, no plastic look.',
    '- Single person only in the frame.',
    '- No text overlays, no logos, no watermark.',
    '- Same person, new wardrobe and surroundings as described above.',
  ].join('\n');
}
