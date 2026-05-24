// Cabinet: minimal HTTP API + static UI for manually driving the carousel
// pipeline (rubric / topic / episode → render → deliver to Telegram).
//
//   GET  /                     → public/cabinet/index.html
//   GET  /api/health           → liveness
//   GET  /api/rubrics          → loaded rubric configs
//   GET  /api/runs             → newest 30 output dirs (data/output/*)
//   GET  /api/runs/:id         → carousel.json + caption.txt + slide list
//   GET  /api/runs/:id/slide/:n → PNG bytes
//   POST /api/generate         → kicks off a carousel pipeline (async job)
//   GET  /api/jobs/:id         → poll job status
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
import { outputPath, APP_ROOT } from './lib/paths.js';
import { runCarouselPipeline } from './pipelines/carousel.js';
import { log } from './lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '..', 'public');
const PORT = Number(process.env.CABINET_PORT ?? 3018);

interface Job {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  rubric: string;
  topic: string;
  episode: number;
  deliver: boolean;
  startedAt: string;
  finishedAt?: string;
  outDir?: string;
  slidePaths?: string[];
  captionPath?: string;
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

function listRuns(limit = 30): { id: string; mtime: string; sizeBytes: number }[] {
  const root = outputPath();
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => !name.startsWith('.'))
    .map((name) => {
      const full = join(root, name);
      const stat = statSync(full);
      return { id: name, mtime: stat.mtime.toISOString(), sizeBytes: stat.size, _ts: stat.mtimeMs };
    })
    .sort((a, b) => b._ts - a._ts)
    .slice(0, limit)
    .map(({ _ts, ...rest }) => rest);
}

function readRun(id: string) {
  const dir = outputPath(id);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  const files = readdirSync(dir);
  const slides = files
    .filter((f) => /^slide-\d+\.png$/.test(f))
    .sort()
    .map((f) => `/api/runs/${encodeURIComponent(id)}/slide/${f}`);
  const carouselJson = files.includes('carousel.json')
    ? JSON.parse(readFileSync(join(dir, 'carousel.json'), 'utf8'))
    : null;
  const caption = files.includes('caption.txt') ? readFileSync(join(dir, 'caption.txt'), 'utf8') : null;
  return { id, slides, carousel: carouselJson, caption };
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

app.post('/api/generate', (req, res) => {
  const { rubric, topic, episode, deliver, rag } = req.body ?? {};
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
    status: 'queued',
    rubric,
    topic: topic.trim(),
    episode: ep,
    deliver: Boolean(deliver),
    startedAt: new Date().toISOString(),
  };
  jobs.set(id, job);

  // fire-and-forget — UI polls /api/jobs/:id
  (async (): Promise<void> => {
    job.status = 'running';
    try {
      const result = await runCarouselPipeline({
        slug: rubric,
        topic: job.topic,
        episode: ep,
        deliver: job.deliver,
        rag: rag !== false,
      });
      job.outDir = result.outDir.replace(APP_ROOT, '').replace(/^\//, '');
      // resolve a stable run-id derived from the output dir name
      const runId = result.outDir.split('/').pop() ?? '';
      job.slidePaths = result.slidePaths.map(
        (p) => `/api/runs/${encodeURIComponent(runId)}/slide/${p.split('/').pop()}`,
      );
      job.captionPath = result.captionPath ? `/api/runs/${encodeURIComponent(runId)}` : undefined;
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

// Static UI
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '5m' }));
app.get('/', (_req, res) => {
  res.sendFile(join(PUBLIC_DIR, 'cabinet', 'index.html'));
});

app.listen(PORT, () => {
  log.info(`Cabinet listening on http://0.0.0.0:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) log.warn('ANTHROPIC_API_KEY is not set — generation will fail');
});
