// Drizzle schema — single source of truth for the database.
// Generate SQL migrations with `npm run db:generate`.

import { sql } from "drizzle-orm";
import {
  pgTable, text, integer, bigint, boolean, timestamp, jsonb, uuid, numeric,
  primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";

// ====== Auth.js tables (Drizzle adapter shape) =========================
export const users = pgTable("users", {
  id:            text("id").primaryKey(),                                   // Auth.js id
  email:         text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  name:          text("name"),
  image:         text("image"),
  role:          text("role").$type<"user" | "admin">().notNull().default("user"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  userId:            text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type:              text("type").notNull(),
  provider:          text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refresh_token:     text("refresh_token"),
  access_token:      text("access_token"),
  expires_at:        integer("expires_at"),
  token_type:        text("token_type"),
  scope:             text("scope"),
  id_token:          text("id_token"),
  session_state:     text("session_state"),
}, (t) => ({ pk: primaryKey({ columns: [t.provider, t.providerAccountId] }) }));

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId:       text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires:      timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token:      text("token").notNull(),
  expires:    timestamp("expires", { mode: "date" }).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }));

// ====== Wallet ==========================================================
export const tokenWallets = pgTable("token_wallets", {
  id:             uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:         text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  available:      bigint("available", { mode: "number" }).notNull().default(0),
  reserved:       bigint("reserved", { mode: "number" }).notNull().default(0),
  totalPurchased: bigint("total_purchased", { mode: "number" }).notNull().default(0),
  totalSpent:     bigint("total_spent", { mode: "number" }).notNull().default(0),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  availableCheck: sql`CHECK (available >= 0)`,
  reservedCheck:  sql`CHECK (reserved  >= 0)`,
}));

export const tokenTxType = ["purchase", "spend", "refund", "bonus", "reserve", "release", "adjustment"] as const;
export type TokenTxType = (typeof tokenTxType)[number];

export const tokenTransactions = pgTable("token_transactions", {
  id:           uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:       text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type:         text("type").$type<TokenTxType>().notNull(),
  amount:       bigint("amount", { mode: "number" }).notNull(),
  balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
  toolId:       uuid("tool_id"),
  jobId:        uuid("job_id"),
  paymentId:    uuid("payment_id"),
  description:  text("description"),
  metadata:     jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userCreatedIdx: index("token_tx_user_created_idx").on(t.userId, t.createdAt.desc()),
  jobIdx:         index("token_tx_job_idx").on(t.jobId),
  typeIdx:        index("token_tx_type_idx").on(t.type),
}));

// ====== AI tools catalog ================================================
export const toolCategory = ["image", "video", "audio", "face", "content", "analysis"] as const;
export type ToolCategory = (typeof toolCategory)[number];

export const toolStatus = ["active", "beta", "disabled"] as const;
export type ToolStatus = (typeof toolStatus)[number];

export const providerId = ["fal", "replicate", "kling", "runware", "modelslab", "internal", "kie"] as const;
export type ProviderId = (typeof providerId)[number];

export const aiTools = pgTable("ai_tools", {
  id:           uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug:         text("slug").notNull().unique(),
  name:         text("name").notNull(),
  description:  text("description"),
  category:     text("category").$type<ToolCategory>().notNull(),
  provider:     text("provider").$type<ProviderId>().notNull(),
  model:        text("model").notNull(),
  tokenCost:    integer("token_cost").notNull(),
  inputSchema:  jsonb("input_schema").$type<Record<string, unknown>>().notNull().default({}),
  outputSchema: jsonb("output_schema").$type<Record<string, unknown>>().notNull().default({}),
  example:      jsonb("example").$type<Record<string, unknown> | null>(),
  limits:       jsonb("limits").$type<Record<string, unknown>>().notNull().default({}),
  status:       text("status").$type<ToolStatus>().notNull().default("active"),
  sortOrder:    integer("sort_order").notNull().default(100),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  categoryIdx: index("ai_tools_category_idx").on(t.category),
  statusIdx:   index("ai_tools_status_idx").on(t.status),
}));

// ====== AI jobs =========================================================
export const jobStatus = ["pending", "queued", "processing", "completed", "failed", "refunded", "cancelled"] as const;
export type JobStatus = (typeof jobStatus)[number];

export const aiJobs = pgTable("ai_jobs", {
  id:              uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:          text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  toolId:          uuid("tool_id").notNull().references(() => aiTools.id, { onDelete: "restrict" }),
  provider:        text("provider").$type<ProviderId>().notNull(),
  model:           text("model").notNull(),
  status:          text("status").$type<JobStatus>().notNull().default("pending"),
  input:           jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
  output:          jsonb("output").$type<Record<string, unknown> | null>(),
  costTokens:      integer("cost_tokens").notNull(),
  chargedTokens:   integer("charged_tokens"),
  providerJobId:   text("provider_job_id"),
  providerCostUsd: numeric("provider_cost_usd", { precision: 10, scale: 4 }),
  errorCode:       text("error_code"),
  errorMessage:    text("error_message"),
  retryCount:      integer("retry_count").notNull().default(0),
  idempotencyKey:  text("idempotency_key"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  startedAt:       timestamp("started_at"),
  completedAt:     timestamp("completed_at"),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  userCreatedIdx:    index("ai_jobs_user_created_idx").on(t.userId, t.createdAt.desc()),
  statusIdx:         index("ai_jobs_status_idx").on(t.status),
  providerJobIdIdx:  index("ai_jobs_provider_jobid_idx").on(t.provider, t.providerJobId),
  idemUnique:        uniqueIndex("ai_jobs_idem_idx").on(t.userId, t.idempotencyKey),
}));

// ====== Media assets ====================================================
export const mediaType = ["image", "video", "audio", "text"] as const;
export type MediaType = (typeof mediaType)[number];

