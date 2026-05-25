// Cabinet: minimal HTTP API + static UI for manually driving the content
// pipelines (carousel + reels) and inspecting past runs.
//
//   GET  /                        → public/cabinet/index.html
//   GET  /api/health              → liveness (open, used by Docker healthcheck)
//   GET  /api/rubrics             → loaded rubric configs
//   GET  /api/runs                → newest 30 output dirs (data/output/*)
//   GET  /api/runs/:id            → carousel.json | reels.json + caption + media list
//   GET  /api/runs/:id/slide/:n   → carousel PNG bytes
//   GET  /api/runs/:id/video      → reels.mp4
//   GET  /api/runs/:id/script     → reels-script.md (text)
//   POST /api/generate            → kicks off a pipeline (async job),
//                                   body: { format: "carousel"|"reels", rubric, topic, episode, deliver, rag }
//   GET  /api/jobs/:id            → poll job status
//
// Auth: Basic Auth gated by CABINET_PASSWORD (and optional CABINET_USERNAME).
// If CABINET_PASSWORD is unset the server boots open with a loud warning.

import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import basicAuth from 'basic-auth';
import multer from 'multer';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadRubrics } from './lib/rubrics.js';
import { outputPath, dataPath } from './lib/paths.js';
import { runCarouselPipeline } from './pipelines/carousel.js';
import { runReelsPipeline } from './pipelines/reels.js';
import { isImageEngine, type ImageEngine } from './renderers/image-engines.js';
import { log } from './lib/logger.js';
import { getAllClipMeta, deleteClipMeta, setClipMeta, type ClipMeta } from './lib/footage-meta.js';
import { getAllScreenMeta, deleteScreenMeta, setScreenMeta, type ScreenMeta } from './lib/screen-meta.js';
import { createMetaStore, type AssetMetaBase } from './lib/keyval-meta.js';
import { describeClip } from './generators/clip-describer.js';
import { describeScreen } from './generators/screen-describer.js';
import { describeReference } from './generators/reference-describer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '..', 'public');
const PORT = Number(process.env.CABINET_PORT ?? 3018);

type Format = 'carousel' | 'reels';

interface Job {
  id: string;
  format: Format;
  engine?: ImageEngine;
  status: 'queued' | 'running' | 'done' | 'error';
  rubric: string;
  topic: string;
  episode: number;
  deliver: boolean;
  startedAt: string;
  finishedAt?: string;
  /** Output directory basename (matches /api/runs/:id). */
  runId?: string;
  mode?: 'fallback' | 'video';
  error?: string;
}

const jobs = new Map<string, Job>();

function requireAuth(): express.RequestHandler {
  const password = process.env.CABINET_PASSWORD ?? '';
  const username = process.env.CABINET_USERNAME ?? 'admin';
  if (!password) {
    log.warn('CABINET_PASSWORD is empty — cabinet is OPEN to everyone. Set it before exposing publicly.');
    return (_req, _res, next) => next();
  }
  return (req: Request, res: Response, next: NextFunction): void => {
    const creds = basicAuth(req);
    if (!creds || creds.name !== username || creds.pass !== password) {
      res.set('WWW-Authenticate', 'Basic realm="AI Content Factory"');
      res.status(401).send('Authentication required');
      return;
    }
    next();
  };
}

function listRuns(limit = 30): { id: string; mtime: string; format: Format }[] {
  const root = outputPath();
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => !name.startsWith('.'))
    .map((name) => {
      const full = join(root, name);
      const stat = statSync(full);
      return {
        id: name,
        mtime: stat.mtime.toISOString(),
        format: (name.startsWith('reels-') ? 'reels' : 'carousel') as Format,
        _ts: stat.mtimeMs,
      };
    })
    .sort((a, b) => b._ts - a._ts)
    .slice(0, limit)
    .map(({ _ts, ...rest }) => rest);
}

interface RunSummary {
  id: string;
  format: Format;
  caption: string | null;
  // carousel
  slides?: string[];
  carousel?: unknown;
  // reels
  reels?: unknown;
  videoUrl?: string | null;
  scriptUrl?: string | null;
  mode?: 'fallback' | 'video';
  missingTags?: string[];
}

