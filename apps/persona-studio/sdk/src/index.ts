/**
 * @persona-studio/sdk
 *
 * Тонкий typed-fetch клиент для Persona Studio API. Не тянет зависимостей —
 * использует только глобальный fetch (Node 18+ / любой современный браузер).
 *
 * Пример:
 *
 *   import { createPersonaClient } from '@persona-studio/sdk';
 *
 *   const ps = createPersonaClient({
 *     baseUrl: 'https://persona-app.46-62-215-11.nip.io',
 *     apiKey:  process.env.PERSONA_API_KEY!,
 *   });
 *
 *   const { id } = await ps.uploadPhoto(fs.createReadStream('./me.jpg'));
 *   const gen = await ps.generateAvatars({ uploadId: id });
 *   // poll до status==='completed'
 *   const video = await ps.createVideo({
 *     avatarId: 'av_...',
 *     script:   'Привет, это мой AI-двойник.',
 *     voiceId:  'ru-male-1',
 *   });
 */

// ── Domain types ────────────────────────────────────────────

export type VideoEngine = 'heygen-v5' | 'heygen-v4' | 'omnihuman-1.5';
export type EngineAspect = '9:16' | '1:1' | '16:9';
export type CoverAspect = '4:5' | '1:1' | '9:16';

export type UploadRecord = {
  id: string;
  url: string;
  type: string;
  bytes: number;
  createdAt?: string;
};

export type AvatarRecord = {
  id: string;
  userId: string;
  generationId: string;
  imageUrl: string;
  imageThumbUrl: string | null;
  style: string;
  styleLabel: string;
  status: 'pending' | 'done' | 'failed';
  promptUsed: string | null;
  selected: boolean;
  errorMsg: string | null;
  createdAt: string;
};

export type AvatarGenerationRecord = {
  id: string;
  userId: string;
  uploadId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  tokensCost: number;
  jobId: string | null;
  errorMsg: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  avatars: AvatarRecord[];
};

