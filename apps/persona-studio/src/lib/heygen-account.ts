// Browsing the owner's HeyGen account: avatar looks and voices.
//
// Endpoints (validated against the real account 2026-10-29):
//   GET /v3/avatars/looks?ownership=private|public&limit≤50&token=…
//     → { data: Look[], has_more, next_token }
//     Look: { id, name, avatar_type: digital_twin|photo_avatar|studio_avatar,
//             group_id, preview_image_url, preview_video_url, gender,
//             default_voice_id, supported_api_engines: [avatar_v, avatar_iv,
//             avatar_iii], preferred_orientation, status (private only) }
//     `id` is what POST /v3/videos takes as `avatar_id`.
//   GET /v3/voices?type=private|public&language=…&limit≤100&token=…
//     → { data: Voice[], has_more, next_token }
//     Voice: { voice_id, name, language ('Russian' | 'ru' | 'English' |
//              'unknown' …), gender, preview_audio_url, type, default_engine,
//              available_engines }
//
// v2 GET /v2/avatars mixes the public library in (1300+ avatars, 8000+ talking
// photos, 4 MB) with no ownership flag, so the v3 endpoints are used instead.
// Listing is free; results are cached in memory for 5 minutes per process —
// the account is global (one HEYGEN_API_KEY), not per user.

import { HeygenError } from './heygen';

const BASE = () => process.env.HEYGEN_API_BASE || 'https://api.heygen.com';
const TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 5 * 60_000;
const MAX_PAGES = 10;

// ── Raw shapes ───────────────────────────────────────────────────────────

export type RawLook = {
  id?: string;
  name?: string | null;
  avatar_type?: string | null;
  group_id?: string | null;
  preview_image_url?: string | null;
  preview_video_url?: string | null;
  gender?: string | null;
  default_voice_id?: string | null;
  supported_api_engines?: string[] | null;
  preferred_orientation?: string | null;
  status?: string | null;
};

export type RawVoice = {
  voice_id?: string;
  name?: string | null;
  language?: string | null;
  gender?: string | null;
  preview_audio_url?: string | null;
  type?: string | null;
  default_engine?: string | null;
};

type Page<T> = { data?: T[]; has_more?: boolean; next_token?: string | null };

// ── Compact view (client-safe) ───────────────────────────────────────────

export type HeygenLookType = 'digital_twin' | 'photo_avatar' | 'studio_avatar';
export type HeygenRenderEngine = 'avatar_v' | 'avatar_iv' | 'avatar_iii';

export type HeygenAvatarItem = {
  id: string;
  name: string;
  type: HeygenLookType;
  /** human label: «Цифровой двойник» / «Фото-аватар» / «Студийный» */
  typeLabel: string;
  groupId: string | null;
  previewImage: string | null;
  previewVideo: string | null;
  gender: string | null;
  defaultVoiceId: string | null;
  orientation: 'portrait' | 'landscape' | 'square' | null;
  /** engines POST /v3/videos accepts for this look */
  engines: HeygenRenderEngine[];
  /** engine we use by default (best one available) */
  engine: HeygenRenderEngine | null;
  private: boolean;
};

export type HeygenVoiceItem = {
  id: string;
  name: string;
  /** normalized ISO-ish code: ru | en | … | '' when unknown */
  lang: string;
  /** label as HeyGen gives it, for display */
  language: string;
  gender: 'male' | 'female' | null;
  previewAudio: string | null;
  private: boolean;
};

const TYPE_LABEL: Record<HeygenLookType, string> = {
  digital_twin: 'Цифровой двойник',
  photo_avatar: 'Фото-аватар',
  studio_avatar: 'Студийный аватар',
};

const ENGINE_ORDER: HeygenRenderEngine[] = ['avatar_v', 'avatar_iv', 'avatar_iii'];

function lookType(t: string | null | undefined): HeygenLookType {
  return t === 'digital_twin' || t === 'photo_avatar' || t === 'studio_avatar' ? t : 'photo_avatar';
}