function readRun(id: string): RunSummary | null {
  const dir = outputPath(id);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  const files = readdirSync(dir);
  const caption = files.includes('caption.txt') ? readFileSync(join(dir, 'caption.txt'), 'utf8') : null;
  const isReels = id.startsWith('reels-') || files.includes('reels.json');

  if (isReels) {
    const script = files.includes('reels.json')
      ? JSON.parse(readFileSync(join(dir, 'reels.json'), 'utf8'))
      : null;
    const hasVideo = files.includes('reels.mp4');
    const hasScript = files.includes('reels-script.md');
    return {
      id,
      format: 'reels',
      caption,
      reels: script,
      videoUrl: hasVideo ? `/api/runs/${encodeURIComponent(id)}/video` : null,
      scriptUrl: hasScript ? `/api/runs/${encodeURIComponent(id)}/script` : null,
      mode: hasVideo ? 'video' : 'fallback',
    };
  }

  const slides = files
    .filter((f) => /^slide-\d+\.png$/.test(f))
    .sort()
    .map((f) => `/api/runs/${encodeURIComponent(id)}/slide/${f}`);
  const carousel = files.includes('carousel.json')
    ? JSON.parse(readFileSync(join(dir, 'carousel.json'), 'utf8'))
    : null;
  return { id, format: 'carousel', caption, slides, carousel };
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// /api/health stays open (used by Docker healthcheck). Everything else is gated.
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    voyage: Boolean(process.env.VOYAGE_API_KEY),
    engines: {
      puppeteer: true,
      'nano-banana': Boolean(process.env.NANO_BANANA_API_KEY || process.env.KIE_AI_API_KEY || process.env.GPT_IMAGE_2_API_KEY),
      'gpt-image': Boolean(process.env.OPENAI_API_KEY),
      'gpt-image-2': Boolean(process.env.GPT_IMAGE_2_API_KEY || process.env.KIE_AI_API_KEY),
    },
    jobs: { active: [...jobs.values()].filter((j) => j.status === 'running' || j.status === 'queued').length },
  });
});

app.use(requireAuth());

app.get('/api/rubrics', (_req, res) => {
  const all = loadRubrics();
  const safe = Object.fromEntries(
    Object.entries(all).map(([slug, r]) => [
      slug,
      { label: r.label, accent: r.accent, handle: r.handle, formula: r.formula, ready: !r.formula.startsWith('TODO') },
    ]),
  );
  res.json(safe);
});

app.get('/api/runs', (_req, res) => {
  res.json({ runs: listRuns() });
});

app.get('/api/runs/:id', (req, res) => {
  const data = readRun(req.params.id);
  if (!data) {
    res.status(404).json({ error: 'run not found' });
    return;
  }
  res.json(data);
});

app.get('/api/runs/:id/slide/:file', (req, res) => {
  const file = req.params.file;
  if (!/^slide-\d+\.png$/.test(file)) {
    res.status(400).send('bad slide name');
    return;
  }
  const abs = outputPath(req.params.id, file);
  if (!existsSync(abs)) {
    res.status(404).send('not found');
    return;
  }
  res.sendFile(abs);
});

app.get('/api/runs/:id/video', (req, res) => {
  const abs = outputPath(req.params.id, 'reels.mp4');
  if (!existsSync(abs)) {
    res.status(404).send('not found');
    return;
  }
  res.sendFile(abs);
});

app.get('/api/runs/:id/script', (req, res) => {
  const abs = outputPath(req.params.id, 'reels-script.md');
  if (!existsSync(abs)) {
    res.status(404).send('not found');
    return;
  }
  res.type('text/plain; charset=utf-8').sendFile(abs);
});