export const mediaAssets = pgTable("media_assets", {
  id:           uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:       text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId:        uuid("job_id").references(() => aiJobs.id, { onDelete: "set null" }),
  type:         text("type").$type<MediaType>().notNull(),
  storagePath:  text("storage_path").notNull(),         // s3 key inside our bucket
  url:          text("url"),                            // cached presigned/public URL
  thumbnailUrl: text("thumbnail_url"),
  mimeType:     text("mime_type"),
  sizeBytes:    bigint("size_bytes", { mode: "number" }),
  width:        integer("width"),
  height:       integer("height"),
  durationMs:   integer("duration_ms"),
  metadata:     jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  isFavorite:   boolean("is_favorite").notNull().default(false),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userCreatedIdx: index("media_user_created_idx").on(t.userId, t.createdAt.desc()),
  jobIdx:         index("media_job_idx").on(t.jobId),
}));

// ====== Payments ========================================================
export const paymentProviders = ["stripe", "paddle", "yookassa", "cloudpayments", "manual"] as const;
export const paymentStatuses = ["pending", "succeeded", "failed", "refunded", "cancelled"] as const;

export const paymentPackages = pgTable("payment_packages", {
  id:            uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug:          text("slug").notNull().unique(),
  name:          text("name").notNull(),
  tokens:        integer("tokens").notNull(),
  bonusTokens:   integer("bonus_tokens").notNull().default(0),
  priceCents:    integer("price_cents").notNull(),
  currency:      text("currency").notNull().default("USD"),
  stripePriceId: text("stripe_price_id"),
  isActive:      boolean("is_active").notNull().default(true),
  sortOrder:     integer("sort_order").notNull().default(100),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id:                uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:            text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  packageId:         uuid("package_id").references(() => paymentPackages.id),
  provider:          text("provider").$type<(typeof paymentProviders)[number]>().notNull(),
  providerPaymentId: text("provider_payment_id"),
  amountCents:       integer("amount_cents").notNull(),
  currency:          text("currency").notNull(),
  tokensToAdd:       integer("tokens_to_add").notNull(),
  status:            text("status").$type<(typeof paymentStatuses)[number]>().notNull().default("pending"),
  metadata:          jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
  completedAt:       timestamp("completed_at"),
}, (t) => ({
  userCreatedIdx: index("payments_user_created_idx").on(t.userId, t.createdAt.desc()),
  providerIdIdx:  index("payments_provider_id_idx").on(t.provider, t.providerPaymentId),
}));

export const promoCodes = pgTable("promo_codes", {
  id:              uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code:            text("code").notNull().unique(),
  bonusTokens:     integer("bonus_tokens").notNull(),
  maxRedemptions:  integer("max_redemptions"),
  redemptions:     integer("redemptions").notNull().default(0),
  expiresAt:       timestamp("expires_at"),
  isActive:        boolean("is_active").notNull().default(true),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
});

// Webhook dedup table — provider event_id is the canonical idempotency key.
// Insert into this BEFORE doing any side-effect; UNIQUE violation means we've
// already processed this event.
export const webhookEvents = pgTable("webhook_events", {
  id:              uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  provider:        text("provider").notNull(),
  eventId:         text("event_id").notNull(),
  signatureStatus: text("signature_status").$type<"verified" | "invalid" | "missing">().notNull(),
  payloadSummary:  jsonb("payload_summary").$type<Record<string, unknown> | null>(),
  receivedAt:      timestamp("received_at").notNull().defaultNow(),
  processedAt:     timestamp("processed_at"),
  processingError: text("processing_error"),
}, (t) => ({
  providerEventIdx:    uniqueIndex("webhook_events_provider_event_idx").on(t.provider, t.eventId),
  providerReceivedIdx: index("webhook_events_provider_received_idx").on(t.provider, t.receivedAt.desc()),
}));

export const promoRedemptions = pgTable("promo_redemptions", {
  id:          uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  promoId:     uuid("promo_id").notNull().references(() => promoCodes.id),
  userId:      text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bonusTokens: integer("bonus_tokens").notNull(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ uniqPerUser: uniqueIndex("promo_redemptions_unique").on(t.promoId, t.userId) }));

// ====== Inferred row + insert types ======================================
// Drizzle-equivalent of Supabase's generated database.types.ts. Use these
// instead of building ad-hoc shapes — they stay in sync with the schema
// automatically and are import-safe in both server and client code.

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type VerificationToken = typeof verificationTokens.$inferSelect;

export type TokenWallet = typeof tokenWallets.$inferSelect;
export type TokenTransaction = typeof tokenTransactions.$inferSelect;
export type NewTokenTransaction = typeof tokenTransactions.$inferInsert;

export type AiTool = typeof aiTools.$inferSelect;
export type NewAiTool = typeof aiTools.$inferInsert;

export type AiJob = typeof aiJobs.$inferSelect;
export type NewAiJob = typeof aiJobs.$inferInsert;

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;

export type PaymentPackage = typeof paymentPackages.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export type PromoCode = typeof promoCodes.$inferSelect;
export type PromoRedemption = typeof promoRedemptions.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;

// Aggregate Database shape — для случаев когда нужно передать
// "вся БД" как один тип (analog Supabase.Database).
export interface Database {
  users: User;
  accounts: Account;
  sessions: Session;
  verificationTokens: VerificationToken;
  tokenWallets: TokenWallet;
  tokenTransactions: TokenTransaction;
  aiTools: AiTool;
  aiJobs: AiJob;
  mediaAssets: MediaAsset;
  paymentPackages: PaymentPackage;
  payments: Payment;
  promoCodes: PromoCode;
  promoRedemptions: PromoRedemption;
  webhookEvents: WebhookEvent;
}