/** Best engine for a look: Avatar V if offered, else IV, else III. */
export function pickEngine(engines: readonly string[]): HeygenRenderEngine | null {
  for (const e of ENGINE_ORDER) if (engines.includes(e)) return e;
  return null;
}

export function mapLook(raw: RawLook, isPrivate: boolean): HeygenAvatarItem | null {
  if (!raw.id) return null;
  // Private looks still training / waiting for consent / failed can't render.
  if (isPrivate && raw.status && raw.status !== 'completed') return null;
  const engines = (raw.supported_api_engines ?? []).filter((e): e is HeygenRenderEngine =>
    (ENGINE_ORDER as string[]).includes(e),
  );
  const type = lookType(raw.avatar_type);
  const o = raw.preferred_orientation;
  return {
    id: raw.id,
    name: (raw.name ?? '').trim() || 'Без названия',
    type,
    typeLabel: TYPE_LABEL[type],
    groupId: raw.group_id ?? null,
    previewImage: raw.preview_image_url || null,
    previewVideo: raw.preview_video_url || null,
    gender: raw.gender && raw.gender !== 'unknown' ? raw.gender : null,
    defaultVoiceId: raw.default_voice_id || null,
    orientation: o === 'portrait' || o === 'landscape' || o === 'square' ? o : null,
    engines,
    engine: pickEngine(engines),
    private: isPrivate,
  };
}

const LANG_CODES: Record<string, string> = {
  russian: 'ru', english: 'en', ukrainian: 'uk', spanish: 'es', german: 'de', french: 'fr',
  italian: 'it', portuguese: 'pt', polish: 'pl', turkish: 'tr', kazakh: 'kk', chinese: 'zh',
  japanese: 'ja', korean: 'ko', arabic: 'ar', hindi: 'hi', multilingual: 'multi',
};

/** 'Russian' / 'ru' / 'ru-RU' / 'unknown' → 'ru' / 'ru' / 'ru' / '' */
export function normalizeLang(language: string | null | undefined): string {
  const l = (language ?? '').trim().toLowerCase();
  if (!l || l === 'unknown') return '';
  if (LANG_CODES[l]) return LANG_CODES[l];
  const m = /^([a-z]{2})(?:[-_][a-z]{2})?$/.exec(l);
  if (m) return m[1];
  const first = l.split(/[\s(]/)[0];
  return LANG_CODES[first] ?? '';
}

export function mapVoice(raw: RawVoice, isPrivate: boolean): HeygenVoiceItem | null {
  if (!raw.voice_id) return null;
  const g = (raw.gender ?? '').toLowerCase();
  const language = (raw.language ?? '').trim();
  return {
    id: raw.voice_id,
    name: (raw.name ?? '').trim() || 'Без названия',
    lang: normalizeLang(language),
    language: language && language.toLowerCase() !== 'unknown' ? language : '',
    gender: g === 'male' || g === 'female' ? g : null,
    previewAudio: raw.preview_audio_url || null,
    private: isPrivate,
  };
}

/** private first, then the preferred language (ru), then by name; deduped by id. */
export function sortVoices(list: HeygenVoiceItem[], preferLang = 'ru'): HeygenVoiceItem[] {
  const seen = new Set<string>();
  const uniq = list.filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
  // HeyGen's `language=Russian` filter also returns Multilingual voices — they
  // speak Russian too, so they come right after the Russian ones.
  const rank = (v: HeygenVoiceItem) => (v.private ? 0 : 3) + (v.lang === preferLang ? 0 : v.lang === 'multi' ? 1 : 2);
  return uniq.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'ru'));
}

/** private first; within a bucket keep HeyGen's order (newest first); deduped. */
export function sortAvatars(list: HeygenAvatarItem[]): HeygenAvatarItem[] {
  const seen = new Set<string>();
  const uniq = list.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  return uniq
    .map((a, i) => ({ a, i }))
    .sort((x, y) => Number(y.a.private) - Number(x.a.private) || x.i - y.i)
    .map((x) => x.a);
}

