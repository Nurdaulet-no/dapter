# Dapter Backend API

Production-oriented backend for document transformation pipeline:
`PDF/PPTX -> extraction -> LLM -> notes/flashcards/quizzes`.

## Stack

- Bun + TypeScript (strict)
- ElysiaJS
- Prisma + PostgreSQL
- S3-compatible blob storage
- Vercel AI SDK (Google/Groq/OpenRouter)
- AI failover orchestration (Google/Groq/OpenRouter)

## Local setup

```bash
bun install
cp .env.example .env
```

Set required values in `.env`.

AI failover configuration:

- `AI_PROVIDER_ORDER` example:
  `google,groq,openrouter`
- Per-provider model variables:
  - `AI_MODEL_GOOGLE`
  - `AI_MODEL_GROQ`
  - `AI_MODEL_OPENROUTER`
- The backend will try providers in order and switch automatically on failure.
- Required API key depends on provider in the chain:
  - `google:*` -> `GOOGLE_GENERATIVE_AI_API_KEY`
  - `groq:*` -> `GROQ_API_KEY`
  - `openrouter:*` -> `OPENROUTER_API_KEY`

## Database

```bash
bun run prisma:generate
bun run prisma:migrate:dev --name init
```

## Full local backend startup

1. Start PostgreSQL (Docker Compose):

```bash
docker compose up -d postgres
docker compose ps
```

2. Install dependencies:

```bash
bun install
```

3. Configure environment:

```bash
cp .env.example .env
```

Update at least:

- `DATABASE_URL`
- `S3_REGION`, `S3_BUCKET`, `S3_ENDPOINT` (if used), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`
- `AI_PROVIDER_ORDER`, `AI_MODEL_GOOGLE`, `AI_MODEL_GROQ`, `AI_MODEL_OPENROUTER`

4. Generate Prisma client and apply migrations:

```bash
bun run prisma:generate
bun run prisma:migrate:dev --name init
```

5. Run backend:

```bash
bun run dev
```
To test backend u can use script e2e-endpoints.ts which runs through all endpoints in sequence
```bash
bun run test:e2e
```

6. Verify API is alive:

```bash
curl -sS http://localhost:3000/health
```

Expected:

```json
{"status":"ok"}
```

Open Swagger docs at `http://localhost:3000/docs`.

## Run

```bash
bun run dev
```

Server endpoints:

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /documents` (requires Bearer token)
- `POST /documents/upload` (multipart form-data, field `file`)
- `GET /documents/:id/status` (requires Bearer token)
- `GET /documents/:id/flashcards` (requires Bearer token)
- `GET /documents/:id/quizzes` (requires Bearer token)
- `GET /documents/:id/notes` (requires Bearer token)
- `DELETE /documents/:id` (requires Bearer token)
- `GET /docs` (Swagger)

Required auth env values:

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

## Architecture

- `src/controllers`: HTTP layer only
- `src/services`: business logic and pipeline orchestration
- `src/repositories`: database access (Prisma adapter)
- `src/schemas`: input/output/LLM validation schemas
