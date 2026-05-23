// Thin Qdrant REST client. We only need ensureCollection / upsert /
// search — not worth pulling in @qdrant/js-client-rest for that.

export interface QdrantPayload {
  chat_id: number;
  chat_title: string | null;
  user_id: number | null;
  username: string | null;
  class: string | null;
  text: string;
  created_at: string;
}

export interface QdrantPoint {
  id: number;
  vector: number[];
  payload: QdrantPayload;
}

export interface QdrantSearchHit {
  id: number;
  score: number;
  payload: QdrantPayload;
}

export interface QdrantFilter {
  must?: Array<
    | { key: string; match: { value: string | number } }
    | { key: string; range: { gte?: string; lte?: string } }
  >;
}

export interface QdrantClient {
  ensureCollection(vectorSize: number): Promise<void>;
  upsert(points: QdrantPoint[]): Promise<void>;
  search(vector: number[], limit: number, filter?: QdrantFilter): Promise<QdrantSearchHit[]>;
  collectionInfo(): Promise<{ pointsCount: number; vectorSize: number | null } | null>;
}

export interface QdrantClientOptions {
  url: string;
  collection: string;
  apiKey?: string;
}

export function createQdrantClient(opts: QdrantClientOptions): QdrantClient {
  const base = opts.url.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.apiKey) headers['api-key'] = opts.apiKey;

  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`qdrant ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  const coll = opts.collection;

  return {
    async ensureCollection(vectorSize: number): Promise<void> {
      type CollResp = { status?: string; result?: { config?: { params?: { vectors?: { size?: number } } } } };
      const probe = await fetch(`${base}/collections/${coll}`, { headers });
      if (probe.ok) {
        const json = (await probe.json()) as CollResp;
        const existing = json.result?.config?.params?.vectors?.size;
        if (existing != null && existing !== vectorSize) {
          throw new Error(
            `qdrant collection "${coll}" has vector size ${existing}, expected ${vectorSize}. ` +
              `Drop the collection or pick a different EMBEDDING_MODEL.`,
          );
        }
        return;
      }
      if (probe.status !== 404) {
        throw new Error(`qdrant probe ${probe.status}: ${await probe.text()}`);
      }
      await req('PUT', `/collections/${coll}`, {
        vectors: { size: vectorSize, distance: 'Cosine' },
      });
    },

    async upsert(points): Promise<void> {
      if (points.length === 0) return;
      await req('PUT', `/collections/${coll}/points?wait=true`, { points });
    },

    async search(vector, limit, filter): Promise<QdrantSearchHit[]> {
      type SearchResp = {
        result: Array<{ id: number; score: number; payload: QdrantPayload }>;
      };
      const body: Record<string, unknown> = {
        vector,
        limit,
        with_payload: true,
      };
      if (filter) body.filter = filter;
      const res = await req<SearchResp>('POST', `/collections/${coll}/points/search`, body);
      return res.result.map((r) => ({ id: r.id, score: r.score, payload: r.payload }));
    },

    async collectionInfo(): Promise<{ pointsCount: number; vectorSize: number | null } | null> {
      const probe = await fetch(`${base}/collections/${coll}`, { headers });
      if (!probe.ok) return null;
      type Resp = {
        result?: {
          points_count?: number;
          config?: { params?: { vectors?: { size?: number } } };
        };
      };
      const json = (await probe.json()) as Resp;
      return {
        pointsCount: json.result?.points_count ?? 0,
        vectorSize: json.result?.config?.params?.vectors?.size ?? null,
      };
    },
  };
}
