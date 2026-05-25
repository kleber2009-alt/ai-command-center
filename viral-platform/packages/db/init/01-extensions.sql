-- Runs once on first Postgres boot (mounted into docker-entrypoint-initdb.d).
-- pgvector backs broll_assets.embedding + its HNSW index (spec §6).
CREATE EXTENSION IF NOT EXISTS vector;
