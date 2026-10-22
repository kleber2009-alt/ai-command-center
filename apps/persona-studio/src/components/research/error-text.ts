/**
 * Maps API error responses to human-readable Russian text for the research UI.
 * Server routes return `{ error: code, message?, have?, need? }` — codes are
 * stable identifiers, messages may contain server internals, so known codes
 * always win over raw messages.
 */

type ApiErrorShape = {
  error?: string;
  message?: string;
  have?: number;
  need?: number;
};

const ERROR_TEXT: Record<string, string> = {
  apify_not_configured: 'Сервис поиска временно недоступен. Попробуй позже или напиши в поддержку.',
  over_budget: 'Лимит запросов к Instagram на этот месяц исчерпан. Попробуй позже.',
  unauthorized: 'Сессия истекла — войди заново.',
  not_found: 'Запись не найдена — возможно, она была удалена.',
  author_not_found: 'Автор не найден — возможно, профиль был удалён.',
  bad_request: 'Некорректный запрос. Обнови страницу и попробуй ещё раз.',
  no_results: 'Ничего не нашлось по этому запросу.',
  not_enough_reels: 'Недостаточно рилсов для анализа — попробуй другую нишу или расширь период.',
  no_transcript: 'У этого рилса ещё нет транскрипта — сначала сделай транскрибацию.',
  no_source_text: 'Нет исходного текста для этой операции.',
  empty_source: 'Источник пуст — нечего обрабатывать.',
  wrong_item_type: 'Эта операция недоступна для данного типа записи.',
  no_valid_formulas: 'Не выбрано ни одной корректной формулы.',
  transcribe_failed: 'Не удалось транскрибировать видео. Токены возвращены, попробуй ещё раз.',
  transcribe_error: 'Ошибка транскрибации. Токены возвращены, попробуй ещё раз.',
  translate_failed: 'Не удалось перевести текст. Токены возвращены, попробуй ещё раз.',
  translate_error: 'Ошибка перевода. Токены возвращены, попробуй ещё раз.',
  analyze_failed: 'Не удалось проанализировать рилс. Токены возвращены, попробуй ещё раз.',
  analyze_error: 'Ошибка анализа. Токены возвращены, попробуй ещё раз.',
  refresh_failed: 'Не удалось обновить данные автора. Токены возвращены, попробуй ещё раз.',
  refresh_error: 'Ошибка обновления автора. Токены возвращены, попробуй ещё раз.',
  rewrite_failed: 'Не удалось переписать текст. Попробуй ещё раз.',
  uniquify_failed: 'Не удалось уникализировать текст. Попробуй ещё раз.',
};

export function apiErrorText(json: unknown, status: number): string {
  const e = (json ?? {}) as ApiErrorShape;
  if (e.error === 'insufficient_tokens') {
    const detail =
      typeof e.have === 'number' && typeof e.need === 'number'
        ? ` У тебя ${e.have}, нужно ${e.need}.`
        : '';
    return `Недостаточно токенов.${detail} Пополнить можно на странице Billing.`;
  }
  if (e.error && ERROR_TEXT[e.error]) return ERROR_TEXT[e.error];
  if (status === 402) return 'Недостаточно токенов. Пополнить можно на странице Billing.';
  if (status === 503) return 'Сервис временно недоступен. Попробуй позже.';
  if (e.message) return e.message;
  if (e.error) return `Что-то пошло не так (${e.error}). Попробуй ещё раз.`;
  return `Что-то пошло не так (HTTP ${status}). Попробуй ещё раз.`;
}
