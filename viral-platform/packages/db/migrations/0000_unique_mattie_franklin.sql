CREATE TYPE "public"."asset_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('video', 'image');--> statement-breakpoint
CREATE TYPE "public"."broll_mode" AS ENUM('auto_stock', 'my_library', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."broll_source" AS ENUM('pexels', 'pixabay', 'user_library');--> statement-breakpoint
CREATE TYPE "public"."clip_status" AS ENUM('pending', 'planning', 'ready', 'rendering', 'rendered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."export_format" AS ENUM('9:16', '1:1', '16:9');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'creator', 'pro', 'agency');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('uploaded', 'transcribing', 'detecting', 'planning_broll', 'rendering_preview', 'ready_for_review', 'rendering_final', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."render_quality" AS ENUM('1080p', '4k');--> statement-breakpoint
CREATE TYPE "public"."render_status" AS ENUM('queued', 'rendering', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "asset_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"project_id" uuid,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broll_assets_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "broll_source" NOT NULL,
	"provider_asset_id" text NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding" vector(3072),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broll_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clip_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"inserts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"hook_score" real DEFAULT 0 NOT NULL,
	"retention_score" real DEFAULT 0 NOT NULL,
	"emotional_score" real DEFAULT 0 NOT NULL,
	"viral_score" real DEFAULT 0 NOT NULL,
	"reasoning" text,
	"status" "clip_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credits_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"delta" real NOT NULL,
	"reason" text NOT NULL,
	"balance_after" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"project_id" uuid,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"status" "project_status" DEFAULT 'uploaded' NOT NULL,
	"filename" text NOT NULL,
	"source_video_r2_key" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"size_bytes" bigint NOT NULL,
	"broll_mode" "broll_mode" DEFAULT 'auto_stock' NOT NULL,
	"library_collection_id" uuid,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clip_id" uuid NOT NULL,
	"format" "export_format" NOT NULL,
	"quality" "render_quality" DEFAULT '1080p' NOT NULL,
	"caption_preset" text DEFAULT 'hormozi' NOT NULL,
	"status" "render_status" DEFAULT 'queued' NOT NULL,
	"output_r2_key" text,
	"duration_render_ms" integer,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"stripe_sub_id" text NOT NULL,
	"plan" "plan" NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"full_json_r2_key" text NOT NULL,
	"summary" text,
	"language" varchar(16) DEFAULT 'en' NOT NULL,
	"speakers_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"collection_id" uuid NOT NULL,
	"type" "asset_type" NOT NULL,
	"r2_key" text NOT NULL,
	"thumbnail_r2_key" text,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"orientation" text DEFAULT 'landscape' NOT NULL,
	"ai_metadata" jsonb,
	"user_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"embedding" vector(3072),
	"status" "asset_status" DEFAULT 'processing' NOT NULL,
	"error_reason" text,
	"size_bytes" bigint NOT NULL,
	"file_hash" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"credits_balance" real DEFAULT 30 NOT NULL,
	"library_storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_usage_log" ADD CONSTRAINT "asset_usage_log_asset_id_user_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."user_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_usage_log" ADD CONSTRAINT "asset_usage_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broll_plans" ADD CONSTRAINT "broll_plans_clip_id_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits_ledger" ADD CONSTRAINT "credits_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs_log" ADD CONSTRAINT "jobs_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_clip_id_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_assets" ADD CONSTRAINT "user_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_assets" ADD CONSTRAINT "user_assets_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broll_assets_cache_provider_idx" ON "broll_assets_cache" USING btree ("provider","provider_asset_id");--> statement-breakpoint
CREATE INDEX "broll_plans_clip_idx" ON "broll_plans" USING btree ("clip_id");--> statement-breakpoint
CREATE INDEX "clips_project_idx" ON "clips" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "collections_user_idx" ON "collections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credits_ledger_user_idx" ON "credits_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_user_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "renders_clip_idx" ON "renders" USING btree ("clip_id");--> statement-breakpoint
CREATE INDEX "user_assets_list_idx" ON "user_assets" USING btree ("user_id","status","deleted_at");--> statement-breakpoint
CREATE INDEX "user_assets_collection_idx" ON "user_assets" USING btree ("collection_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_assets_user_hash_idx" ON "user_assets" USING btree ("user_id","file_hash") WHERE "user_assets"."deleted_at" IS NULL;