app.post('/api/generate', (req, res) => {
  const { format, rubric, topic, episode, deliver, rag, engine } = req.body ?? {};
  const fmt: Format = format === 'reels' ? 'reels' : 'carousel';
  const eng: ImageEngine = isImageEngine(engine) ? engine : 'puppeteer';
  if (typeof rubric !== 'string' || typeof topic !== 'string' || !topic.trim()) {
    res.status(400).json({ error: 'rubric and topic are required strings' });
    return;
  }
  const ep = Number(episode ?? 1);
  if (!Number.isFinite(ep) || ep < 1) {
    res.status(400).json({ error: 'episode must be a positive number' });
    return;
  }
  const id = randomUUID();
  const job: Job = {
    id,
    format: fmt,
    engine: fmt === 'carousel' ? eng : undefined,
    status: 'queued',
    rubric,
    topic: topic.trim(),
    episode: ep,
    deliver: Boolean(deliver),
    startedAt: new Date().toISOString(),
  };
  jobs.set(id, job);

  (async (): Promise<void> => {
    job.status = 'running';
    try {
      if (fmt === 'carousel') {
        const result = await runCarouselPipeline({
          slug: rubric,
          topic: job.topic,
          episode: ep,
          deliver: job.deliver,
          rag: rag !== false,
          engine: eng,
        });
        job.runId = result.outDir.split('/').pop() ?? '';
      } else {
        const result = await runReelsPipeline({
          slug: rubric,
          topic: job.topic,
          episode: ep,
          deliver: job.deliver,
          rag: rag !== false,
        });
        job.runId = result.outDir.split('/').pop() ?? '';
        job.mode = result.mode;
      }
      job.status = 'done';
    } catch (err) {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
      log.error('Cabinet job failed', { id, error: job.error });
    } finally {
      job.finishedAt = new Date().toISOString();
    }
  })();

  res.status(202).json({ jobId: id });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'job not found' });
    return;
  }
  res.json(job);
});

// ── Footage library ─────────────────────────────────────────────────────────

const FOOTAGE_ROOT = dataPath('assets', 'footage');
const SAFE_TAG = /^[a-z0-9][a-z0-9_-]{0,40}$/i;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(mp4|mov|m4v|webm)$/i;
const MAX_UPLOAD_MB = 100;
const MAX_FILES_PER_REQUEST = 30;

interface TagCatalogEntry {
  tag: string;
  label?: string;
  description?: string;
  expectedSeconds?: string;
}

function loadTagCatalog(): TagCatalogEntry[] {
  const p = dataPath('assets', 'footage-tags.json');
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as { tags?: unknown[] };
    if (!parsed.tags || !Array.isArray(parsed.tags)) return [];
    return parsed.tags
      .map((t) => (typeof t === 'string' ? { tag: t } : (t as TagCatalogEntry)))
      .filter((t) => typeof t.tag === 'string' && SAFE_TAG.test(t.tag));
  } catch {
    return [];
  }
}

interface ClipListItem {
  file: string;
  sizeBytes: number;
  mtime: string;
  description?: string;
  autoTags?: string[];
  durationSec?: number;
  status: ClipMeta['status'];
  error?: string;
}

function listClipsForTag(tag: string): ClipListItem[] {
  const dir = join(FOOTAGE_ROOT, tag);
  if (!existsSync(dir)) return [];
  const meta = getAllClipMeta(tag);
  return readdirSync(dir)
    .filter((f) => SAFE_FILE.test(f))
    .map((f) => {
      const s = statSync(join(dir, f));
      const m = meta[f];
      return {
        file: f,
        sizeBytes: s.size,
        mtime: s.mtime.toISOString(),
        status: m?.status ?? 'pending',
        description: m?.description,
        autoTags: m?.autoTags,
        durationSec: m?.durationSec,
        error: m?.error,
      };
    });
}

app.get('/api/footage', (_req, res) => {
  const catalog = loadTagCatalog();
  const tags = catalog.map((entry) => ({
    ...entry,
    clips: listClipsForTag(entry.tag),
  }));
  res.json({ tags, maxUploadMb: MAX_UPLOAD_MB });
});

