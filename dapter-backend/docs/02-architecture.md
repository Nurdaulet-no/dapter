# 2. Architecture and Project Structure

## Stack

- Runtime: **Bun**
- Language: **TypeScript** (strict)
- HTTP: **ElysiaJS** + `@elysiajs/cors`, `@elysiajs/swagger`
- Persistence / file storage / auth: **PocketBase**
- AI runtime: **Vercel AI SDK** (`ai`) + **xAI** adapter (`@ai-sdk/xai`)
- Extraction: `pdf-parse`, `jszip` + `fast-xml-parser`

## Layers

### Controllers (`src/controllers/`)
Request validation, bearer-token resolution, file collection, rate-limit, response shaping. No business logic. There are three domain controllers — `flashcards.controller.ts`, `quizzes.controller.ts`, and `notes.controller.ts` — each mounted as an Elysia sub-app under its prefix. `auth.ts` holds the shared bearer-token validator (`resolveCurrentUserId` calls `users.authRefresh` against PocketBase), the in-memory upload rate limit (a single `userId`-keyed bucket shared across all three upload endpoints), and the allowed MIME set.

### Services (`src/services/`)
- `flashcards.service.ts` / `quizzes.service.ts` / `notes.service.ts` — orchestrate upload → row insert → background pipeline → ownership-aware reads. Each owns a private `runPipeline`; flashcards additionally owns `generateImages`.
- `ai.service.ts` — `generateFlashcardDeck(text)`, `generateQuiz(text)`, and `generateNotes(text)`. Wraps the matching system prompt with the source text and delegates to the provider with the appropriate zod schema.
- `extraction.service.ts` — branches on MIME: PDF via `pdf-parse`, PPTX via `JSZip`+`fast-xml-parser`, TXT/MD via `TextDecoder`.
- `storage.service.ts` — thin wrapper over `pocketbase.collection("storage_files")`.
- `pipeline-helpers.ts` — `buildProvisionalTitle`, `extractCombinedText`, `runWithStageTimeout`, plus the shared `allowedMimeTypes` set and `normalizeMimeType`. The `LLMStage` union is `'flashcards' | 'quizzes' | 'notes'`; all three share `AI_STAGE_TIMEOUT_MS`.
- `providers/` — `provider.interface.ts` (`ILLMProvider` with `generateObject`/`generateImage`), `xai.provider.ts` (the only concrete adapter today), `factory.ts` (always returns a fresh `XaiProvider`).

### Repositories (`src/repositories/`)
PocketBase data access only.
- `flashcards.repository.ts` — implements `IFlashcardsRepository`. Holds an in-process `Map<rowId, Promise>` mutex (`rowLocks`) so concurrent image workers' `updateCardImageUrls` patches don't clobber each other when reading-modifying-writing the JSON `content`.
- `quizzes.repository.ts` — implements `IQuizzesRepository`. No image-gen for quizzes today, so no row mutex.
- `notes.repository.ts` — implements `INotesRepository`. Single-shot Markdown write, so no row mutex. Computes `wordCount` from `content.markdown` on read; the value is not persisted.

### Schemas (`src/schemas/`)
- Elysia response schemas (`*ListResponseSchema`, `*DetailResponseSchema`, `*StatusResponseSchema`, `create*ResponseSchema`).
- Zod LLM payload schemas (`flashcardPayloadSchema`, `quizPayloadSchema`, `notesPayloadSchema`). Per-field guidance lives on each `.describe()`; the AI SDK forwards descriptions to the model alongside the JSON Schema. `notesPayloadSchema` is `{ title, description, markdown }` — singular, one guide per call.

### Config (`src/config/`)
- `env.ts` — typed env reader. Throws if any of `POCKETBASE_URL`, `POCKETBASE_SUPERUSER_EMAIL`, `POCKETBASE_SUPERUSER_PASSWORD`, `XAI_API_KEY` are missing.
- `pocketbase.ts` — singleton `PocketBase` client + `ensureSuperuserAuth()` (run once at boot).
- `pocketbase-schema.ts` — declarative schema (`users`, `storage_files`, `flashcards`, `quizzes`, `notes`) plus `DROPPED_COLLECTIONS` consumed by the setup script.
- `logger.ts` — JSON-line structured logger.

### Errors / Types
- `src/errors/app-error.ts` — `AppError(statusCode, code, message)` recognized by the global error handler.
- `src/types/` — internal row/view shapes for all three domains plus PocketBase schema typing.

## Wiring

`src/index.ts` constructs concrete instances (`PocketBaseFlashcardsRepository`, `PocketBaseQuizzesRepository`, `PocketBaseNotesRepository`, `StorageService`, `ExtractionService`, `AIService`) and injects them into the three services, mounts the controllers, registers CORS (`env.frontendBaseUrls`) and Swagger (`/docs`), authenticates the superuser, and starts listening on `env.port`.

## Project tree

```text
dapter-backend/
  prompts/
    flashcards.system.ts
    quizzes.system.ts
    notes.system.ts
  scripts/
    setup-collections.ts
    e2e-endpoints.ts
  src/
    config/        env.ts, logger.ts, pocketbase.ts, pocketbase-schema.ts
    controllers/   flashcards.controller.ts, quizzes.controller.ts,
                   notes.controller.ts, auth.ts
    errors/        app-error.ts
    repositories/  flashcards.repository.ts, quizzes.repository.ts,
                   notes.repository.ts
    schemas/       flashcards.schema.ts, quizzes.schema.ts, notes.schema.ts
    services/      flashcards.service.ts, quizzes.service.ts, notes.service.ts,
                   ai.service.ts, extraction.service.ts, storage.service.ts,
                   pipeline-helpers.ts,
                   providers/{provider.interface,xai.provider,factory}.ts
    types/         flashcards.ts, quizzes.ts, notes.ts, pocketbase.ts
    index.ts
  .env.example
  README.md
  API_DOCS.md
  BACKEND_AI_INSTRUCTION.md
  docs/
```