export type VideoRecord = {
  id: string;
  userId: string;
  avatarId: string;
  engine: VideoEngine;
  script: string | null;
  audioUrl: string | null;
  language: string;
  voiceId: string | null;
  aspect: EngineAspect;
  background: string | null;
  subtitles: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl: string | null;
  tokensCost: number;
  errorMsg: string | null;
  engineJobId: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type CoverRecord = {
  id: string;
  userId: string;
  avatarId: string;
  title: string;
  subtitle: string | null;
  cta: string | null;
  niche: string | null;
  style: string;
  aspect: CoverAspect;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl: string | null;
  tokensCost: number;
  errorMsg: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type BalanceResponse = {
  balance: number;
  plan: 'free' | 'starter' | 'pro' | 'agency' | string;
  recent: Array<{
    id: string;
    amount: number;
    type: string;
    reason: string;
    refId: string | null;
    createdAt: string;
  }>;
};

// ── Error class ──────────────────────────────────────────────

export class PersonaApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly raw: unknown;
  constructor(message: string, status: number, raw: unknown, code?: string) {
    super(message);
    this.name = 'PersonaApiError';
    this.status = status;
    this.code = code;
    this.raw = raw;
  }
}

// ── Client factory ───────────────────────────────────────────

export type PersonaClientOptions = {
  /** Base URL of your Persona Studio instance, без trailing-slash. */
  baseUrl: string;
  /** API key created in /settings/keys, формат `ps_<base64url>`. */
  apiKey: string;
  /** Custom fetch (например, для node-undici или mock в тестах). */
  fetch?: typeof fetch;
  /** Глобальный таймаут per request. По умолчанию 60s. */
  timeoutMs?: number;
};

export type CreateVideoInput = {
  avatarId: string;
  engine?: VideoEngine;
  script: string;
  voiceId: string;
  aspect?: EngineAspect;
  language?: string;
  background?: string;
  subtitles?: boolean;
};

export type CreateCoverInput = {
  avatarId: string;
  title: string;
  subtitle?: string;
  cta?: string;
  niche?: string;
  style?: string;
  aspect?: CoverAspect;
};

export function createPersonaClient(opts: PersonaClientOptions) {
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  if (!fetchImpl) {
    throw new Error('[persona-studio/sdk] No fetch implementation available — provide opts.fetch on Node <18');
  }
  if (!/^ps_[A-Za-z0-9_-]+$/.test(opts.apiKey)) {
    throw new Error('[persona-studio/sdk] apiKey must start with "ps_" — see /settings/keys');
  }

  async function request<T>(
    method: string,
    path: string,
    init?: { body?: unknown; formData?: FormData; query?: Record<string, string | number | undefined> },
  ): Promise<T> {
    const url = new URL(baseUrl + path);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.apiKey}`,
      Accept: 'application/json',
    };

    let body: BodyInit | undefined;
    if (init?.formData) {
      body = init.formData;
    } else if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), { method, headers, body, signal: controller.signal });
    } catch (e) {
      if ((e as { name?: string } | null)?.name === 'AbortError') {
        throw new PersonaApiError(`Request timeout after ${timeoutMs}ms`, 0, null, 'TIMEOUT');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      const errObj = (parsed && typeof parsed === 'object' ? parsed : {}) as { error?: string };
      throw new PersonaApiError(
        errObj.error ?? `HTTP ${res.status}`,
        res.status,
        parsed,
        errObj.error,
      );
    }
    return parsed as T;
  }

  return {
    /**
     * Загрузить фото пользователя. Принимает Blob/File (браузер), Buffer (Node),
     * или ReadableStream через FormData. Возвращает upload id, который надо
     * передать в `generateAvatars`.
     */
    async uploadPhoto(file: Blob | { name: string; data: Buffer; type: string }): Promise<UploadRecord> {
      const fd = new FormData();
      if (file instanceof Blob) {
        fd.append('file', file);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blob = new Blob([file.data as any], { type: file.type });
        fd.append('file', blob, file.name);
      }
      return request<UploadRecord>('POST', '/api/upload', { formData: fd });
    },

    /** Список загрузок пользователя (последние 20). */
    listUploads(): Promise<{ uploads: UploadRecord[] }> {
      return request('GET', '/api/upload');
    },

    /**
     * Стартовать генерацию 10 аватаров из одного фото. Возвращает generationId
     * и tokensCharged; статус надо опросить через getAvatarGeneration.
     */
    generateAvatars(input: { uploadId: string }): Promise<{
      id: string;
      status: string;
      avatarsPending: number;
      tokensCharged: number;
    }> {
      return request('POST', '/api/generate-avatars', { body: input });
    },

    /** Получить текущий статус batch-генерации и сами аватары. */
    getAvatarGeneration(id: string): Promise<AvatarGenerationRecord> {
      return request('GET', '/api/generate-avatars', { query: { id } });
    },

    /** Список всех аватаров пользователя. */
    listAvatars(opts?: { generationId?: string; limit?: number }): Promise<{ avatars: AvatarRecord[] }> {
      return request('GET', '/api/avatars', { query: { generationId: opts?.generationId, limit: opts?.limit } });
    },

    /** Пометить аватар выбранным внутри batch (один на batch). */
    selectAvatar(id: string): Promise<{ ok: true; id: string }> {
      return request('POST', `/api/avatars/${id}/select`);
    },

    /** Удалить аватар. */
    deleteAvatar(id: string): Promise<{ ok: true }> {
      return request('DELETE', `/api/avatars/${id}/select`);
    },

    /**
     * Создать talking-photo видео из выбранного аватара. По умолчанию engine —
     * `heygen-v5`. Возвращает id видео; статус через getVideo.
     */
    createVideo(input: CreateVideoInput): Promise<{ id: string; status: string; engine: VideoEngine }> {
      return request('POST', '/api/videos', { body: input });
    },

    /** Получить статус и результат видео. */
    getVideo(id: string): Promise<VideoRecord> {
      return request('GET', '/api/videos', { query: { id } });
    },

    /** Список видео. */
    listVideos(limit?: number): Promise<{ videos: VideoRecord[] }> {
      return request('GET', '/api/videos', { query: { limit } });
    },

    /** Создать обложку (cover) карусели из аватара. */
    createCover(input: CreateCoverInput): Promise<{ id: string; status: string }> {
      return request('POST', '/api/generate-cover', { body: input });
    },

    /** Получить статус и результат обложки. */
    getCover(id: string): Promise<CoverRecord> {
      return request('GET', '/api/generate-cover', { query: { id } });
    },

    /** Список обложек. */
    listCovers(limit?: number): Promise<{ covers: CoverRecord[] }> {
      return request('GET', '/api/covers', { query: { limit } });
    },

    /** Текущий баланс токенов + последние 20 транзакций. */
    getBalance(): Promise<BalanceResponse> {
      return request('GET', '/api/billing/balance');
    },

    /**
     * Polling-хелпер: ждать пока ресурс не выйдет из `pending|processing`.
     * Возвращает финальное состояние или кидает PersonaApiError на timeout.
     */
    async waitFor<T extends { status: string }>(
      poll: () => Promise<T>,
      opts?: { maxMs?: number; intervalMs?: number },
    ): Promise<T> {
      const deadline = Date.now() + (opts?.maxMs ?? 10 * 60_000);
      const interval = opts?.intervalMs ?? 5_000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const current = await poll();
        if (current.status !== 'pending' && current.status !== 'processing') return current;
        if (Date.now() > deadline) {
          throw new PersonaApiError('waitFor: timeout', 0, current, 'WAIT_TIMEOUT');
        }
        await new Promise((r) => setTimeout(r, interval));
      }
    },
  };
}

export type PersonaClient = ReturnType<typeof createPersonaClient>;
