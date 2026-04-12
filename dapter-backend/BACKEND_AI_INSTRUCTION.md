# Dapter Backend AI Instruction (PocketBase + OpenAI)

## 1. Current backend focus

Backend is optimized for AI document processing:

1. Authenticates users with email/password.
2. Accepts PDF/PPTX uploads.
3. Runs staged generation pipeline (notebook -> flashcards -> quizzes).
4. Stores entities and files in PocketBase.

## 2. Runtime stack

- Bun + TypeScript + Elysia
- PocketBase (users, sessions, documents, notes, flashcards, quizzes, storage_files)
- Vercel AI SDK + OpenAI-only provider
- Cookie-first auth transport with JWT access/refresh rotation

## 3. Core architecture

- `src/controllers/*`: HTTP contracts and status mapping.
- `src/services/*`: business flow orchestration.
- `src/repositories/*`: repository interfaces + PocketBase adapters.
- `src/config/pocketbase.ts`: PocketBase client.
- `prompts/*.system.ts`: system prompts for each AI stage.

## 4. AI pipeline behavior

1. Upload creates `PROCESSING` document and stores source file in `storage_files`.
2. Text extraction runs from stored file bytes.
3. Notebook is generated first and persisted.
4. Flashcards core is generated and persisted.
5. Flashcards enrichment metadata runs as non-blocking follow-up.
6. Quizzes are generated and persisted.
7. Document becomes `COMPLETED` when core stages succeed; stage failures are explicit.

## 5. Auth behavior

- Backend does not expose custom auth endpoints.
- User authentication is handled by PocketBase directly.
- Protected document endpoints require:
  - `Authorization: Bearer <pocketbase-user-token>`.

## 6. Environment contract (active)

Required:
- `POCKETBASE_URL`
- `OPENAI_API_KEY`

Optional:
- `POCKETBASE_ADMIN_EMAIL`
- `POCKETBASE_ADMIN_PASSWORD`
- `OPENAI_MODEL`
- upload/AI/job limits and intervals from `.env.example`

## 7. Logging contract highlights

- HTTP lifecycle: `http.request.*`
- Auth errors: `auth.*.failed`
- AI attempts: `ai.openai.attempt.*`
- Pipeline: `pipeline.process_document.*`, `pipeline.stage.*`
- Jobs: `documents.trash.cleanup.*`, `pipeline.flashcard_image.queue.*`

## 8. Migration status note

Runtime is already rewired to PocketBase repositories and OpenAI-only AI service.  
Legacy Prisma repository files may still exist in source tree as non-runtime leftovers and should not be used in wiring.
