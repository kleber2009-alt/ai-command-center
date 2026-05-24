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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadRubrics } from './lib/rubrics.js';
import { outputPath } from './lib/paths.js';
import { runCarouselPipeline } from './pipelines/carousel.js';
import { runReelsPipeline } from './pipelines/reels.js';
import { log } from './lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '..', 'public');
const PORT = Number(process.env.CABINET_PORT ?? 3018);

type Format = 'carousel' | 'reels';

interface Job {
  id: string;
  format: Format;
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
  const { format, rubric, topic, episode, deliver, rag } = req.body ?? {};
  const fmt: Format = format === 'reels' ? 'reels' : 'carousel';
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

app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '5m' }));
app.get('/', (_req, res) => {
  res.sendFile(join(PUBLIC_DIR, 'cabinet', 'index.html'));
});

app.listen(PORT, () => {
  log.info(`Cabinet listening on http://0.0.0.0:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) log.warn('ANTHROPIC_API_KEY is not set — generation will fail');
});
