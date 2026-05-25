import { billingRouter } from './routers/billing.js';
import { brollRouter } from './routers/broll.js';
import { clipsRouter } from './routers/clips.js';
import { libraryRouter } from './routers/library.js';
import { projectsRouter } from './routers/projects.js';
import { rendersRouter } from './routers/renders.js';
import { uploadsRouter } from './routers/uploads.js';
import { router } from './trpc.js';

export const appRouter = router({
  uploads: uploadsRouter,
  projects: projectsRouter,
  clips: clipsRouter,
  broll: brollRouter,
  library: libraryRouter,
  renders: rendersRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