// Stream uploads straight into the target tag dir to avoid double-copy.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const tag = String((req.params as { tag?: string }).tag ?? '');
      if (!SAFE_TAG.test(tag)) return cb(new Error('bad tag'), '');
      const dir = join(FOOTAGE_ROOT, tag);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      // sanitise: ASCII-only stem, keep extension
      const m = file.originalname.match(/\.(mp4|mov|m4v|webm)$/i);
      const ext = (m?.[1] ?? 'mp4').toLowerCase();
      const stem = basename(file.originalname, '.' + ext)
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 60) || 'clip';
      const name = `${Date.now()}-${stem}.${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: MAX_FILES_PER_REQUEST },
  fileFilter: (_req, file, cb) => {
    if (/\.(mp4|mov|m4v|webm)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('only .mp4/.mov/.m4v/.webm allowed'));
  },
});

app.post('/api/footage/:tag', upload.array('clips', MAX_FILES_PER_REQUEST), (req, res) => {
  const tag = String((req.params as { tag?: string }).tag ?? '');
  if (!SAFE_TAG.test(tag)) {
    res.status(400).json({ error: 'bad tag' });
    return;
  }
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];

  // Persist initial 'pending' status and kick off vision-describe per clip in
  // the background. UI polls /api/footage to see status transition to ready.
  for (const f of files) {
    setClipMeta(tag, f.filename, { status: 'pending' });
    (async () => {
      try {
        await describeClip(tag, f.filename);
      } catch {
        /* error already persisted in meta + logged */
      }
    })();
  }

  res.json({
    tag,
    uploaded: files.map((f) => ({ file: f.filename, sizeBytes: f.size })),
  });
});

app.delete('/api/footage/:tag/:file', (req, res) => {
  const p = req.params as { tag?: string; file?: string };
  const tag = String(p.tag ?? '');
  const file = String(p.file ?? '');
  if (!SAFE_TAG.test(tag) || !SAFE_FILE.test(file)) {
    res.status(400).json({ error: 'bad params' });
    return;
  }
  const abs = join(FOOTAGE_ROOT, tag, file);
  if (!existsSync(abs)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  try {
    unlinkSync(abs);
    deleteClipMeta(tag, file);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Screens library (PNG / JPG / WebP) ─────────────────────────────────────

const SCREENS_ROOT = dataPath('assets', 'screens');
const SAFE_IMG_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(png|jpg|jpeg|webp)$/i;
const MAX_IMG_MB = 30;

interface ScreenListItem {
  file: string;
  sizeBytes: number;
  mtime: string;
  description?: string;
  autoTags?: string[];
  status: ScreenMeta['status'];
  error?: string;
}

function listScreensForTag(tag: string): ScreenListItem[] {
  const dir = join(SCREENS_ROOT, tag);
  if (!existsSync(dir)) return [];
  const meta = getAllScreenMeta(tag);
  return readdirSync(dir)
    .filter((f) => SAFE_IMG_FILE.test(f))
    .map((f) => {
      const s = statSync(join(dir, f));
      const m = meta[f];
      return {
        file: f,
        sizeBytes: s.size,
        mtime: s.mtime.toISOString(),
        status: m?.status ?? 'pending',
        description: m?.description,
        autoTags: m?.autoTags,
        error: m?.error,
      };
    });
}

function loadScreenCatalog(): TagCatalogEntry[] {
  const p = dataPath('assets', 'screens-tags.json');
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as { tags?: unknown[] };
    if (!parsed.tags || !Array.isArray(parsed.tags)) return [];
    return parsed.tags
      .map((t) => (typeof t === 'string' ? { tag: t } : (t as TagCatalogEntry)))
      .filter((t) => typeof t.tag === 'string' && SAFE_TAG.test(t.tag));
  } catch {
    return [];
  }
}

app.get('/api/screens', (_req, res) => {
  const catalog = loadScreenCatalog();
  const tags = catalog.map((entry) => ({
    ...entry,
    clips: listScreensForTag(entry.tag),
  }));
  res.json({ tags, maxUploadMb: MAX_IMG_MB });
});

const screenUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const tag = String((req.params as { tag?: string }).tag ?? '');
      if (!SAFE_TAG.test(tag)) return cb(new Error('bad tag'), '');
      const dir = join(SCREENS_ROOT, tag);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const m = file.originalname.match(/\.(png|jpg|jpeg|webp)$/i);
      const ext = (m?.[1] ?? 'png').toLowerCase();
      const stem = basename(file.originalname, '.' + ext)
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 60) || 'screen';
      cb(null, `${Date.now()}-${stem}.${ext}`);
    },
  }),
  limits: { fileSize: MAX_IMG_MB * 1024 * 1024, files: MAX_FILES_PER_REQUEST },
  fileFilter: (_req, file, cb) => {
    if (/\.(png|jpg|jpeg|webp)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('only .png/.jpg/.jpeg/.webp allowed'));
  },
});

app.post('/api/screens/:tag', screenUpload.array('clips', MAX_FILES_PER_REQUEST), (req, res) => {
  const tag = String((req.params as { tag?: string }).tag ?? '');
  if (!SAFE_TAG.test(tag)) {
    res.status(400).json({ error: 'bad tag' });
    return;
  }
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  for (const f of files) {
    setScreenMeta(tag, f.filename, { status: 'pending' });
    (async () => {
      try { await describeScreen(tag, f.filename); }
      catch { /* error persisted */ }
    })();
  }
  res.json({ tag, uploaded: files.map((f) => ({ file: f.filename, sizeBytes: f.size })) });
});

app.delete('/api/screens/:tag/:file', (req, res) => {
  const p = req.params as { tag?: string; file?: string };
  const tag = String(p.tag ?? '');
  const file = String(p.file ?? '');
  if (!SAFE_TAG.test(tag) || !SAFE_IMG_FILE.test(file)) {
    res.status(400).json({ error: 'bad params' });
    return;
  }
  const abs = join(SCREENS_ROOT, tag, file);
  if (!existsSync(abs)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  try {
    unlinkSync(abs);
    deleteScreenMeta(tag, file);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/screens/:tag/:file', (req, res) => {
  const p = req.params as { tag?: string; file?: string };
  const tag = String(p.tag ?? '');
  const file = String(p.file ?? '');
  if (!SAFE_TAG.test(tag) || !SAFE_IMG_FILE.test(file)) {
    res.status(400).send('bad params');
    return;
  }
  const abs = join(SCREENS_ROOT, tag, file);
  if (!existsSync(abs)) {
    res.status(404).send('not found');
    return;
  }
  res.sendFile(abs);
});

app.get('/api/footage/:tag/:file', (req, res) => {
  const p = req.params as { tag?: string; file?: string };
  const tag = String(p.tag ?? '');
  const file = String(p.file ?? '');
  if (!SAFE_TAG.test(tag) || !SAFE_FILE.test(file)) {
    res.status(400).send('bad params');
    return;
  }
  const abs = join(FOOTAGE_ROOT, tag, file);
  if (!existsSync(abs)) {
    res.status(404).send('not found');
    return;
  }
  res.sendFile(abs);
});

// ── References (image library — training set, parallel to screens) ─────────

interface ReferenceMeta extends AssetMetaBase {
  status: ScreenMeta['status'];
  description?: string;
  autoTags?: string[];
}
const referencesStore = createMetaStore<ReferenceMeta>('assets', 'references');
const REFS_ROOT = referencesStore.root;

function loadReferencesCatalog(): TagCatalogEntry[] {
  const p = dataPath('assets', 'references-tags.json');
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as { tags?: unknown[] };
    if (!parsed.tags || !Array.isArray(parsed.tags)) return [];
    return parsed.tags
      .map((t) => (typeof t === 'string' ? { tag: t } : (t as TagCatalogEntry)))
      .filter((t) => typeof t.tag === 'string' && SAFE_TAG.test(t.tag));
  } catch {
    return [];
  }
}

function listReferencesForTag(tag: string) {
  const dir = join(REFS_ROOT, tag);
  if (!existsSync(dir)) return [];
  const meta = referencesStore.getAll(tag);
  return readdirSync(dir)
    .filter((f) => SAFE_IMG_FILE.test(f))
    .map((f) => {
      const s = statSync(join(dir, f));
      const m = meta[f];
      return {
        file: f,
        sizeBytes: s.size,
        mtime: s.mtime.toISOString(),
        status: m?.status ?? 'pending',
        description: m?.description,
        autoTags: m?.autoTags,
        error: m?.error,
      };
    });
}

app.get('/api/references', (_req, res) => {
  const catalog = loadReferencesCatalog();
  const tags = catalog.map((e) => ({ ...e, clips: listReferencesForTag(e.tag) }));
  res.json({ tags, maxUploadMb: MAX_IMG_MB });
});

const refsUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const tag = String((req.params as { tag?: string }).tag ?? '');
      if (!SAFE_TAG.test(tag)) return cb(new Error('bad tag'), '');
      const dir = join(REFS_ROOT, tag);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const m = file.originalname.match(/\.(png|jpg|jpeg|webp)$/i);
      const ext = (m?.[1] ?? 'png').toLowerCase();
      const stem = basename(file.originalname, '.' + ext)
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 60) || 'ref';
      cb(null, `${Date.now()}-${stem}.${ext}`);
    },
  }),
  limits: { fileSize: MAX_IMG_MB * 1024 * 1024, files: MAX_FILES_PER_REQUEST },
  fileFilter: (_req, file, cb) => {
    if (/\.(png|jpg|jpeg|webp)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('only .png/.jpg/.jpeg/.webp allowed'));
  },
});

app.post('/api/references/:tag', refsUpload.array('clips', MAX_FILES_PER_REQUEST), (req, res) => {
  const tag = String((req.params as { tag?: string }).tag ?? '');
  if (!SAFE_TAG.test(tag)) { res.status(400).json({ error: 'bad tag' }); return; }
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  for (const f of files) {
    referencesStore.set(tag, f.filename, { status: 'pending' });
    (async () => {
      try { await describeReference(tag, f.filename); }
      catch { /* error persisted */ }
    })();
  }
  res.json({ tag, uploaded: files.map((f) => ({ file: f.filename, sizeBytes: f.size })) });
});

app.delete('/api/references/:tag/:file', (req, res) => {
  const p = req.params as { tag?: string; file?: string };
  const tag = String(p.tag ?? '');
  const file = String(p.file ?? '');
  if (!SAFE_TAG.test(tag) || !SAFE_IMG_FILE.test(file)) { res.status(400).json({ error: 'bad params' }); return; }
  const abs = join(REFS_ROOT, tag, file);
  if (!existsSync(abs)) { res.status(404).json({ error: 'not found' }); return; }
  unlinkSync(abs);
  referencesStore.delete(tag, file);
  res.json({ ok: true });
});

app.get('/api/references/:tag/:file', (req, res) => {
  const p = req.params as { tag?: string; file?: string };
  const tag = String(p.tag ?? '');
  const file = String(p.file ?? '');
  if (!SAFE_TAG.test(tag) || !SAFE_IMG_FILE.test(file)) { res.status(400).send('bad params'); return; }
  const abs = join(REFS_ROOT, tag, file);
  if (!existsSync(abs)) { res.status(404).send('not found'); return; }
  res.sendFile(abs);
});

// ── Prompts (text library — training set, .md / .txt) ──────────────────────

const SAFE_TEXT_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(md|txt|markdown)$/i;
const MAX_TEXT_MB = 2;

interface PromptMeta extends AssetMetaBase {
  status: 'ready';
  excerpt?: string;
  wordCount?: number;
}
const promptsStore = createMetaStore<PromptMeta>('assets', 'prompts');
const PROMPTS_ROOT = promptsStore.root;

function loadPromptsCatalog(): TagCatalogEntry[] {
  const p = dataPath('assets', 'prompts-tags.json');
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as { tags?: unknown[] };
    if (!parsed.tags || !Array.isArray(parsed.tags)) return [];
    return parsed.tags
      .map((t) => (typeof t === 'string' ? { tag: t } : (t as TagCatalogEntry)))
      .filter((t) => typeof t.tag === 'string' && SAFE_TAG.test(t.tag));
  } catch {
    return [];
  }
}

function refreshPromptMeta(tag: string, file: string): void {
  const abs = join(PROMPTS_ROOT, tag, file);
  if (!existsSync(abs)) return;
  const text = readFileSync(abs, 'utf8');
  const excerpt = text.slice(0, 300).trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  promptsStore.set(tag, file, { status: 'ready', excerpt, wordCount });
}

function listPromptsForTag(tag: string) {
  const dir = join(PROMPTS_ROOT, tag);
  if (!existsSync(dir)) return [];
  const meta = promptsStore.getAll(tag);
  return readdirSync(dir)
    .filter((f) => SAFE_TEXT_FILE.test(f))
    .map((f) => {
      const s = statSync(join(dir, f));
      const m = meta[f];
      return {
        file: f,
        sizeBytes: s.size,
        mtime: s.mtime.toISOString(),
        status: m?.status ?? 'ready',
        excerpt: m?.excerpt,
        wordCount: m?.wordCount,
      };
    });
}

app.get('/api/prompts', (_req, res) => {
  const catalog = loadPromptsCatalog();
  const tags = catalog.map((e) => ({ ...e, clips: listPromptsForTag(e.tag) }));
  res.json({ tags, maxUploadMb: MAX_TEXT_MB });
});

const promptsUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const tag = String((req.params as { tag?: string }).tag ?? '');
      if (!SAFE_TAG.test(tag)) return cb(new Error('bad tag'), '');
      const dir = join(PROMPTS_ROOT, tag);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const m = file.originalname.match(/\.(md|txt|markdown)$/i);
      const ext = (m?.[1] ?? 'md').toLowerCase();
      const stem = basename(file.originalname, '.' + ext)
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 60) || 'prompt';
      cb(null, `${Date.now()}-${stem}.${ext === 'markdown' ? 'md' : ext}`);
    },
  }),
  limits: { fileSize: MAX_TEXT_MB * 1024 * 1024, files: MAX_FILES_PER_REQUEST },
  fileFilter: (_req, file, cb) => {
    if (/\.(md|txt|markdown)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('only .md/.txt/.markdown allowed'));
  },
});

app.post('/api/prompts/:tag', promptsUpload.array('clips', MAX_FILES_PER_REQUEST), (req, res) => {
  const tag = String((req.params as { tag?: string }).tag ?? '');
  if (!SAFE_TAG.test(tag)) { res.status(400).json({ error: 'bad tag' }); return; }
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  for (const f of files) refreshPromptMeta(tag, f.filename);
  res.json({ tag, uploaded: files.map((f) => ({ file: f.filename, sizeBytes: f.size })) });
});

// Inline create — useful for users who don't want to upload a .md just type the
// prompt in the cabinet textarea.
app.post('/api/prompts/:tag/inline', (req, res) => {
  const tag = String((req.params as { tag?: string }).tag ?? '');
  if (!SAFE_TAG.test(tag)) { res.status(400).json({ error: 'bad tag' }); return; }
  const body = (req.body ?? {}) as { name?: unknown; text?: unknown };
  const rawName = typeof body.name === 'string' ? body.name : 'inline';
  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) { res.status(400).json({ error: 'text is required' }); return; }
  const stem = rawName.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 60) || 'inline';
  const file = `${Date.now()}-${stem}.md`;
  const dir = join(PROMPTS_ROOT, tag);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), text, 'utf8');
  refreshPromptMeta(tag, file);
  res.json({ tag, file });
});

app.delete('/api/prompts/:tag/:file', (req, res) => {
  const p = req.params as { tag?: string; file?: string };
  const tag = String(p.tag ?? '');
  const file = String(p.file ?? '');
  if (!SAFE_TAG.test(tag) || !SAFE_TEXT_FILE.test(file)) { res.status(400).json({ error: 'bad params' }); return; }
  const abs = join(PROMPTS_ROOT, tag, file);
  if (!existsSync(abs)) { res.status(404).json({ error: 'not found' }); return; }
  unlinkSync(abs);
  promptsStore.delete(tag, file);
  res.json({ ok: true });
});

app.get('/api/prompts/:tag/:file', (req, res) => {
  const p = req.params as { tag?: string; file?: string };
  const tag = String(p.tag ?? '');
  const file = String(p.file ?? '');
  if (!SAFE_TAG.test(tag) || !SAFE_TEXT_FILE.test(file)) { res.status(400).send('bad params'); return; }
  const abs = join(PROMPTS_ROOT, tag, file);
  if (!existsSync(abs)) { res.status(404).send('not found'); return; }
  res.type('text/plain; charset=utf-8').sendFile(abs);
});

app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '5m' }));
app.get('/', (_req, res) => {
  res.sendFile(join(PUBLIC_DIR, 'cabinet', 'index.html'));
});

// On boot, scan both libraries (footage clips + screens) and re-describe
// anything that isn't 'ready' — covers files uploaded against an older
// image and crashed describer jobs.
function describeBacklogOnStart(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    log.warn('describeBacklog: ANTHROPIC_API_KEY missing, skipping');
    return;
  }
  let queuedClips = 0;
  if (existsSync(FOOTAGE_ROOT)) {
    const tagDirs = readdirSync(FOOTAGE_ROOT).filter((d) => {
      try { return statSync(join(FOOTAGE_ROOT, d)).isDirectory() && SAFE_TAG.test(d); }
      catch { return false; }
    });
    for (const tag of tagDirs) {
      const meta = getAllClipMeta(tag);
      const files = readdirSync(join(FOOTAGE_ROOT, tag)).filter((f) => SAFE_FILE.test(f));
      for (const file of files) {
        const m = meta[file];
        if (!m || m.status !== 'ready') {
          queuedClips++;
          setClipMeta(tag, file, { status: 'pending' });
          (async () => {
            try { await describeClip(tag, file); }
            catch { /* persisted */ }
          })();
        }
      }
    }
  }
  let queuedScreens = 0;
  if (existsSync(SCREENS_ROOT)) {
    const tagDirs = readdirSync(SCREENS_ROOT).filter((d) => {
      try { return statSync(join(SCREENS_ROOT, d)).isDirectory() && SAFE_TAG.test(d); }
      catch { return false; }
    });
    for (const tag of tagDirs) {
      const meta = getAllScreenMeta(tag);
      const files = readdirSync(join(SCREENS_ROOT, tag)).filter((f) => SAFE_IMG_FILE.test(f));
      for (const file of files) {
        const m = meta[file];
        if (!m || m.status !== 'ready') {
          queuedScreens++;
          setScreenMeta(tag, file, { status: 'pending' });
          (async () => {
            try { await describeScreen(tag, file); }
            catch { /* persisted */ }
          })();
        }
      }
    }
  }
  let queuedRefs = 0;
  if (existsSync(REFS_ROOT)) {
    const tagDirs = readdirSync(REFS_ROOT).filter((d) => {
      try { return statSync(join(REFS_ROOT, d)).isDirectory() && SAFE_TAG.test(d); }
      catch { return false; }
    });
    for (const tag of tagDirs) {
      const meta = referencesStore.getAll(tag);
      const files = readdirSync(join(REFS_ROOT, tag)).filter((f) => SAFE_IMG_FILE.test(f));
      for (const file of files) {
        const m = meta[file];
        if (!m || m.status !== 'ready') {
          queuedRefs++;
          referencesStore.set(tag, file, { status: 'pending' });
          (async () => {
            try { await describeReference(tag, file); }
            catch { /* persisted */ }
          })();
        }
      }
    }
  }
  // Prompts don't need vision — but make sure excerpt/wordCount is filled.
  if (existsSync(PROMPTS_ROOT)) {
    const tagDirs = readdirSync(PROMPTS_ROOT).filter((d) => {
      try { return statSync(join(PROMPTS_ROOT, d)).isDirectory() && SAFE_TAG.test(d); }
      catch { return false; }
    });
    for (const tag of tagDirs) {
      const files = readdirSync(join(PROMPTS_ROOT, tag)).filter((f) => SAFE_TEXT_FILE.test(f));
      for (const file of files) refreshPromptMeta(tag, file);
    }
  }
  if (queuedClips > 0 || queuedScreens > 0 || queuedRefs > 0) {
    log.info(`describeBacklog: queued ${queuedClips} clip(s) + ${queuedScreens} screen(s) + ${queuedRefs} reference(s)`);
  }
}

app.listen(PORT, () => {
  log.info(`Cabinet listening on http://0.0.0.0:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) log.warn('ANTHROPIC_API_KEY is not set — generation will fail');
  describeBacklogOnStart();
});
