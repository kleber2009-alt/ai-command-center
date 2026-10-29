// Carousel remix per the owner's skill `ilia-carousel-style`: do NOT draw from
// scratch — take an already-published carousel, keep its slides pixel-for-
// pixel, change only the cover/hook, the first screen, slide order and the CTA
// code word. Pure module (no I/O): spec types, the spec builder, the Claude
// prompt and the parser of its answer. Used by
//   /api/pipelines/[id]/carousel/** (server) and the CarouselPipeline UI.
//
// Storage: CarouselDraft.sourceImages = original slides (our S3, in original
// order); CarouselDraft.slides = RemixSlide[] (the new order: cover → kept
// originals → CTA, each pointing at a sourceImages index); CarouselDraft.remix
// = RemixMeta (hooks A/B, code word, caption, look).

export type RemixRole = 'cover' | 'keep' | 'cta';
export type TextPos = 'top' | 'center' | 'bottom';
/** How the original background is calmed down under new text. */
export type Veil = 'blur' | 'dark' | 'solid';

export type RemixSlide = {
  role: RemixRole;
  /** index into CarouselDraft.sourceImages (background / the slide itself) */
  src: number;
  /** cover: hook with *accent*; cta: «Пиши *«СЛОВО»* в комментариях →»; keep: '' */
  title: string;
  /** cover: subtitle; cta: what the reader gets for the word; keep: '' */
  body: string;
  textPos?: TextPos;
  veil?: Veil;
};

export type RemixHook = { id: 'A' | 'B'; title: string; sub: string; why: string };

export type SourceKind = 'winner' | 'strongBody' | 'regular';

/** `original` = the remix look (original slides + new text); otherwise a CarouselStyleId. */
export type RemixLook = string;
export const ORIGINAL_LOOK = 'original';

export type RemixMeta = {
  v: 1;
  look: RemixLook;
  hooks: RemixHook[];
  hookChoice: 'A' | 'B';
  codeWord: string;
  oldCodeWord: string | null;
  caption: string;
  rationale: string;
  test: string;
  sourceKind: SourceKind;
  provider: 'ai' | 'fallback';
};

export const MAX_SLIDES = 20;
export const IG_CAROUSEL_MAX = 10;
const DEFAULT_WORD = 'ГАЙД';

