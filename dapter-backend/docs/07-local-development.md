# 7. Local Development

## 1. Install

```bash
bun install
```

## 2. Configure

```bash
cp .env.example .env
```

Fill in (at minimum):

- `POCKETBASE_URL` (default: `http://127.0.0.1:8090`)
- `POCKETBASE_SUPERUSER_EMAIL`, `POCKETBASE_SUPERUSER_PASSWORD`
- `XAI_API_KEY`
- `FRONTEND_BASE_URLS` if your frontend isn't on `http://localhost:3001` or `http://localhost:5173`

See `03-configuration.md` for the full list and defaults.

## 3. Start PocketBase

Run a PocketBase instance separately. Default URL `http://127.0.0.1:8090`. Create a superuser if you haven't already, and use the same email/password in `.env`.

## 4. Provision collections

```bash
bun run setup:db <admin-email> <admin-password>
```

This script (`scripts/setup-collections.ts`):

- Authenticates as the PocketBase superuser.
- Drops legacy collections in `DROPPED_COLLECTIONS` (`flashcards`, `quiz_questions`, `flashcard_decks`, `quizzes`, `notes`, `documents`) — including the previous `flashcards`/`quizzes` shapes, so re-running it is destructive.
- Creates or reconciles `users`, `storage_files`, `flashcards`, `quizzes` per `pocketBaseSchemaMapping`. Existing fields are patched in place (added / updated / removed); system fields are preserved.

Idempotent for the four current collections, destructive for the legacy ones.

## 5. Run the API

```bash
bun run dev    # watch mode
# or
bun run start  # one-shot
```

Verify:

```bash
curl -sS http://localhost:3000/health
# {"status":"ok"}
```

Swagger UI: `http://localhost:3000/docs`.

## 6. Supported source files

- `application/pdf` (`.pdf`)
- `application/vnd.openxmlformats-officedocument.presentationml.presentation` (`.pptx`)
- `text/plain` (`.txt`)
- `text/markdown` (`.md`)

Per-file size cap defaults to 20 MB (`MAX_UPLOAD_SIZE_BYTES`); collection cap is 25 MB.

## Scripts

- `bun run dev` — watch mode (`bun run --watch src/index.ts`).
- `bun run start` — one-shot run.
- `bun run typecheck` — `tsc --noEmit`.
- `bun run setup:db <email> <password>` — provision/reconcile collections.
- `bun run test:e2e` — run `scripts/e2e-endpoints.ts` against a live backend.
