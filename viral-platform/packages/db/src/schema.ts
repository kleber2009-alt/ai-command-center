import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
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
export const brollSourceEnum = pgEnum('broll_source', ['pexels', 'pixabay', 'user_library']);
export const brollModeEnum = pgEnum('broll_mode', ['auto_stock', 'my_library', 'hybrid']);
export const assetTypeEnum = pgEnum('asset_type', ['video', 'image']);
export const assetStatusEnum = pgEnum('asset_status', ['processing', 'ready', 'failed']);

// --- users: synced from Clerk webhook, we store only what we own (§6) ---
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user id
  email: text('email').notNull(),
  plan: planEnum('plan').notNull().default('free'),
  // real (not integer) so fractional costs like indexing (0.5) work (§9).
  creditsBalance: real('credits_balance').notNull().default(30),
  libraryStorageUsedBytes: bigint('library_storage_used_bytes', { mode: 'number' })
    .notNull()
    .default(0),
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
    brollMode: brollModeEnum('broll_mode').notNull().default('auto_stock'),
    libraryCollectionId: uuid('library_collection_id'),
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

// --- broll_assets_cache: cached STOCK assets with embedding + HNSW (§6) ---
export const brollAssetsCache = pgTable(
  'broll_assets_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: brollSourceEnum('provider').notNull(),
    providerAssetId: text('provider_asset_id').notNull(),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url').notNull(),
    durationMs: integer('duration_ms').notNull(),
    width: integer('width').notNull().default(0),
    height: integer('height').notNull().default(0),
    description: text('description').notNull().default(''),
    tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
    // Full-precision storage; the HNSW index is built on a halfvec cast
    // (3072 dims exceeds plain-vector HNSW's 2000-dim cap) — see migrations.
    embedding: vector('embedding', { dimensions: 3072 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('broll_assets_cache_provider_idx').on(t.provider, t.providerAssetId)],
);

// --- collections: a user's named B-roll galleries (§4.4.2) ---
export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('collections_user_idx').on(t.userId)],
);

// --- user_assets: the user's media library (§4.4.1, §6) ---
export const userAssets = pgTable(
  'user_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    type: assetTypeEnum('type').notNull(),
    r2Key: text('r2_key').notNull(),
    thumbnailR2Key: text('thumbnail_r2_key'),
    durationMs: integer('duration_ms').notNull().default(0),
    width: integer('width').notNull().default(0),
    height: integer('height').notNull().default(0),
    orientation: text('orientation').notNull().default('landscape'),
    aiMetadata: jsonb('ai_metadata'),
    userTags: text('user_tags').array().notNull().default(sql`'{}'::text[]`),
    // Full-precision storage; HNSW index built on a halfvec cast (see migrations).
    embedding: vector('embedding', { dimensions: 3072 }),
    status: assetStatusEnum('status').notNull().default('processing'),
    errorReason: text('error_reason'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    fileHash: text('file_hash').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('user_assets_list_idx').on(t.userId, t.status, t.deletedAt),
    index('user_assets_collection_idx').on(t.collectionId, t.status),
    // Dedup live (non-deleted) uploads per user by content hash (§6).
    uniqueIndex('user_assets_user_hash_idx')
      .on(t.userId, t.fileHash)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

// --- asset_usage_log: which assets a user actually uses (§6 analytics) ---
export const assetUsageLog = pgTable('asset_usage_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => userAssets.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  usedAt: timestamp('used_at', { withTimezone: true }).notNull().defaultNow(),
});

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
    delta: real('delta').notNull(),
    reason: text('reason').notNull(),
    balanceAfter: real('balance_after').notNull(),
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
  collections: many(collections),
  assets: many(userAssets),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  user: one(users, { fields: [collections.userId], references: [users.id] }),
  assets: many(userAssets),
}));

export const userAssetsRelations = relations(userAssets, ({ one }) => ({
  user: one(users, { fields: [userAssets.userId], references: [users.id] }),
  collection: one(collections, {
    fields: [userAssets.collectionId],
    references: [collections.id],
  }),
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
