// API error code → человекочитаемый текст для клиента. Сырые коды (snake_case)
// в интерфейс не выводим; неизвестный код → общий текст со статусом.

const TEXT: Record<string, string> = {
  UNAUTHORIZED: 'Сессия истекла — войдите снова.',
  bad_body: 'Проверьте заполнение формы.',
  bad_request: 'Проверьте заполнение формы.',
  bad_form: 'Не удалось прочитать форму — попробуйте ещё раз.',
  consent_required: 'Подтвердите согласие на обработку фото.',
  moderation_failed: 'Фото не прошло модерацию — загрузите другое (лицо в кадре, без обнажёнки и чужих людей).',
  upload_not_found: 'Фото не найдено — загрузите его заново.',
  upload_not_ready: 'Фото ещё обрабатывается — подождите пару секунд.',
  avatar_not_found: 'Аватар не найден.',
  avatar_not_ready: 'Аватар ещё генерируется.',
  video_not_found: 'Видео не найдено.',
  video_not_ready: 'Видео ещё не готово.',
  source_not_found: 'Материал не найден.',
  source_not_ready: 'Материал ещё не готов.',
  enqueue_failed: 'Очередь недоступна — токены возвращены, попробуйте позже.',
  internal_error: 'Что-то пошло не так на сервере — попробуйте ещё раз.',
  no_transcriber: 'Распознавание речи не настроено на сервере.',
  claude_not_configured: 'Генерация текста не настроена на сервере.',
  quota_exceeded: 'Достигнут лимит загрузок — удалите старые фото.',
  file_too_large: 'Файл слишком большой.',
  unsupported_mime: 'Этот формат файла не поддерживается.',
  no_file: 'Выберите файл.',
  not_found: 'Не найдено.',
  account_not_found: 'Канал публикации не найден.',
  account_inactive: 'Канал отключён — переподключите его.',
  carousel_telegram_only: 'Карусели пока публикуются только в Telegram-каналы.',
  generation_running: 'Дождитесь окончания генерации.',
  script_required: 'Напишите сценарий.',
  voice_required: 'Выберите голос.',
  aspect_unsupported: 'Этот формат кадра не поддерживается выбранным движком.',
};

type ErrBody = { error?: string; message?: string; have?: number; need?: number } | null | undefined;

export function errorText(body: ErrBody | string, status?: number): string {
  const b: ErrBody = typeof body === 'string' ? { error: body } : body;
  const code = b?.error;
  if (code === 'insufficient_tokens') {
    return b?.need != null ? `Недостаточно токенов: есть ${b.have ?? 0}, нужно ${b.need}.` : 'Недостаточно токенов.';
  }
  if (code && TEXT[code]) return TEXT[code];
  // Server-provided Russian message wins over a generic fallback.
  if (b?.message && /[а-яё]/i.test(b.message)) return b.message;
  return status ? `Не получилось (код ${status}) — попробуйте ещё раз.` : 'Не получилось — попробуйте ещё раз.';
}
