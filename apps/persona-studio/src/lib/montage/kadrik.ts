// Клиент серверного API бота «Студия Кадрика» (@studio_kadrik_bot, /api/ext/jobs).
// Бот монтирует скиллом через Claude Code на своей машине без превью — сразу
// финал — и отдаёт результат файлом (видео, а у текстов и наборов клипов — zip).
// Авторизация — Bearer KADRIK_API_KEY (= PERSONA_API_KEY в .env бота).

import { env } from '@/lib/env';

export type KadrikStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type KadrikJob = {
  id: string;
  status: KadrikStatus;
  /** последняя строка работы Claude или причина ошибки */
  line: string;
  /** этап 0–5: транскрипт → план → сцены → рендер → готово */
  stage: number;
  /** место в очереди (0 — не в очереди) */
  pos: number;
  report: string;
  result: boolean;
};

export type KadrikCreate = {
  skill: string;
  /** http(s)-ссылка на исходник — бот скачивает его сам */
  source?: string;
  name?: string;
  link?: string;
  script?: string;
  code?: string;
  wish?: string;
  /** id заказа в Persona — для логов бота */
  ref?: string;
};

export class KadrikError extends Error {
  constructor(
    public code: string,
    message: string,
    /** 4xx от бота: повтор не поможет */
    public final = false,
  ) {
    super(message);
    this.name = 'KadrikError';
  }
}

export function kadrikConfigured() {
  return Boolean(env.KADRIK_API_URL && env.KADRIK_API_KEY);
}

async function call(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  if (!kadrikConfigured()) throw new KadrikError('KADRIK_NOT_CONFIGURED', 'KADRIK_API_URL / KADRIK_API_KEY не заданы', true);
  const res = await fetch(`${env.KADRIK_API_URL!.replace(/\/$/, '')}/api/ext/jobs${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.KADRIK_API_KEY}`, 'content-type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const final = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
    throw new KadrikError(`KADRIK_HTTP_${res.status}`, body.error ?? `HTTP ${res.status}`, final);
  }
  return res;
}

export async function createKadrikJob(input: KadrikCreate): Promise<KadrikJob> {
  const res = await call('', { method: 'POST', body: JSON.stringify(input) });
  return (await res.json()) as KadrikJob;
}

export async function getKadrikJob(id: string): Promise<KadrikJob> {
  const res = await call(`/${encodeURIComponent(id)}`);
  return (await res.json()) as KadrikJob;
}

export async function cancelKadrikJob(id: string): Promise<void> {
  await call(`/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

/** Результат задачи: поток файла, его имя и тип. */
export async function kadrikResult(id: string) {
  const res = await call(`/${encodeURIComponent(id)}/result`, {}, 1_800_000);
  if (!res.body) throw new KadrikError('KADRIK_EMPTY_RESULT', 'пустой ответ');
  return {
    body: res.body,
    name: res.headers.get('x-filename') ?? 'result.mp4',
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    size: Number(res.headers.get('content-length') ?? 0),
  };
}

/** Строка прогресса для карточки ролика. */
export function kadrikProgress(j: KadrikJob): string {
  if (j.status === 'queued') return j.pos ? `в очереди Кадрика · ${j.pos}-я` : 'в очереди Кадрика';
  const stage = ['запуск скилла', 'транскрипт', 'план монтажа', 'сцены и кадры', 'рендер', 'готово'][Math.min(Math.max(j.stage, 0), 5)];
  return j.line ? `${stage} · ${j.line}`.slice(0, 280) : stage;
}
