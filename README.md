# Dapter Project

Dapter is a document-processing backend for turning PDF/PPTX files into structured learning content: notes, flashcards, and quizzes.

## Current backend stack

- Bun + TypeScript
- ElysiaJS
- PocketBase for auth, data, and file storage
- Vercel AI SDK with OpenAI

## What it does

1. User logs in through PocketBase and gets a Bearer token.
2. Client uploads a PDF/PPTX document to the backend.
3. Backend stores the file in PocketBase and creates a `PROCESSING` document record.
4. Backend extracts text and generates notes, flashcards, and quizzes.
5. Flashcards are exposed only after image generation is finished.
6. Client polls status and reads the final artifacts.

## Local development

```bash
cd dapter-backend
bun install
cp .env.example .env
bun run dev
```

Required `.env` values:

- `POCKETBASE_URL`
- `AI_PROVIDER=openai`
- `OPENAI_API_KEY`

## Main backend endpoints

- `GET /health`
- `GET /documents`
- `POST /documents/upload`
- `GET /documents/:id/status`
- `GET /documents/:id/notes`
- `GET /documents/:id/flashcards`
- `GET /documents/:id/quizzes`
- `POST /documents/:id/retry/:stage`
- `DELETE /documents/:id/forever?target=notes|flashcards|quizzes`
- `GET /docs`

Protected document routes require:

```http
Authorization: Bearer <pocketbase-user-token>
```

## Documentation

- Backend overview: `dapter-backend/docs/01-system-overview.md`
- Architecture: `dapter-backend/docs/02-architecture.md`
- Config: `dapter-backend/docs/03-configuration.md`
- API: `dapter-backend/docs/04-api-reference.md`
- Data model: `dapter-backend/docs/05-data-model.md`
- Pipeline: `dapter-backend/docs/06-pipeline-and-failover.md`
- Local development: `dapter-backend/docs/07-local-development.md`
- Testing: `dapter-backend/docs/08-testing-and-troubleshooting.md`
- Logging: `dapter-backend/docs/09-logging.md`

## Tests

```bash
cd dapter-backend
bun run test:e2e
```
