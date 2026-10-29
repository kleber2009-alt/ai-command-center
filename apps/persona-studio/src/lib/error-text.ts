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
  carousel_telegram_only: 'Карусели публикуются только в Telegram-каналы и Instagram.',
  generation_running: 'Дождитесь окончания генерации.',
  script_required: 'Напишите сценарий.',
  voice_required: 'Выберите голос.',
  aspect_unsupported: 'Этот формат кадра не поддерживается выбранным движком.',
  provider_not_configured: 'Генерация пока не подключена: администратору нужно добавить ключ провайдера.',
  not_configured: 'Функция пока не подключена на сервере.',
  FORBIDDEN: 'Недостаточно прав.',
  INSUFFICIENT_TOKENS: 'Недостаточно токенов.',
  too_many_files: 'Слишком много файлов за раз — максимум 10.',
  all_failed: 'Ни один файл не загрузился — проверьте формат и размер.',
  heic_decode_failed: 'Не удалось прочитать HEIC-фото — сохраните его как JPEG.',
  unknown_niche: 'Такой ниши нет — выберите из списка.',
  niche_slug_required: 'Выберите нишу.',
  custom_prompts_required: 'Добавьте хотя бы одно описание образа.',
  engine_disabled: 'Этот движок сейчас отключён — выберите другой.',
  audio_url_required: 'Загрузите аудио.',
  not_failed: 'Повторить можно только упавшую генерацию.',
  cover_not_ready: 'Обложка ещё не готова.',
  edit_not_ready: 'Монтаж ещё не готов.',
  montage_not_ready: 'Монтаж ещё не готов.',
  fetch_failed: 'Не удалось скачать файл — попробуйте ещё раз.',
  persona_required: 'Выберите персону для брифа.',
  avatar_required: 'У персоны нет аватара — добавьте его в «Персонах».',
  blocked_by_gate: 'Сценарий слишком похож на источник — перепишите его.',
  bad_stage: 'Этот шаг сейчас недоступен — обновите страницу.',
  no_script: 'Сначала сгенерируйте сценарий.',
  script_too_short: 'Сценарий слишком короткий.',
  script_locked: 'Сценарий уже отправлен в производство — менять нельзя.',
  source_reel_not_found: 'Исходный ролик не найден.',
  bad_avatar: 'Аватар не найден.',
  bad_style: 'Неизвестный стиль.',
  bad_index: 'Слайд не найден.',
  not_enough_slides: 'Нужно минимум 2 слайда.',
  not_editable: 'Пост уже опубликован — менять нельзя.',
  not_cancelable: 'Этот пост уже нельзя отменить.',
  already_in_flight: 'Уже выполняется — подождите.',
  trial_already_used: 'Пробный пакет уже использован.',
  cryptobot_create_failed: 'Не удалось создать счёт — попробуйте позже.',
  stars_create_failed: 'Не удалось создать счёт в Telegram — попробуйте позже.',
  connect_failed: 'Не удалось подключить канал — проверьте данные.',
  account_unavailable: 'Канал недоступен — переподключите его.',
  postmypost_error: 'PostMyPost вернул ошибку — попробуйте позже.',
  user_not_found: 'Пользователь не найден.',
  author_not_found: 'Автор не найден.',
  parser_item_not_found: 'Материал парсера не найден.',
  empty_username: 'Укажите username.',
  rewrite_failed: 'Не удалось переписать текст — попробуйте ещё раз.',
  transcribe_failed: 'Не удалось распознать речь — попробуйте ещё раз.',
  translate_failed: 'Не удалось перевести — попробуйте ещё раз.',
  analyze_failed: 'Не удалось сделать разбор — попробуйте ещё раз.',
  refresh_failed: 'Не удалось обновить данные — попробуйте ещё раз.',
  render_failed: 'Не удалось отрисовать — попробуйте ещё раз.',
  regen_failed: 'Не удалось перегенерировать слайд — попробуйте ещё раз.',
  split_failed: 'Не удалось разбить текст на слайды — попробуйте ещё раз.',
  parser_run_failed: 'Парсинг не удался — попробуйте позже.',
  no_source_text: 'У исходного поста нет текста — вставьте его вручную.',
  script_failed: 'Не удалось написать сценарий — попробуйте ещё раз.',
  heygen_list_failed: 'HeyGen не ответил — обновите список через минуту.',
  kadrik_not_configured: 'Монтаж по стилям пока не подключён администратором.',
  no_handle: 'Укажите ник своего Instagram.',
  bad_handle: 'Ник Instagram выглядит неверно.',
  apify_not_configured: 'Не задан ключ Apify — его добавляет администратор сервера.',
  apify_failed: 'Не удалось получить посты из Instagram — попробуйте позже.',
  no_posts: 'В аккаунте не нашлось рилсов и каруселей за этот период.',
  blog_run_failed: 'Не удалось обновить блог — попробуйте ещё раз.',
  no_source_slides: 'У исходной карусели нет слайдов — обновите блог из Instagram.',
  remix_failed: 'Не удалось придумать ремикс — попробуйте ещё раз.',
  not_carousel: 'Этот конвейер не для карусели.',
  no_draft: 'Сначала сделайте ремикс.',
  carousel_too_many_slides: 'В карусели больше 10 слайдов — уберите лишние для публикации.',
};

