-- SomHR · PostgreSQL bootstrap
-- Runs automatically on first container start (mounted into
-- /docker-entrypoint-initdb.d by docker-compose) and must be run once
-- manually on any non-Docker database before `prisma migrate`.

CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector: SomAI RAG embeddings
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram search: employee/candidate fuzzy search
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
