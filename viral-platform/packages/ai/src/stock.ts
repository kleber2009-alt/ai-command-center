import type { StockAsset } from '@vp/shared';

// --- Pexels Videos API ---
interface PexelsVideoFile {
  link: string;
  width: number;
  height: number;
  quality: string;
}
interface PexelsVideo {
  id: number;
  duration: number; // seconds
  url: string;
  image: string;
  video_files: PexelsVideoFile[];
  tags?: string[];
}

export async function searchPexels(query: string, perPage = 10): Promise<StockAsset[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error('PEXELS_API_KEY is not set');

  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) throw new Error(`pexels ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { videos: PexelsVideo[] };
  return data.videos.map((v) => {
    // Pick the highest-resolution HD file that isn't 4K-overkill.
    const file =
      v.video_files.find((f) => f.quality === 'hd') ?? v.video_files[0] ?? ({} as PexelsVideoFile);
    return {
      id: `pexels:${v.id}`,
      provider: 'pexels' as const,
      providerAssetId: String(v.id),
      url: file.link ?? v.url,
      thumbnailUrl: v.image,
      durationMs: Math.round(v.duration * 1000),
      width: file.width ?? 0,
      height: file.height ?? 0,
      tags: v.tags ?? [],
      // Pexels has no rich description, so the query is our best label.
      description: query,
    };
  });
}

// --- Pixabay Videos API ---
interface PixabayHit {
  id: number;
  duration: number; // seconds
  pageURL: string;
  tags: string;
  videos: {
    large?: { url: string; width: number; height: number };
    medium?: { url: string; width: number; height: number };
  };
  picture_id?: string;
}

export async function searchPixabay(query: string, perPage = 10): Promise<StockAsset[]> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) throw new Error('PIXABAY_API_KEY is not set');

  const url = `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=${perPage}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pixabay ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { hits: PixabayHit[] };
  return data.hits.map((h) => {
    const file = h.videos.large ?? h.videos.medium;
    return {
      id: `pixabay:${h.id}`,
      provider: 'pixabay' as const,
      providerAssetId: String(h.id),
      url: file?.url ?? h.pageURL,
      thumbnailUrl: `https://i.vimeocdn.com/video/${h.picture_id}_295x166.jpg`,
      durationMs: Math.round(h.duration * 1000),
      width: file?.width ?? 0,
      height: file?.height ?? 0,
      tags: h.tags.split(',').map((t) => t.trim()),
      description: h.tags,
    };
  });
}
