// Каталог хук-формул (ТЗ §9). Используется в UI (фильтр в галерее) и
// в Claude-промпте генератора (POST /hooks/generate). Один источник
// правды — здесь.

export type HookFormulaDef = {
  slug: string;          // 'вопрос' | 'кейс' | ... — пишется в БД
  label: string;         // UI-лейбл
  description: string;   // что делает формула
  template: string;      // шаблон с [переменными в квадратных скобках]
};

export const HOOK_FORMULAS: HookFormulaDef[] = [
  {
    slug: 'вопрос',
    label: 'Вопрос',
    description: 'Открывающий вопрос, который заставляет смотреть дальше.',
    template: 'А ты знал, что [неожиданный факт о нише]?',
  },
  {
    slug: 'кейс',
    label: 'Кейс',
    description: 'Конкретный кейс с цифрой результата.',
    template: 'Как [персонаж] сделал [результат] за [срок].',
  },
  {
    slug: 'личный опыт',
    label: 'Личный опыт',
    description: 'Личное признание автора, которое раскрывает тему.',
    template: 'Год назад я [действие]. Сейчас [результат]. Вот что произошло.',
  },
  {
    slug: 'негатив',
    label: 'Негатив',
    description: 'Описание того, чего делать НЕ надо.',
    template: 'Никогда не делай [действие] если [условие].',
  },
  {
    slug: 'обучение',
    label: 'Обучение',
    description: 'Прямое обещание научить.',
    template: 'За 30 секунд научу [навыку], который [польза].',
  },
  {
    slug: 'проблема',
    label: 'Проблема',
    description: 'Озвученная боль аудитории.',
    template: 'Если у тебя [проблема] — это видео для тебя.',
  },
  {
    slug: 'против течения',
    label: 'Против течения',
    description: 'Контр-интуитивное утверждение, против мейнстрима.',
    template: 'Все говорят [мейнстрим], но на самом деле [правда].',
  },
  {
    slug: 'секрет',
    label: 'Секрет',
    description: 'Обещание раскрыть «секрет», который не очевиден.',
    template: 'Секрет [темы], о котором никто не говорит.',
  },
  {
    slug: 'список',
    label: 'Список',
    description: 'Нумерованный обход.',
    template: '[N] [пункт] которые [польза/боль].',
  },
  {
    slug: 'сравнение',
    label: 'Сравнение',
    description: 'A vs B — наглядное противопоставление.',
    template: '[A] vs [B] — что лучше для [цель].',
  },
];

export const HOOK_FORMULA_SLUGS = HOOK_FORMULAS.map((f) => f.slug);

export function isValidFormulaSlug(s: string): boolean {
  return HOOK_FORMULA_SLUGS.includes(s.toLowerCase());
}

export function getFormula(slug: string): HookFormulaDef | null {
  return HOOK_FORMULAS.find((f) => f.slug === slug.toLowerCase()) || null;
}