/** «гайд», "+", «ПРАКТИКУМ!» → ГАЙД / + / ПРАКТИКУМ */
export function normalizeCodeWord(raw: string | null | undefined): string {
  const s = String(raw ?? '')
    .replace(/[«»"“”„'`]/g, '')
    .replace(/[^\p{L}\p{N}+\- ]/gu, '')
    .trim()
    .toUpperCase()
    .slice(0, 20)
    .trim();
  return s;
}

/**
 * The code word of the original post: «Пиши «СЛОВО» в комментариях», "напиши
 * + в комменты", or a quoted CAPS word. null when nothing looks like one.
 */
export function extractCodeWord(caption: string | null | undefined): string | null {
  const text = String(caption ?? '');
  if (!text.trim()) return null;
  const quoted = '[«"“„]([^»"”\\n]{1,24})[»"”]';
  const patterns = [
    new RegExp(`(?:пиши|напиши|оставь|жми|ставь)[^\\n«"“„]{0,40}?${quoted}`, 'i'),
    new RegExp(`${quoted}[^\\n]{0,30}(?:в\\s+коммент|в\\s+комм|в\\s+директ)`, 'i'),
    /(?:пиши|напиши|оставь|ставь)\s+(\+|[A-ZА-ЯЁ0-9]{2,20})\s+(?:в\s+)?(?:коммент|комм|директ)/,
    /[«"“„]([A-ZА-ЯЁ0-9+]{2,20})[»"”]/,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    const w = normalizeCodeWord(m?.[1]);
    if (w) return w;
  }
  return null;
}

export function ctaLine(word: string): string {
  return `Пиши *«${normalizeCodeWord(word) || DEFAULT_WORD}»* в комментариях →`;
}

/** Replace the code word inside a CTA line; falls back to a fresh line. */
export function swapCtaWord(line: string, oldWord: string, newWord: string): string {
  const w = normalizeCodeWord(newWord) || DEFAULT_WORD;
  if (oldWord && line.includes(`«${oldWord}»`)) return line.split(`«${oldWord}»`).join(`«${w}»`);
  return ctaLine(w);
}

export function sourceKindOf(rank: { winner?: boolean; strongBody?: boolean } | null | undefined): SourceKind {
  if (rank?.winner) return 'winner';
  if (rank?.strongBody) return 'strongBody';
  return 'regular';
}

/** The AI answer after validation (all fields optional — the builder fills gaps). */
export type RemixAi = {
  hooks?: Array<{ title?: string; sub?: string; why?: string }>;
  codeWord?: string;
  ctaPromise?: string;
  caption?: string;
  /** 1-based slide numbers of the ORIGINAL to keep between cover and CTA, in the new order */
  keep?: number[];
  rationale?: string;
  test?: string;
};

function cleanLine(s: unknown, max: number): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function firstMeaningfulLine(caption: string): string {
  const line = caption
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 3 && !/^[#@]/.test(l));
  return (line ?? '').replace(/[.!?…]+$/, '');
}

/** Template caption (skill §5) when the AI is unavailable. */
export function fallbackCaption(original: string, word: string): string {
  const paras = original
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^[#@]/.test(p) && !/коммент|директ/i.test(p))
    .slice(1, 3);
  const w = normalizeCodeWord(word) || DEFAULT_WORD;
  return [`Пиши «${w}» в комментариях — пришлю материал в директ.`, ...paras, 'Сохраняй, чтобы не потерять 🤝']
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 2200);
}

function ensureCaption(caption: string, word: string): string {
  let c = caption.trim().slice(0, 2200);
  const w = normalizeCodeWord(word);
  const lines = c.split('\n');
  if (w && !lines[0]?.toUpperCase().includes(w)) c = `Пиши «${w}» в комментариях\n\n${c}`;
  if (!/сохран/i.test(c)) c = `${c}\n\nСохраняй, чтобы не потерять 🤝`;
  return c.slice(0, 2200);
}

/**
 * Build the remix spec from the original slides + (optional) AI answer.
 * Always valid: cover = original slide 1 with the new hook, body = kept
 * originals (AI order, default: all in the original order), CTA = original
 * last slide with the new code word. n=2 → cover + CTA only.
 */
export function buildRemixSpec(input: {
  sourceImages: string[];
  caption: string;
  sourceKind: SourceKind;
  ai?: RemixAi | null;
  /** true only when the AI actually saw the slides — otherwise it may reorder but not drop. */
  allowDrop?: boolean;
}): { slides: RemixSlide[]; meta: RemixMeta } {
  const n = Math.min(input.sourceImages.length, MAX_SLIDES);
  if (n < 2) throw new Error('remix needs at least 2 source slides');
  const ai = input.ai ?? null;
  const oldCodeWord = extractCodeWord(input.caption);

  let word = normalizeCodeWord(ai?.codeWord);
  if (!word || (oldCodeWord && word === oldCodeWord && word !== '+')) word = '';
  if (!word) word = oldCodeWord && oldCodeWord !== DEFAULT_WORD ? DEFAULT_WORD : 'ХОЧУ';

  // Hooks A/B (always two).
  const base = firstMeaningfulLine(input.caption) || 'то, что работает';
  const aiHooks = (ai?.hooks ?? [])
    .map((h) => ({ title: cleanLine(h?.title, 90), sub: cleanLine(h?.sub, 110), why: cleanLine(h?.why, 200) }))
    .filter((h) => h.title);
  const fallbackHooks = [
    { title: `${base.split(' ').slice(0, 4).join(' ')} *без ошибок*`, sub: 'сохраняй и повторяй по шагам →', why: 'Тот же смысл, новая подача через пользу.' },
    { title: `Ты делаешь это *неправильно*`, sub: `${base.split(' ').slice(0, 6).join(' ')} →`, why: 'Провокация на ошибку — проверяем против хука A.' },
  ];
  const hooks: RemixHook[] = (['A', 'B'] as const).map((id, i) => ({ id, ...(aiHooks[i] ?? fallbackHooks[i]) }));

  // Body slides: original 2..n-1 (1-based) unless n == 2.
  const candidates = n >= 3 ? Array.from({ length: n - 2 }, (_, i) => i + 1) : [];
  let order: number[] = [];
  if (Array.isArray(ai?.keep)) {
    for (const k of ai!.keep) {
      const idx = Math.round(Number(k)) - 1; // 1-based → 0-based
      if (candidates.includes(idx) && !order.includes(idx)) order.push(idx);
    }
  }
  // The AI may drop weak slides (only when it saw them), but never empty the body.
  if (order.length === 0 || (candidates.length >= 3 && order.length < Math.ceil(candidates.length / 2))) {
    order = candidates;
  } else if (!input.allowDrop) {
    order = [...order, ...candidates.filter((c) => !order.includes(c))];
  }

  const slides: RemixSlide[] = [
    { role: 'cover', src: 0, title: hooks[0].title, body: hooks[0].sub, textPos: 'top', veil: 'blur' },
    ...order.map((src): RemixSlide => ({ role: 'keep', src, title: '', body: '' })),
    {
      role: 'cta',
      src: n - 1,
      title: ctaLine(word),
      body: cleanLine(ai?.ctaPromise, 120) || 'пришлю материал в директ',
      textPos: 'center',
      veil: 'blur',
    },
  ];

  const caption = ai?.caption?.trim() ? ensureCaption(ai.caption, word) : fallbackCaption(input.caption, word);

  return {
    slides,
    meta: {
      v: 1,
      look: ORIGINAL_LOOK,
      hooks,
      hookChoice: 'A',
      codeWord: word,
      oldCodeWord,
      caption,
      rationale:
        cleanLine(ai?.rationale, 400) ||
        (input.sourceKind === 'strongBody'
          ? 'Сильная начинка, слабый хук: оставляем слайды, меняем обложку и первый экран.'
          : 'Победитель по комментариям: повторяем с новым хуком на другой подаче.'),
      test: cleanLine(ai?.test, 200) || 'Хук A против хука B — какой даст больше комментариев с кодовым словом.',
      sourceKind: input.sourceKind,
      provider: ai ? 'ai' : 'fallback',
    },
  };
}

/** Validate a client-edited slide list against the source (PATCH). */
export function sanitizeSlides(slides: unknown, sourceCount: number): RemixSlide[] | null {
  if (!Array.isArray(slides)) return null;
  const out: RemixSlide[] = [];
  for (const raw of slides) {
    const s = (raw ?? {}) as Partial<RemixSlide>;
    const role: RemixRole = s.role === 'cover' || s.role === 'cta' ? s.role : 'keep';
    const src = Math.round(Number(s.src));
    if (!Number.isFinite(src) || src < 0 || src >= sourceCount) return null;
    out.push({
      role,
      src,
      title: role === 'keep' ? '' : cleanLine(s.title, 160),
      body: role === 'keep' ? '' : String(s.body ?? '').trim().slice(0, 240),
      textPos: s.textPos === 'top' || s.textPos === 'center' || s.textPos === 'bottom' ? s.textPos : undefined,
      veil: s.veil === 'blur' || s.veil === 'dark' || s.veil === 'solid' ? s.veil : undefined,
    });
  }
  // Exactly one cover first and one CTA last.
  if (out.length < 2 || out.length > MAX_SLIDES) return null;
  if (out[0].role !== 'cover' || out[out.length - 1].role !== 'cta') return null;
  if (out.filter((s) => s.role === 'cover').length !== 1 || out.filter((s) => s.role === 'cta').length !== 1) return null;
  return out;
}

// ── prompt ────────────────────────────────────────────────────────────

export const REMIX_SYSTEM = `Ты — редактор каруселей Instagram блогера @ilia.paliy (ИИ, контент, нейросети для блога).
Метод «ремикс»: НЕ придумываем карусель с нуля. Берём уже вышедшую карусель, оставляем её слайды как есть
(картинки, скриншоты, стиль), меняем только обложку (хук), первый экран, порядок слайдов и CTA-кодовое слово.

Правила хука (обложка):
- 2 разных хука A и B — разные углы подачи (боль/ошибка, выгода/результат, провокация, «удаляй X», цифра).
- title: 3–7 слов обычным регистром (капс сделает вёрстка, гротеск Jost); ровно один фрагмент в *звёздочках* — курсивный оранжевый акцент (1–3 слова).
- sub: 4–10 слов, подзаголовок-обещание, можно закончить «→».
- Новый хук НЕ повторяет старую первую строку подписи. Без эмодзи, без кавычек-ёлочек в title.
- why: 1 фраза, почему этот хук должен сработать.

Кодовое слово: новое, 1 слово КАПСОМ по теме (например ГАЙД, ПРОМПТ, CLAUDE), НЕ равно старому слову.
ctaPromise: 4–10 слов — что человек получит за слово в директ.

Подпись (caption) по шаблону: первая строка — призыв с кодовым словом; затем 2–3 коротких абзаца (1–2 предложения),
абзацы разделяй пустой строкой (\n\n); последняя строка «Сохраняй, чтобы не потерять 🤝». До 900 символов.
Пиши по-русски, живо, от первого лица автора, без канцелярита и без орфографических ошибок.

keep: номера ИСХОДНЫХ слайдов (1-based), которые идут между новой обложкой и CTA, в новом порядке.
Слайд 1 (старая обложка) и последний слайд (старый CTA) в keep не входят. Можно поднять самый сильный слайд
на второе место и убрать 1 слабый, но не выкидывай больше половины.

Ответ — строго JSON без пояснений:
{"hooks":[{"title":"...","sub":"...","why":"..."},{"title":"...","sub":"...","why":"..."}],
 "codeWord":"...","ctaPromise":"...","caption":"...","keep":[2,3,4],"rationale":"что меняем и почему (1–2 фразы)","test":"что проверяем"}`;

export function buildRemixUserPrompt(input: {
  caption: string;
  slideCount: number;
  sourceKind: SourceKind;
  metrics: { likes: number; comments: number; shares: number };
  medians?: { likes: number; comments: number; shares: number } | null;
  ageDays: number | null;
  niche?: string | null;
  oldCodeWord: string | null;
  withImages: boolean;
}): string {
  const kindLine =
    input.sourceKind === 'winner'
      ? 'Тип исходника: ПОБЕДИТЕЛЬ (много комментариев) — повторяем с новым хуком на другой подаче.'
      : input.sourceKind === 'strongBody'
        ? 'Тип исходника: СИЛЬНАЯ НАЧИНКА, СЛАБЫЙ ХУК (репостят, но мало комментариев) — нужен гораздо более цепляющий хук.'
        : 'Тип исходника: обычный пост — сделай хук сильнее оригинала.';
  const med = input.medians
    ? ` (медиана блога: ${Math.round(input.medians.comments)} комм., ${Math.round(input.medians.shares)} репостов)`
    : '';
  return [
    kindLine,
    `Метрики оригинала: ${input.metrics.comments} комментариев, ${input.metrics.shares} репостов, ${input.metrics.likes} лайков${med}.`,
    input.ageDays != null ? `Оригинал вышел ${Math.round(input.ageDays)} дн. назад.` : '',
    `Слайдов в оригинале: ${input.slideCount} (1 — обложка, ${input.slideCount} — CTA).`,
    input.oldCodeWord ? `Старое кодовое слово: «${input.oldCodeWord}» — придумай другое.` : 'Старое кодовое слово не найдено.',
    input.niche ? `Ниша блога: ${input.niche}` : '',
    input.withImages ? 'Слайды приложены картинками по порядку — смотри на их содержание при выборе keep и хука.' : '',
    '',
    'Подпись оригинала:',
    input.caption.slice(0, 2500) || '(пусто)',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** Coerce the model's parsed JSON into RemixAi (drops anything malformed). */
export function coerceRemixAi(raw: unknown): RemixAi | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const hooks = Array.isArray(r.hooks)
    ? r.hooks
        .filter((h): h is Record<string, unknown> => Boolean(h) && typeof h === 'object')
        .map((h) => ({ title: String(h.title ?? ''), sub: String(h.sub ?? ''), why: String(h.why ?? '') }))
    : undefined;
  const keep = Array.isArray(r.keep) ? r.keep.map(Number).filter((x) => Number.isFinite(x)) : undefined;
  const out: RemixAi = {
    hooks,
    codeWord: typeof r.codeWord === 'string' ? r.codeWord : undefined,
    ctaPromise: typeof r.ctaPromise === 'string' ? r.ctaPromise : undefined,
    caption: typeof r.caption === 'string' ? r.caption : undefined,
    keep,
    rationale: typeof r.rationale === 'string' ? r.rationale : undefined,
    test: typeof r.test === 'string' ? r.test : undefined,
  };
  return out.hooks?.length || out.caption || out.codeWord ? out : null;
}
