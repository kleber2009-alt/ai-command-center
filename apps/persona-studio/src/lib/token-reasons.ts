// TokenTransaction.reason / .type → человекочитаемая подпись для истории
// транзакций. Reason пишется в коде как `<operation>[:<detail>]`
// (напр. `video:heygen-v5:retry`, `cover-generation:failed`, `research_analyze`);
// сырые коды в интерфейс не выводим.

const OPERATION: Array<[RegExp, string]> = [
  [/^avatar-generation/, 'Аватары'],
  [/^cover-generation/, 'Обложка'],
  [/^(video|heygen-video|omnihuman-video):?/, 'Видео'],
  [/^studio-video/, 'Воркспейс · видео'],
  [/^studio-montage/, 'Воркспейс · монтаж'],
  [/^studio-script/, 'Воркспейс · сценарий'],
  [/^submagic-edit/, 'Монтаж Submagic'],
  [/^skill-montage/, 'Монтаж по скиллу'],
  [/^slide-image/, 'AI-картинка слайда'],
  [/^research_transcribe/, 'Ресёрч · транскрипция'],
  [/^research_translate/, 'Ресёрч · перевод'],
  [/^research_analyze/, 'Ресёрч · разбор ролика'],
  [/^research_page_analyze/, 'Ресёрч · разбор автора'],
  [/^research_refresh/, 'Ресёрч · обновление автора'],
  [/^research_add_author/, 'Ресёрч · добавление автора'],
  [/^research_hook_gen/, 'Ресёрч · генерация хуков'],
  [/^cryptobot/, 'Покупка · CryptoBot'],
  [/^stars/, 'Покупка · Telegram Stars'],
  [/^welcome|^signup/, 'Приветственный бонус'],
];

const OUTCOME: Array<[RegExp, string]> = [
  [/enqueue-failed|enqueue_failed/, 'не запустилось'],
  [/partial/, 'частичный возврат'],
  [/fail|error|refund/, 'ошибка генерации'],
  [/retry/, 'повтор'],
];

export function reasonLabel(reason: string | null | undefined): string {
  const r = (reason ?? '').trim();
  if (!r) return '—';
  const op = OPERATION.find(([re]) => re.test(r))?.[1];
  // Free text (e.g. an admin's note) is shown as is; an unknown code is not.
  if (!op) return /^[a-z0-9_:.\-]+$/.test(r) ? 'Операция' : r;
  const outcome = OUTCOME.find(([re]) => re.test(r))?.[1];
  return outcome ? `${op} — ${outcome}` : op;
}

const TYPE: Record<string, string> = {
  charge: 'списание',
  refund: 'возврат',
  purchase: 'покупка',
  manual: 'начисление',
  signup_bonus: 'бонус',
};

export function txTypeLabel(type: string): string {
  return TYPE[type] ?? type;
}