/**
 * Stored job error (VideoGeneration/VideoEdit/Montage/Cover/PostTarget.errorMsg)
 * → text for the user. Workers keep provider diagnostics there
 * (`HEYGEN_FAILED: …`, `OMNIHUMAN_TTS_HTTP_500: {…}`); we show only a Russian
 * explanation — the worker's own Russian part if it wrote one, else a generic line.
 */
export function jobErrorText(
  msg: string | null | undefined,
  generic = 'Генерация не удалась, токены возвращены. Попробуйте ещё раз.',
): string {
  const m = (msg ?? '').trim();
  if (!m) return generic;
  if (m === 'enqueue_failed' || m === 'retry_enqueue_failed') return TEXT.enqueue_failed;
  if (/^SOURCE_TOO_LONG/.test(m)) return 'Исходник слишком длинный — максимум 15 минут.';
  if (/^SOURCE_TOO_LARGE/.test(m)) return 'Исходник больше 1 ГБ — сожмите видео.';
  if (/^NO_AUDIO/.test(m)) return 'В исходнике нет звуковой дорожки.';
  // `CODE: русский текст` → русский текст; целиком русская строка — как есть.
  const tail = m.replace(/^[A-Z0-9_]+(?::\s*|\s+)/, '');
  if (/^[^a-z{]*[а-яё]/i.test(tail) && !/[{}]|https?:\/\//.test(tail)) return tail.slice(0, 200);
  return generic;
}

type ErrBody ={ error?: string; message?: string; have?: number; need?: number } | null | undefined;

export function errorText(body: ErrBody | string, status?: number): string {
  const b: ErrBody = typeof body === 'string' ? { error: body } : body;
  const code = b?.error;
  if (code === 'insufficient_tokens') {
    return b?.need != null ? `Недостаточно токенов: есть ${b.have ?? 0}, нужно ${b.need}.` : 'Недостаточно токенов.';
  }
  // A server-provided Russian message is the most specific text we have.
  if (b?.message && /[а-яё]/i.test(b.message)) return b.message;
  if (code && TEXT[code]) return TEXT[code];
  return status ? `Не получилось (код ${status}) — попробуйте ещё раз.` : 'Не получилось — попробуйте ещё раз.';
}

/** A caught exception → text for the user: our own Russian messages pass, network/JS errors don't. */
export function exceptionText(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (/[а-яё]/i.test(msg)) return msg;
  if (/fetch|network|load failed/i.test(msg)) return 'Нет связи с сервером — проверьте интернет и попробуйте ещё раз.';
  return errorText(null);
}
