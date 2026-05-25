import { EMBEDDING_DIM } from '@vp/shared';
import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';

// Enums mirror packages/shared status unions.
export const projectStatusEnum = pgEnum('project_status', [
  'uploaded',
  'transcribing',
  'detecting',
  'planning_broll',
  'rendering_preview',
  'ready_for_review',
  'rendering_final',
  'done',
  'failed',
]);

export const clipStatusEnum = pgEnum('clip_status', [
  'pending',
  'planning',
  'ready',
  'rendering',
  'rendered',
  'failed',
]);

export const renderStatusEnum = pgEnum('render_status', ['queued', 'rendering', 'done', 'failed']);
export const exportFormatEnum = pgEnum('export_format', ['9:16', '1:1', '16:9']);
export const renderQualityEnum = pgEnum('render_quality', ['1080p', '4k']);
export const planEnum = pgEnum('plan', ['free', 'creator', 'pro', 'agency']);
export const brollProviderEnum = pgEnum('broll_provider', ['pexels', 'pixabay', 'user']);

// --- users: synced from Clerk webhook, we store only what we own (§6) ---
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user id
  email: text('email').notNull(),
  plan: planEnum('plan').notNull().default('free'),
  creditsBalance: integer('credits_balance').notNull().default(30),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- projects ---
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: projectStatusEnum('status').notNull().default('uploaded'),
    filename: text('filename').notNull(),
    sourceVideoR2Key: text('source_video_r2_key').notNull(),
    durationMs: integer('duration_ms').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('projects_user_idx').on(t.userId), index('projects_status_idx').on(t.status)],
);

// --- transcripts ---
export const transcripts = pgTable('transcripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  fullJsonR2Key: text('full_json_r2_key').notNull(),
  summary: text('summary'),
  language: varchar('language', { length: 16 }).notNull().default('en'),
  speakersCount: integer('speakers_count').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- clips ---
export const clips = pgTable(
  'clips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    title: text('title').notNull().default(''),
    hookScore: real('hook_score').notNull().default(0),
    retentionScore: real('retention_score').notNull().default(0),
    emotionalScore: real('emotional_score').notNull().default(0),
    viralScore: real('viral_score').notNull().default(0),
    reasoning: text('reasoning'),
    status: clipStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('clips_project_idx').on(t.projectId)],
);

// --- broll_plans: one row per (clip, version); inserts is BRollInsert[] jsonb ---
export const brollPlans = pgTable(
  'broll_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clipId: uuid('clip_id')
      .notNull()
      .references(() => clips.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    inserts: jsonb('inserts').notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('broll_plans_clip_idx').on(t.clipId)],
);

// --- broll_assets: stock library with pgvector embedding + HNSW index (§6) ---
export const brollAssets = pgTable(
  'broll_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: brollProviderEnum('provider').notNull(),
    providerAssetId: text('provider_asset_id').notNull(),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url').notNull(),
    durationMs: integer('duration_ms').notNull(),
    width: integer('width').notNull().default(0),
    height: integer('height').notNull().default(0),
    description: text('description').notNull().default(''),
    tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('broll_assets_provider_idx').on(t.provider, t.providerAssetId),
    index('broll_assets_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

// --- renders ---
export const renders = pgTable(
  'renders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clipId: uuid('clip_id')
      .notNull()
      .references(() => clips.id, { onDelete: 'cascade' }),
    format: exportFormatEnum('format').notNull(),
    quality: renderQualityEnum('quality').notNull().default('1080p'),
    captionPreset: text('caption_preset').notNull().default('hormozi'),
    status: renderStatusEnum('status').notNull().default('queued'),
    outputR2Key: text('output_r2_key'),
    durationRenderMs: integer('duration_render_ms'),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('renders_clip_idx').on(t.clipId)],
);

// --- jobs_log: per-job debug trail (§6) ---
export const jobsLog = pgTable('jobs_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: text('job_id').notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

// --- credits_ledger: append-only, atomic debits before each job (§9) ---
export const creditsLedger = pgTable(
  'credits_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('credits_ledger_user_idx').on(t.userId)],
);

// --- subscriptions ---
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  stripeSubId: text('stripe_sub_id').notNull(),
  plan: planEnum('plan').notNull(),
  status: text('status').notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
});

// --- relations ---
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  ledger: many(creditsLedger),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  transcript: one(transcripts, { fields: [projects.id], references: [transcripts.projectId] }),
  clips: many(clips),
}));

export const clipsRelations = relations(clips, ({ one, many }) => ({
  project: one(projects, { fields: [clips.projectId], references: [projects.id] }),
  brollPlans: many(brollPlans),
  renders: many(renders),
}));
