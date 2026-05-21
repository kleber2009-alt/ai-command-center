-- webhook_events · dedup table from research-doc.
-- Каждый webhook (Stripe, fal, Replicate) пишет сюда event_id ДО обработки.
-- Если запись уже есть — webhook идемпотентен, обрабатываем дубль как no-op.
--
-- Защищает от: Stripe re-deliveries, fal/Replicate retries, network double-deliver.
-- Дополняет существующую защиту через job.status check — это второй уровень.

create table if not exists "webhook_events" (
  "id"               uuid primary key default gen_random_uuid(),
  "provider"         text not null,                                 -- 'stripe' | 'fal' | 'replicate' | 'kling' | ...
  "event_id"         text not null,                                 -- provider's unique event identifier
  "signature_status" text not null check (signature_status in ('verified','invalid','missing')),
  "payload_summary"  jsonb,                                         -- truncated raw event for audit
  "received_at"      timestamp not null default now(),
  "processed_at"     timestamp,
  "processing_error" text
);

create unique index if not exists webhook_events_provider_event_idx
  on "webhook_events"("provider", "event_id");

create index if not exists webhook_events_provider_received_idx
  on "webhook_events"("provider", "received_at" desc);
