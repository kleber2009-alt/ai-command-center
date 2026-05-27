// Shared catalog of carousel author styles. Used by:
// - the /transcribe UI Style Picker
// - /api/transcribe/generate to inject a style block into the Claude prompt
//
// Keep this lightweight — the prompt is what shapes the output, the entries
// just give the UI a label + the model a one-line authorial voice anchor.

export type CarouselStyleId = 'auto' | 'minimal' | 'clickbait-bold' | 'knox-cream' | 'storyteller'

export type CarouselStyle = {
  id: CarouselStyleId
  label: string
  hint: string
  /** Injected verbatim into the prompt when the user picks this style. */
  prompt: string
}

export const CAROUSEL_STYLES: CarouselStyle[] = [
  {
    id: 'auto',
    label: 'Авто',
    hint: 'Сбалансированный стиль, без авторского голоса',
    prompt: '',
  },
  {
    id: 'minimal',
    label: 'Persona Minimal',
    hint: 'Сухо, точно, без воды. Заголовки 3-5 слов, тело 1-2 предложения.',
    prompt:
      'Стиль автора: «Persona Minimal». Сухо, по делу, без украшательств. Заголовки 3-5 слов. Тело — одно-два коротких предложения. Никакой воды и риторических вопросов. Никакого "сейчас расскажу".',
  },
  {
    id: 'clickbait-bold',
    label: 'Clickbait Bold',
    hint: 'Громко, провокационно, заголовки-крюки.',
    prompt:
      'Стиль автора: «Clickbait Bold». Громкие заголовки-крюки (контраст / неочевидный факт / шокирующее число). Прямой агрессивный тон, активный залог. Каждый слайд оставляет ощущение "досмотри до конца". Внутри слайда — одна сильная мысль, без водянистых отступлений.',
  },
  {
    id: 'knox-cream',
    label: 'Knox Cream',
    hint: 'Тёплый storytelling в духе theromanknox.',
    prompt:
      'Стиль автора: «theromanknox / Knox Cream». Тёплый storytelling от первого лица: маленькая сцена, наблюдение, вывод. Слайды звучат как короткие записи в дневнике, а не как лекция. Меньше канцелярита, больше живых деталей и метафор.',
  },
  {
    id: 'storyteller',
    label: 'Storyteller',
    hint: 'Каждый слайд — мини-сцена с конкретикой.',
    prompt:
      'Стиль автора: «Storyteller». Каждый слайд — маленькая сцена или конкретный пример из транскрипта (имена, цифры, обстановка). Никаких абстрактных тезисов без иллюстрации. Тон спокойный, повествовательный.',
  },
]

const BY_ID = new Map(CAROUSEL_STYLES.map((s) => [s.id, s]))

export const DEFAULT_CAROUSEL_STYLE: CarouselStyleId = 'auto'

export function isValidCarouselStyle(id: unknown): id is CarouselStyleId {
  return typeof id === 'string' && BY_ID.has(id as CarouselStyleId)
}

export function getCarouselStyle(id: CarouselStyleId | undefined | null): CarouselStyle {
  return BY_ID.get(id as CarouselStyleId) ?? BY_ID.get(DEFAULT_CAROUSEL_STYLE)!
}
