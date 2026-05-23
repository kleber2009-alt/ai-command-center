// Thin Qdrant REST client. We only need ensureCollection / upsert /
// search — not worth pulling in @qdrant/js-client-rest for that.
//
// Schema is multi-source so the same collection backs tg-agent
// messages, transcribe transcripts/summaries, and any future source:
//   source — short slug of the origin app ('tg-agent', 'transcribe', …)
//   kind   — what the row is ('message', 'transcript', 'summary',
//            'document', …). UI surfaces icons by source+kind.
//   owner_telegram_id — Ilia's tg id, copied onto every row so the
//            search endpoint can scope to "his" brain even though the
//            embedding lives in a shared collection.
//   chat_id / chat_title / user_id / username — tg-agent fields
//            (nullable for non-tg sources).
//   title / url — transcribe / document fields (nullable for
//            tg-agent). title backs the result-card heading;
//            url lets the UI deep-link back to the original asset.
//   class — tg-agent classifier label (nullable elsewhere).
//   text  — the embedded text, stored on the payload so search
//            results are self-contained.

export interface QdrantPayload {
  source: string;
  kind: string;
  owner_telegram_id: number | null;
  chat_id: number | null;
  chat_title: string | null;
  user_id: number | null;
  username: string | null;
  class: string | null;
  title: string | null;
  url: string | null;
  text: string;
  created_at: string;
}

// Point IDs are UUIDs so different sources can share the collection
// without integer-key collisions. Helper `pointIdFor(source, key)`
// (in service.ts) yields deterministic UUID v5s.
export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: QdrantPayload;
}

export interface QdrantSearchHit {
  id: string;
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
        result: Array<{ id: string; score: number; payload: QdrantPayload }>;
      };
      const body: Record<string, unknown> = {
        vector,
        limit,
        with_payload: true,
      };
      if (filter) body.filter = filter;
      const res = await req<SearchResp>('POST', `/collections/${coll}/points/search`, body);
      return res.result.map((r) => ({ id: String(r.id), score: r.score, payload: r.payload }));
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
