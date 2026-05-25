-- Custom migration (drizzle-kit cannot codegen halfvec cast indexes).
-- Embeddings are stored as vector(3072); plain-vector HNSW caps at 2000 dims,
-- so the cosine HNSW indexes are built on a halfvec(3072) cast (supports ≤4000).
-- Apply after the generated schema migration / after `db:push`.
CREATE INDEX IF NOT EXISTS broll_assets_cache_embedding_idx
  ON broll_assets_cache USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

CREATE INDEX IF NOT EXISTS user_assets_embedding_idx
  ON user_assets USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);
