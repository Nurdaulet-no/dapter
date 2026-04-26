# Dapter Backend

Generates flashcard decks and quizzes from uploaded study material. Each upload (1–5 PDF/PPTX/TXT/MD files) becomes a single `flashcards` row or a single `quizzes` row whose full content lives in a JSON column.

## Stack

- Bun + TypeScript (strict)
- ElysiaJS (HTTP, Swagger, CORS)
- PocketBase (auth, persistence, file storage)
- Vercel AI SDK with the xAI Grok adapter (`@ai-sdk/xai`)
- `pdf-parse`, `jszip` + `fast-xml-parser` for extraction

## Local setup

```bash
bun install
cp .env.example .env
```

Fill in at least:

- `POCKETBASE_URL`, `POCKETBASE_SUPERUSER_EMAIL`, `POCKETBASE_SUPERUSER_PASSWORD`
- `XAI_API_KEY` (optionally `XAI_MODEL`, `XAI_IMAGE_MODEL`)
- `FRONTEND_BASE_URLS` (CORS allowlist)

Provision the PocketBase collections:

```bash
bun run setup:db <admin-email> <admin-password>
```

This drops legacy collections (`documents`, `notes`, `flashcard_decks`, `quiz_questions`, plus the previous `flashcards`/`quizzes` shapes) and creates/reconciles `users`, `storage_files`, `flashcards`, `quizzes`.

Run the server:

```bash
bun run dev
```

Verify:

```bash
curl -sS http://localhost:3000/health
# {"status":"ok"}
```

Swagger UI: `http://localhost:3000/docs`.

## Endpoints

All non-`/health` routes require `Authorization: Bearer <pocketbase-user-token>`. There is no `/documents` surface — flashcards and quizzes are top-level, parallel resources.

```
GET    /health
GET    /flashcards/
POST   /flashcards/                 multipart, field `files` (1–5 files)
GET    /flashcards/:id
GET    /flashcards/:id/status
POST   /flashcards/:id/retry
DELETE /flashcards/:id
GET    /quizzes/
POST   /quizzes/                    multipart, field `files` (1–5 files)
GET    /quizzes/:id
GET    /quizzes/:id/status
POST   /quizzes/:id/retry
DELETE /quizzes/:id
```

Allowed MIME types: `application/pdf`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `text/plain`, `text/markdown`. Default size cap 20 MB per file. Rate limit: 8 uploads/min/user (separate counter is shared across both surfaces — same in-memory bucket keyed by user id).

## Pipeline

1. Validate auth, MIME, size; rate-limit.
2. Upload each file to `storage_files`.
3. Insert one `flashcards` (or `quizzes`) row with `status=PROCESSING`, provisional title `Generating: <firstFile> (+N more)`, empty `content`. Return `{ id, status: "PROCESSING" }` immediately.
4. Background worker downloads each file, extracts text, concatenates with `--- file: <name> ---` separators, truncates to `MAX_EXTRACTED_CHARS`.
5. **Single** xAI Grok call against the row's zod payload schema (`flashcardPayloadSchema` or `quizPayloadSchema`). No notebook/intermediate artifact step.
6. Persist `title`, `description`, `content`, `status=COMPLETED`.
7. Flashcards only: an image-generation sub-pipeline runs `AI_IMAGE_CONCURRENCY` workers against the cards' `imagePrompt`s, uploads each PNG to `storage_files`, and writes the URL into the corresponding card's `imageUrls`. A per-row mutex serializes the JSON content patches.

Failures at any stage flip the row to `status=FAILED` and write `error`. `POST /:id/retry` re-runs the pipeline against the existing `docs` files.

## Layout

```
prompts/                          flashcards.system.ts, quizzes.system.ts
src/
  config/                         env, logger, pocketbase client + schema
  controllers/                    flashcards, quizzes, auth helpers
  services/                       flashcards, quizzes, ai, extraction, storage,
                                  pipeline-helpers, providers/{xai,factory}
  repositories/                   flashcards, quizzes (PocketBase adapters)
  schemas/                        Elysia response + zod LLM payload schemas
  errors/                         AppError
  types/                          row + view shapes
  index.ts                        wiring + Elysia bootstrap
scripts/                          setup-collections.ts, e2e-endpoints.ts
```

## Scripts

- `bun run dev` — watch mode.
- `bun run start` — one-shot run.
- `bun run typecheck` — strict TS.
- `bun run setup:db <email> <password>` — create/reconcile collections.
- `bun run test:e2e` — end-to-end exercise of the live API.

See `docs/` for the full reference.
