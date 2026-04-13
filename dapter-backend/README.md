# Dapter Backend API

Production-oriented backend for document transformation pipeline:
`PDF/PPTX -> extraction -> LLM -> notes/flashcards/quizzes`.

## Stack

- Bun + TypeScript (strict)
- ElysiaJS
- PocketBase (data/auth/file storage)
- Vercel AI SDK (provider abstraction, OpenAI adapter enabled)

## Local setup

```bash
bun install
cp .env.example .env
```

Set required values in `.env`.

Required minimum:
- `POCKETBASE_URL`
- `AI_PROVIDER=openai`
- `OPENAI_API_KEY`
- valid PocketBase auth tokens for clients (handled by PocketBase)

## Full local backend startup

1. Install dependencies:

```bash
bun install
```

2. Configure environment:

```bash
cp .env.example .env
```

Update at least:

- `POCKETBASE_URL`
- `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`
- `MAX_UPLOAD_SIZE_BYTES`, `MAX_EXTRACTED_CHARS`
- `AI_PROVIDER_ATTEMPT_TIMEOUT_MS`
- `AI_STAGE_TIMEOUT_MS`

3. Start PocketBase locally (default URL `http://127.0.0.1:8090`) and create required collections.

4. Run backend:

```bash
bun run dev
```
To test backend u can use script e2e-endpoints.ts which runs through all endpoints in sequence
```bash
bun run test:e2e
```

5. Verify API is alive:

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
- `GET /documents` (requires PocketBase Bearer token)
- `POST /documents/upload` (multipart form-data, field `file`)
- `GET /documents/:id/status` (requires PocketBase Bearer token)
- `GET /documents/:id/flashcards` (requires PocketBase Bearer token)
- `GET /documents/:id/quizzes` (requires PocketBase Bearer token)
- `GET /documents/:id/notes` (requires PocketBase Bearer token)
- `DELETE /documents/:id/forever?target=notes|flashcards|quizzes` (requires PocketBase Bearer token)
- `GET /docs` (Swagger)

AI processing is staged notebook-first:

- Stage 1: structured notes (notebook) from extracted text
- Stage 2: flashcard decks generated from notebook content in one pass (`front`, `back`, `imagePrompt`, optional tags/imageUrls)
- Stage 2b: image generation is executed before exposing flashcards
- Stage 3: quizzes generated from notebook content

Data model split:

- flashcards: `flashcard_decks` + `flashcards`
- quizzes: `quizzes` + `quiz_questions`

## Architecture

- `src/controllers`: HTTP layer only
- `src/services`: business logic and pipeline orchestration
- `src/repositories`: repository interfaces + PocketBase adapters
- `src/schemas`: input/output/LLM validation schemas
