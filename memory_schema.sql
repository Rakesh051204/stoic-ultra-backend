-- Persistent, durable facts about the user (identity, preferences, goals,
-- ongoing projects). Small table, long-lived, separate from full chat history.
create table if not exists user_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fact text not null,
  embedding vector(1024), -- match your existing Voyage AI embedding dimension
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists user_facts_embedding_idx
  on user_facts using hnsw (embedding vector_cosine_ops);

create index if not exists user_facts_user_id_idx
  on user_facts (user_id);

-- Returns the top-N facts most relevant to the current query for this user
create or replace function match_user_facts(
  p_user_id uuid,
  query_embedding vector(1024),
  match_count int default 5
)
returns table (id uuid, fact text, similarity float)
language sql stable as $$
  select id, fact, 1 - (embedding <=> query_embedding) as similarity
  from user_facts
  where user_id = p_user_id
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- NOTE: this assumes you already have a `conversation_chunks` table with a
-- `user_id`, `content`, and `embedding vector(1024)` column from your
-- existing chunker.js/RAG setup. If the match function below doesn't exist
-- yet, add it the same way as match_user_facts, pointed at that table:
--
-- create or replace function match_conversation_chunks(
--   p_user_id uuid,
--   query_embedding vector(1024),
--   match_count int default 4
-- )
-- returns table (id uuid, content text, similarity float)
-- language sql stable as $$
--   select id, content, 1 - (embedding <=> query_embedding) as similarity
--   from conversation_chunks
--   where user_id = p_user_id
--   order by embedding <=> query_embedding
--   limit match_count;
-- $$;