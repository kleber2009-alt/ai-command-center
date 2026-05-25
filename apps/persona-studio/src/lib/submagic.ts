// Submagic API client.
//
// Submagic — внешний AI-монтажный сервис: принимает видео-URL, накладывает
// captions/шаблон, отдаёт готовый mp4. Их публичный REST API живёт на
// api.submagic.co/v1. Документация: https://docs.submagic.co/api-reference.
//
// Здесь — тонкая обёртка под наши нужды:
//   createProject  — POST /projects (создаёт проект из исходного видео-URL)
//   getProject     — GET  /projects/{id} (статус + downloadUrl когда completed)
//   waitForProject — поллинг до completed/failed
//   downloadBytes  — скачивает готовый mp4 (для re-hosting в нашем MinIO)
//
// API-key передаётся через Authorization: Bearer header.

import { env } from './env';

export class SubmagicError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'SubmagicError';
  }
}

type CreateProjectInput = {
  videoUrl: string;
  templateName: string;
  language: string;
  subtitlesEnabled: boolean;
  projectName?: string;
};

type SubmagicProjectStatus = 'pending' | 'processing' | 'completed' | 'failed' | string;

export type SubmagicProject = {
  id: string;
  status: SubmagicProjectStatus;
  downloadUrl?: string | null;
  errorMessage?: string | null;
};

function apiKey(): string {
  const key = env.SUBMAGIC_API_KEY;
  if (!key) {
    throw new SubmagicError('SUBMAGIC_NO_API_KEY', 'SUBMAGIC_API_KEY is not configured');
  }
  return key;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey()}`,
    ...extra,
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const txt = await res.text();
    return txt.slice(0, 500);
  } catch {
    return res.statusText;
  }
}

export async function createProject(input: CreateProjectInput): Promise<SubmagicProject> {
  const body = {
    title: input.projectName ?? `persona-studio-${Date.now()}`,
    videoUrl: input.videoUrl,
    templateName: input.templateName,
    language: input.language,
    captions: input.subtitlesEnabled,
    magicZooms: true,
    magicBrolls: false,
  };

  const res = await fetch(`${env.SUBMAGIC_API_BASE}/projects`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new SubmagicError(`SUBMAGIC_CREATE_${res.status}`, await readError(res));
  }
  const data = (await res.json()) as Record<string, unknown>;
  const id = (data.id ?? data.projectId) as string | undefined;
  if (!id) {
    throw new SubmagicError('SUBMAGIC_NO_ID', `unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return {
    id,
    status: ((data.status as string) ?? 'pending') as SubmagicProjectStatus,
    downloadUrl: (data.downloadUrl as string) ?? (data.videoUrl as string) ?? null,
  };
}

export async function getProject(id: string): Promise<SubmagicProject> {
  const res = await fetch(`${env.SUBMAGIC_API_BASE}/projects/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: headers(),
  });
  if (!res.ok) {
    throw new SubmagicError(`SUBMAGIC_GET_${res.status}`, await readError(res));
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    id,
    status: ((data.status as string) ?? 'processing') as SubmagicProjectStatus,
    downloadUrl: (data.downloadUrl as string) ?? (data.videoUrl as string) ?? null,
    errorMessage: (data.errorMessage as string) ?? (data.error as string) ?? null,
  };
}

export async function waitForProject(id: string): Promise<SubmagicProject> {
  const deadline = Date.now() + env.SUBMAGIC_MAX_POLL_MS;
  let last: SubmagicProject | null = null;
  while (Date.now() < deadline) {
    last = await getProject(id);
    if (last.status === 'completed') return last;
    if (last.status === 'failed') {
      throw new SubmagicError('SUBMAGIC_FAILED', last.errorMessage ?? 'project failed');
    }
    await new Promise((r) => setTimeout(r, env.SUBMAGIC_POLL_INTERVAL_MS));
  }
  throw new SubmagicError('SUBMAGIC_TIMEOUT', `project ${id} did not complete in ${env.SUBMAGIC_MAX_POLL_MS}ms (last status=${last?.status ?? 'unknown'})`);
}

export async function downloadBytes(url: string): Promise<{ bytes: Buffer; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new SubmagicError(`SUBMAGIC_DOWNLOAD_${res.status}`, await readError(res));
  }
  const mime = res.headers.get('content-type') ?? 'video/mp4';
  const ab = await res.arrayBuffer();
  return { bytes: Buffer.from(ab), mime };
}
