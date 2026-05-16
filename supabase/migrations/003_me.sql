-- Second-brain schema: personal profile + document library + RAG chunks.
-- Run AFTER 001_transcripts.sql and 002_generations.sql in Supabase SQL Editor.

create extension if not exists vector;

create table if not exists me_profile (
  id text primary key default 'singleton',
  bio text default '',
  projects text default '',
  academy text default '',
  social text default '',
  voice text default '',
  custom jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into me_profile (id) values ('singleton')
on conflict (id) do nothing;

create table if not exists me_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null check (source_type in ('paste', 'file', 'transcript')),
  source_meta jsonb default '{}'::jsonb,
  original_text text not null,
  char_count int not null default 0,
  chunk_count int not null default 0,
  created_at timestamptz default now()
);

create index if not exists me_documents_created_at_idx on me_documents (created_at desc);

create table if not exists me_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references me_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz default now()
);

create index if not exists me_chunks_document_id_idx on me_chunks (document_id);
create index if not exists me_chunks_embedding_idx on me_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Similarity search RPC. Returns top N most relevant chunks with their parent document title.
create or replace function match_me_chunks(
  query_embedding vector(1536),
  match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  document_title text,
  chunk_index int,
  content text,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.document_id,
    d.title as document_title,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from me_chunks c
  join me_documents d on d.id = c.document_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