// ── Fetching ─────────────────────────────────────────────────────────────

function key(): string {
  const k = process.env.HEYGEN_API_KEY;
  if (!k) throw new HeygenError('MISSING_KEY', 'HEYGEN_API_KEY is not set');
  return k;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE()}${path}`, {
    headers: { 'X-Api-Key': key(), Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new HeygenError(`LIST_HTTP_${res.status}`, text.slice(0, 300));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HeygenError('LIST_NON_JSON', text.slice(0, 200));
  }
}

async function allPages<T>(path: string, maxPages = MAX_PAGES): Promise<T[]> {
  const out: T[] = [];
  let token: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const sep = path.includes('?') ? '&' : '?';
    const page: Page<T> = await getJson<Page<T>>(token ? `${path}${sep}token=${encodeURIComponent(token)}` : path);
    out.push(...(page.data ?? []));
    if (!page.has_more || !page.next_token) break;
    token = page.next_token;
  }
  return out;
}

const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(k: string, load: () => Promise<T>, fresh = false): Promise<T> {
  const hit = cache.get(k);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await load();
  cache.set(k, { at: Date.now(), value });
  return value;
}

/** Owner's own looks (all pages); with includePublic also the first public page. */
export function listHeygenAvatars(opts: { includePublic?: boolean; fresh?: boolean } = {}): Promise<HeygenAvatarItem[]> {
  return cached(`avatars:${opts.includePublic ? 'all' : 'private'}`, async () => {
    const own = (await allPages<RawLook>('/v3/avatars/looks?ownership=private&limit=50'))
      .map((r) => mapLook(r, true))
      .filter((x): x is HeygenAvatarItem => x !== null);
    let pub: HeygenAvatarItem[] = [];
    if (opts.includePublic) {
      pub = (await allPages<RawLook>('/v3/avatars/looks?ownership=public&limit=50', 1))
        .map((r) => mapLook(r, false))
        .filter((x): x is HeygenAvatarItem => x !== null);
    }
    return sortAvatars([...own, ...pub]);
  }, opts.fresh);
}

/** Private clones (all pages) + public Russian and English library voices. */
export function listHeygenVoices(opts: { fresh?: boolean } = {}): Promise<HeygenVoiceItem[]> {
  return cached('voices', async () => {
    const [own, ru, en] = await Promise.all([
      allPages<RawVoice>('/v3/voices?type=private&limit=100'),
      allPages<RawVoice>('/v3/voices?type=public&language=Russian&limit=100', 2),
      allPages<RawVoice>('/v3/voices?type=public&language=English&limit=100', 1),
    ]);
    const map = (list: RawVoice[], p: boolean) =>
      list.map((r) => mapVoice(r, p)).filter((x): x is HeygenVoiceItem => x !== null);
    return sortVoices([...map(own, true), ...map(ru, false), ...map(en, false)]);
  }, opts.fresh);
}

/** One look by id — from the cached list, else HeyGen's GET /v3/avatars/looks/{id}. */
export async function findHeygenAvatar(id: string): Promise<HeygenAvatarItem | null> {
  const list = await listHeygenAvatars().catch(() => [] as HeygenAvatarItem[]);
  const hit = list.find((a) => a.id === id);
  if (hit) return hit;
  try {
    const one = await getJson<{ data?: RawLook }>(`/v3/avatars/looks/${encodeURIComponent(id)}`);
    // Public looks carry `status` too, so ownership can't be told from here.
    return one.data ? mapLook(one.data, false) : null;
  } catch {
    return null;
  }
}

export async function findHeygenVoice(id: string): Promise<HeygenVoiceItem | null> {
  const list = await listHeygenVoices().catch(() => [] as HeygenVoiceItem[]);
  return list.find((v) => v.id === id) ?? null;
}

/** test hook */
export function _clearHeygenAccountCache() {
  cache.clear();
}
