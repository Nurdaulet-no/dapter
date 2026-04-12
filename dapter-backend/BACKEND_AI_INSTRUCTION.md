# Dapter Backend — Full AI Instruction Manual

This file is a **single-source technical instruction** for AI agents and developers working on `dapter-backend`.
It consolidates runtime behavior, architecture, contracts, data model, pipeline logic, and file-level responsibilities based on the current codebase.

---

## 1. Purpose, scope, and bounded context

`dapter-backend` is a Bun + ElysiaJS service that:

1. Authenticates users (email/password + Google OAuth).
2. Accepts user-owned PDF/PPTX uploads.
3. Extracts text from document content (optionally selected pages/slides).
4. Generates notebook notes, flashcards, and quizzes via AI with provider failover.
5. Supports flashcard enrichment metadata and lazy image queue scaffold.
6. Provides document lifecycle APIs (status polling, trash, restore, permanent delete).

The backend is multi-tenant: all document operations are scoped to the authenticated user.

---

## 2. Runtime and startup lifecycle

Startup sequence in `src/index.ts`:

1. Build concrete dependencies:
   - `AuthRepository`, `DocumentRepository`
   - `StorageService`, `ExtractionService`, `AIService`
   - `AuthService`, `DocumentService`
2. Build Elysia app with:
   - CORS plugin (`@elysiajs/cors`)
   - Swagger plugin (`@elysiajs/swagger`) at `/docs`
   - request/response logging hooks
   - `/health`, auth controller, documents controller
   - global `.onError` mapper
3. `app.listen(env.port)`.
4. Start background jobs:
   - trash retention cleanup
   - flashcard image queue worker
5. Register SIGINT/SIGTERM shutdown handler to stop intervals.

---

## 3. Tech stack and dependencies

Runtime:
- Bun
- TypeScript (strict, no emit, bundler module resolution)
- ElysiaJS
- Prisma + PostgreSQL
- AWS SDK S3 client (S3-compatible)
- `pdf-parse`, `jszip`, `fast-xml-parser`
- Vercel AI SDK + providers:
  - `@ai-sdk/google`
  - `@ai-sdk/groq`
  - `@ai-sdk/openai-compatible`
- Auth:
  - `jsonwebtoken`
  - `bcryptjs`
  - `arctic` (Google OAuth)

Scripts (`package.json`):
- `dev`: watch mode
- `start`: run once
- `typecheck`
- Prisma generate/migrate
- `test:e2e`
- `test:extract:selected-pages`

---

## 4. Environment configuration (authoritative from `src/config/env.ts`)

### 4.1 Required vars (hard fail if missing)

- `DATABASE_URL`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

### 4.2 Optional vars and defaults

- `PORT` (default `3000`)
- `S3_ENDPOINT` (optional; enables path-style mode)
- `GOOGLE_GENERATIVE_AI_API_KEY` (needed only if `google` provider used)
- `GROQ_API_KEY` (needed only if `groq` provider used)
- `OPENROUTER_API_KEY` (needed only if `openrouter` provider used)
- `AI_PROVIDER_ORDER` default: `google,groq,openrouter`
- `AI_MODEL_GOOGLE` default: `gemini-2.0-flash`
- `AI_MODEL_GROQ` default: `llama-3.3-70b-versatile`
- `AI_MODEL_OPENROUTER` default: `meta-llama/llama-3.3-70b-instruct:free`
- `MAX_UPLOAD_SIZE_BYTES` default: `20971520` (20 MB)
- `MAX_SELECTED_PAGES` default: `40`
- `MAX_EXTRACTED_CHARS` default: `30000`
- `AI_PROVIDER_ATTEMPT_TIMEOUT_MS` default: `25000`
- `AI_STAGE_TIMEOUT_MS` default: `120000`
- `FLASHCARD_IMAGE_QUEUE_INTERVAL_SECONDS` default: `20`
- `FLASHCARD_IMAGE_QUEUE_BATCH_SIZE` default: `10`
- `FRONTEND_BASE_URLS` CSV list; used as CORS allowlist (single source of truth)
- `TRASH_RETENTION_DAYS` default: `7`
- `TRASH_CLEANUP_INTERVAL_MINUTES` default: `10`
- `TRASH_CLEANUP_BATCH_SIZE` default: `50`

### 4.3 CORS behavior

`origin: env.frontendBaseUrls`, `credentials: true`, methods:
`GET, POST, PATCH, DELETE, OPTIONS`.

`frontendBaseUrls` is parsed from `FRONTEND_BASE_URLS` CSV (fallback default: `http://localhost:3001`).

---

## 5. Authentication model

### 5.1 Token model

- Access token TTL: 15 minutes.
- Refresh token TTL: 7 days.
- Access payload: `{ sub, email, type: "access" }`.
- Refresh payload: `{ sub, sessionId, type: "refresh" }`.

### 5.2 Session model

Refresh token is never stored in plain text:
- hash (sha256) stored in `Session.refreshTokenHash`.
- refresh rotation updates hash and increments `refreshTokenVersion`.

### 5.3 Cookie model

Auth controller sets HttpOnly cookies:
- `dapter_access_token` (`Max-Age=15m`)
- `dapter_refresh_token` (`Max-Age=7d`)
- common attrs: `Path=/; HttpOnly; SameSite=Lax; Secure (only in production)`

### 5.4 Rate limits in auth controller

In-memory per-IP bucket:
- shared mechanism for register/login
- 10 attempts per 15 minutes
- returns 429 when exceeded

### 5.5 Google OAuth flow

1. `GET /auth/google`:
   - creates `state` + PKCE verifier
   - stores both in memory maps
   - returns 302 redirect to Google
2. `GET /auth/google/callback`:
   - validates state
   - validates auth code with Arctic Google client
   - fetches userinfo from Google OIDC endpoint
   - upserts user by email/googleId
   - issues tokens + sets cookies
   - redirects to frontend user route `/u/:nickname`
3. On callback failure:
   - redirects to `/login?error=google_oauth_failed` on frontend.

---

## 6. API surface (authoritative from controllers)

## 6.1 Public/system

- `GET /health` → `{ status: "ok" }`
- `GET /docs` → Swagger UI

## 6.2 Auth routes (`/auth`)

1. `POST /auth/register`
   - body: `{ email, password }`
   - validates and creates user with unique random nickname
   - sets auth cookies
   - response 201: `{ user, authenticated: true }`
   - errors: 400, 409, 429

2. `POST /auth/login`
   - body: `{ email, password }`
   - sets auth cookies
   - response 200: `{ user, authenticated: true }`
   - errors: 401, 429

3. `POST /auth/refresh`
   - optional body `{ refreshToken? }`
   - also supports refresh token from cookie
   - rotates tokens, sets new cookies
   - response 200: `{ user, authenticated: true }`
   - errors: 401

4. `POST /auth/logout`
   - optional body `{ refreshToken? }` or cookie
   - revokes session when token provided
   - clears auth cookies
   - response: `{ success: true }`
   - errors: 400

5. `GET /auth/me`
   - reads **access token from cookie**
   - response 200: `{ user, authenticated: true }`
   - errors: 401

6. `PATCH /auth/me/nickname`
   - reads access token from cookie
   - body: `{ nickname }`
   - nickname normalized to lowercase and validated `^[a-z0-9]{1,7}$`
   - response 200: `{ user, authenticated: true }`
   - errors: 400, 401, 409

7. `GET /auth/google`
   - 302 redirect to Google OAuth

8. `GET /auth/google/callback`
   - query: `{ code, state }`
   - 302 redirect to frontend success or login error

## 6.3 Documents routes (`/documents`)

Auth extraction in `.derive()`:
- checks `Authorization: Bearer ...` first
- fallback to access cookie
- verifies token via `authService.verifyAccessToken`

Routes:

1. `GET /documents`
   - list current user non-deleted documents
   - errors: 401, 500

2. `POST /documents/upload`
   - multipart body:
     - `file` (required)
     - `selectedStartPage?` (numeric)
     - `selectedEndPage?` (numeric)
     - `selectedPages?` (CSV string, e.g. `"1,3,8,9"`)
   - validations:
     - MIME only PDF or PPTX
     - size <= `MAX_UPLOAD_SIZE_BYTES`
     - selected pages parsed, deduped, sorted, each >=1
     - selected pages count <= `MAX_SELECTED_PAGES`
     - range start/end valid and >=1
     - range width <= `MAX_SELECTED_PAGES` when CSV not provided
   - upload rate limit: 8 uploads/min per user (fallback by forwarded IP)
   - returns `{ documentId, status: "PROCESSING" }`
   - errors: 400, 401, 429, 500

3. `GET /documents/:id/status`
   - returns full status and stage statuses + available artifacts
   - errors: 401, 403, 404, 500

4. `GET /documents/:id/flashcards`
   - flashcards-focused payload with stage statuses
   - errors: 401, 403, 404, 500

5. `GET /documents/:id/quizzes`
   - quizzes payload with stage statuses
   - errors: 401, 403, 404, 500

6. `GET /documents/:id/notes`
   - notes payload with stage statuses
   - errors: 401, 403, 404, 500

7. `POST /documents/:id/flashcards/:flashcardId/image/request`
   - queues lazy image generation if visual eligible
   - only allowed when `visualNeedScore >= 0.6`
   - if current imageStatus in `{null, not_requested, failed}` → set `queued`
   - errors: 401, 403, 404, 409, 500

8. `POST /documents/:id/retry/:stage`
   - stage in `{notebook, flashcards, quizzes}`
   - retries asynchronously
   - guard: flashcards/quizzes retries require notebook completed
   - returns `{ documentId, status: "PROCESSING" }`
   - errors: 400, 401, 403, 404, 500

9. `GET /documents/trash`
   - list current user trashed documents only
   - errors: 401, 500

10. `DELETE /documents/:id`
   - soft delete (move to trash)
   - errors: 401, 403, 404, 409, 500

11. `POST /documents/:id/restore`
   - restore from trash
   - errors: 401, 403, 404, 409, 500

12. `DELETE /documents/:id/forever`
   - permanent delete DB + storage object delete
   - errors: 401, 403, 404, 500

---

## 7. Pipeline architecture and stage transitions

Processing is orchestrated in `DocumentService`.

High-level flow:

1. Upload and register metadata in DB.
2. Start async `processDocument(documentId, selectedPages?)`.
3. Sequential stages:
   - notebook stage
   - flashcards core stage
   - quizzes stage
4. Flashcards enrichment runs in parallel as non-blocking follow-up.

### 7.1 Stage status dimensions

Document-level:
- `status`: `PROCESSING | COMPLETED | FAILED`
- `error` (global stage failure message)

Per-stage:
- `notebookStatus`, `notebookError`
- `flashcardsStatus`, `flashcardsError`
- `flashcardsEnrichmentStatus`, `flashcardsEnrichmentError`
- `quizzesStatus`, `quizzesError`

Each stage status enum:
- `PENDING | PROCESSING | COMPLETED | FAILED`

### 7.2 Notebook stage

1. `markStageProcessing(documentId, "notebook")`
2. Download source bytes from storage.
3. Extract text by mime type with optional selected pages/slides.
4. Guard `text.length <= MAX_EXTRACTED_CHARS`; else fail with explicit message.
5. AI generation (`generateNotebook`) with failover + timeout.
6. Save notebook artifacts:
   - deletes old notes/flashcards/quizzes for document
   - inserts notes
   - sets notebook completed and global status processing

On failure:
- `markStageFailed(documentId, "notebook", message)`
- global status becomes `FAILED`.

### 7.3 Flashcards core stage

1. `markStageProcessing(documentId, "flashcards")`
2. Read notebook text from DB notes only (not raw extraction text).
3. AI generation (`generateFlashcardsCoreFromNotebook`) with timeout/failover.
4. Save flashcards:
   - replace flashcards rows
   - set flashcards stage completed
   - if notebook and quizzes are complete, set global status `COMPLETED`
5. fire-and-forget `enrichFlashcardsStage`.

On failure:
- mark stage failed
- also marks enrichment failed in repository logic for flashcards stage failure.

### 7.4 Flashcards enrichment stage (non-blocking)

1. `markFlashcardsEnrichmentProcessing`
2. If no cards: mark enrichment completed and return.
3. Set defaults for all cards:
   - topic=`General`
   - iconKey=`book-open`
   - visualNeedScore=`0.2`
   - image fields reset
4. AI enrichment call:
   - input: notebook text + ordered card list with indices
   - schema includes optional topic/icon/visual/image pointer fields
5. Normalize enrichment:
   - max visual cards = `max(1, min(6, floor(total*0.3)))`
   - visual allowed only for top score candidates
   - must be score >= 0.7 to remain visual
   - non-visual cards are clamped <= 0.4 and visual fields cleared
6. Apply metadata updates by card index ordering.
7. Mark enrichment completed.

If enrichment call or apply fails:
- mark enrichment failed only
- do **not** fail whole pipeline.

### 7.5 Quizzes stage

1. `markStageProcessing(documentId, "quizzes")`
2. Read notebook text from notes.
3. AI generation (`generateQuizzesFromNotebook`) with timeout/failover.
4. Replace quizzes and mark stage completed.
5. If notebook and flashcards completed, set document status `COMPLETED`.

On failure:
- mark stage failed and global `FAILED`.

### 7.6 Retry semantics

`retryStage(documentId, stage, userId)`:
- returns immediately with processing status.
- executes retry async.
- stage dependencies:
  - flashcards retry requires notebook completed
  - quizzes retry requires notebook completed
  - notebook retry reruns notebook + flashcards + quizzes chain

---

## 8. Extraction subsystem details

Implemented in `ExtractionService`.

### 8.1 PDF extraction

- Uses `pdf-parse` with custom `pagerender`.
- Builds per-page text array (`pageTexts`) for deterministic page selection.
- Selected-page mode:
  - filter requested pages within bounds
  - join selected page texts with blank lines
- Full mode:
  - returns `parsed.text.trim()`.

### 8.2 PPTX extraction

- Uses `JSZip` to inspect `ppt/slides/slideN.xml`.
- Sorts slides numerically.
- Optional selected pages interpreted as slide numbers.
- Parses XML (`fast-xml-parser`), extracts text runs `a:r` -> `a:t`.
- Concatenates extracted fragments with newlines.

### 8.3 Unsupported MIME

- throws explicit error `Unsupported mime type for extraction: ...`.

---

## 9. AI subsystem details

Implemented in `AIService`.

### 9.1 Public operations

- `generateNotebook(text)`
- `generateFlashcardsCoreFromNotebook(notebookText)`
- `enrichFlashcardsMetadata(notebookText, flashcards)`
- `generateQuizzesFromNotebook(notebookText)`

All operations use failover helper with:
- provider chain from env
- per-attempt timeout `AI_PROVIDER_ATTEMPT_TIMEOUT_MS`
- `generateObject` with zod schema validation
- temperature `0.2`

### 9.2 Failover behavior

For each provider target:
1. resolve model and required API key
2. attempt generation with timeout
3. on success return immediately
4. on failure log and continue

If all fail:
- throws aggregated error including provider/model reasons.

### 9.3 Enrichment-specific constraints

Prompt enforces icon whitelist:
- `book-open, brain, code, landmark, mountain, users, credit-card, shield-check, chart-bar, database, target, workflow, qrcode, calendar-clock`

Prompt instructs visual score usage:
- visual >= 0.6 only when visual meaningfully helps.

Normalization layer (service-side) still applies hard cap and threshold logic.

---

## 10. Storage subsystem details

`StorageService` uses S3-compatible bucket:

- `upload`:
  - key format: `${randomUUID()}-${filenameWithSpacesReplacedByDash}`
  - writes with content type
  - URL:
    - endpoint mode: `${S3_ENDPOINT}/${bucket}/${key}`
    - AWS mode: `https://${bucket}.s3.${region}.amazonaws.com/${key}`
- `download`:
  - `GetObject`, throws if body empty
- `delete`:
  - idempotent for missing object (`NoSuchKey` / `NotFound` tolerated)

---

## 11. Background jobs

## 11.1 Trash retention job

`startTrashRetentionJob(documentService, {retentionDays, intervalMinutes, batchSize})`

- runs once immediately, then by interval
- guarded by `inProgress` lock
- deletes expired trashed documents:
  - cutoff = now - retentionDays
  - for each item: delete storage object, delete DB row

## 11.2 Flashcard image queue job

`startFlashcardImageQueueJob(documentService, {intervalSeconds, batchSize})`

- runs once immediately, then by interval
- guarded by `inProgress`
- processes queued cards.

Current behavior is scaffold (provider not connected):
- queued -> processing -> failed
- flashcards remain usable in text mode.

---

## 12. Data model and schema

Source of truth: `prisma/schema.prisma`.

Enums:
- `DocumentStatus`: `PROCESSING | COMPLETED | FAILED`
- `ArtifactStageStatus`: `PENDING | PROCESSING | COMPLETED | FAILED`
- `DocumentType`: `PDF | PPTX`

Models:

1. `User`
   - `email` unique
   - `nickname` unique varchar(7)
   - optional `passwordHash`, optional `googleId`

2. `Session`
   - stores hashed refresh token state
   - indexed by `userId`, `expiresAt`

3. `Document`
   - source file metadata (`fileKey`, `fileUrl`, size, mime, type)
   - optional selected range (`selectedStartPage`, `selectedEndPage`)
   - global + stage status/error fields
   - `deletedAt` for trash
   - ownership with `userId`

4. `Flashcard`
   - core fields `question`, `answer`
   - optional enrichment metadata:
     topic/icon/visual/image/pointer

5. `Quiz`
   - `options` JSON
   - `correctOption` index
   - optional explanation

6. `Note`
   - title + content blocks

Indexes:
- `Document.fileKey` unique
- `Document(id,userId)` unique
- `Document(userId,createdAt)` index
- `Document(userId,deletedAt,createdAt)` index

---

## 13. Migration history (chronological intent)

1. `20260410140825_init`
   - initial document/artifact schema.
2. `20260410180000_auth_multitenancy`
   - adds User, Session, `Document.userId`, backfill legacy owner.
3. `20260411100709_add_user_nickname`
   - no-op placeholder migration.
4. `20260411101500_add_user_nickname`
   - add and backfill `User.nickname`, unique index.
5. `20260411103000_nickname_len_7`
   - nickname to `VARCHAR(7)`.
6. `20260411120000_document_soft_delete`
   - `Document.deletedAt` + index.
7. `20260411193000_document_selected_page_range`
   - `selectedStartPage`, `selectedEndPage`.
8. `20260411201000_flashcard_visual_metadata`
   - flashcard enrichment/image metadata columns.
9. `20260411213000_document_stage_statuses`
   - per-stage statuses/errors.
10. `20260412024000_flashcards_enrichment_status`
   - enrichment status/error on document.

---

## 14. Ownership and authorization rules

Service-level ownership policy:

`ensureOwnershipOrNotFound(documentId, userId)`:
- if row exists with same user -> allow
- if row exists for another user -> throw 403
- if row does not exist -> throw 404

Used for status/artifact/retry/delete/restore/image endpoints.

This prevents existence leakage except by intended 403/404 semantics.

---

## 15. Error handling and response patterns

Layer behavior:

- Controllers map operational errors to HTTP responses and message payloads.
- `AppError` carries status code + machine code + message.
- Global `.onError` handles:
  - `AppError` -> `{ message }` with status code
  - `NOT_FOUND` -> structured `{ error: { code, message, statusCode } }`
  - fallback 500 -> structured `{ error: { code, message, statusCode } }`

Notable pattern:
- Some controller paths return `{ message }`
- global not-found/500 fallback may return `{ error: {...} }`

---

## 16. Logging and observability

Logger outputs JSON lines:
- `ts`, `level`, `message`, optional `context`.

Levels:
- `INFO`, `DEBUG`, `ERROR`.

Major log families:
- HTTP lifecycle
- auth failures
- document upload/validation/status
- pipeline stage start/finish/failure
- extraction details
- AI failover attempts
- storage operations
- queue/cleanup jobs

`logger.error` serializes Error objects safely.

---

## 17. Security notes

1. Passwords hashed with bcrypt cost 12.
2. Refresh tokens stored hashed.
3. Access/refresh cookies are HttpOnly.
4. Auth required for all document routes.
5. Ownership enforced server-side.
6. CORS configured to explicit origin list with credentials enabled.

Operational recommendations:
- keep secrets only in env (never commit secrets)
- use HTTPS in production (Secure cookies active in production mode)
- move in-memory rate-limit buckets and OAuth state store to shared storage if multi-instance deployment is required.

---

## 18. Known constraints and technical debt

1. Some existing markdown docs in `docs/` and `README.md` are partially outdated relative to current code:
   - auth response shape in docs may mention tokens in body, while controller returns `user + authenticated` and uses cookies.
   - docs may omit some newer fields (`flashcardsEnrichmentStatus`, `selectedPages` CSV input, retry/image endpoints details).
2. Upload request supports `selectedPages` CSV but DB stores only start/end range fields; exact list is not persisted.
3. Auth/login and upload rate limits are in-memory only (reset on restart, not shared across instances).
4. Flashcard image generation worker is scaffold (always fails image generation intentionally until provider integration).
5. OAuth state and PKCE verifier storage are in-memory (not distributed).

---

## 19. AI editing guardrails for this backend

When changing code:

1. Respect layer boundaries:
   - controller = HTTP contract only
   - service = orchestration/business logic
   - repository = DB access only
2. Preserve stage status semantics and enrichment non-blocking behavior.
3. Keep ownership checks for all document-scoped operations.
4. Keep explicit actionable error messages for user-facing validation failures.
5. If changing Prisma schema, add migration and keep repository mapping synchronized.
6. If changing response contracts, update:
   - controller response schema (`t.Object`)
   - TS view types in `src/types/document.ts`
   - frontend client expectations
7. Do not introduce silent fallbacks that hide processing failures.

---

## 20. File-by-file map (exports and responsibilities)

### `src/index.ts`
- Builds app graph and starts server/jobs.
- Exported symbols: none.
- Local function:
  - `shutdown()`: stops background timers.

### `src/config/env.ts`
- Parses and validates env.
- Exports:
  - `env` object with typed config.
- Local helpers:
  - `requireEnv(key)`
  - `parseOrigins(value)`

### `src/config/logger.ts`
- JSON structured logger.
- Exports:
  - `logger.info(message, context?)`
  - `logger.debug(message, context?)`
  - `logger.error(message, context?)`
- Local helpers:
  - `serializeError(error)`
  - `writeLog(level, message, context?)`

### `src/config/prisma.ts`
- Exports:
  - `prisma` (`new PrismaClient()`).

### `src/config/s3.ts`
- Exports:
  - `s3Client` (`new S3Client({...})`).

### `src/errors/app-error.ts`
- Exports:
  - `AppError` class with `statusCode`, `code`.

### `src/types/auth.ts`
- Exports:
  - `JwtAccessPayload`
  - `JwtRefreshPayload`
  - `AuthTokens`
  - `AuthUserView`

### `src/types/document.ts`
- Exports:
  - `FlashcardImageStatus`
  - `ArtifactStageStatus`
  - `DocumentRegistrationInput`
  - `LearningArtifactInput`
  - `DocumentStatusView`
  - `DocumentListItemView`
  - `DocumentFlashcardsView`
  - `DocumentQuizzesView`
  - `DocumentNotesView`
  - `FlashcardImageRequestResult`

### `src/schemas/auth.schema.ts`
- Elysia runtime schemas for auth routes.
- Exports:
  - `authUserSchema`
  - `authTokensSchema`
  - `authSuccessSchema`
  - `registerBodySchema`
  - `loginBodySchema`
  - `refreshBodySchema`
  - `googleCallbackQuerySchema`
  - `logoutBodySchema`
  - `updateNicknameBodySchema`

### `src/schemas/document.schema.ts`
- Elysia response schemas + Zod AI payload schemas.
- Exports (HTTP schemas):
  - `uploadDocumentResponseSchema`
  - `documentListResponseSchema`
  - `documentStatusResponseSchema`
  - `documentFlashcardsResponseSchema`
  - `documentQuizzesResponseSchema`
  - `documentNotesResponseSchema`
  - `flashcardImageRequestResponseSchema`
- Exports (Zod):
  - `flashcardSchema`
  - `flashcardCoreSchema`
  - `flashcardIconKeySchema`
  - `flashcardEnrichmentSchema`
  - `noteSchema`
  - `quizSchema`
  - `llmPayloadSchema`
  - `notesOnlyPayloadSchema`
  - `flashcardsOnlyPayloadSchema`
  - `flashcardsCorePayloadSchema`
  - `flashcardsEnrichmentPayloadSchema`
  - `quizzesOnlyPayloadSchema`
- Exported types:
  - `LlmPayload`
  - `NotesOnlyPayload`
  - `FlashcardsOnlyPayload`
  - `FlashcardsCorePayload`
  - `FlashcardsEnrichmentPayload`
  - `QuizzesOnlyPayload`

### `src/repositories/auth.repository.ts`
- Interface:
  - `IAuthRepository` with user/session CRUD methods.
- Class:
  - `AuthRepository` methods:
    - `createUserWithPassword`
    - `findUserByEmail`
    - `findUserById`
    - `findUserByGoogleId`
    - `findUserByEmailOrGoogleId`
    - `upsertGoogleUser`
    - `createSession`
    - `findSessionById`
    - `updateSessionToken`
    - `deleteSession`
    - `isNicknameTaken`
    - `updateUserNickname`

### `src/repositories/document.repository.ts`
- Interface:
  - `IDocumentRepository` document/stage/artifact/image/trash APIs.
- Class:
  - `DocumentRepository` methods:
    - `createDocument`
    - `getById`
    - `markStageProcessing`
    - `markFlashcardsEnrichmentProcessing`
    - `markFlashcardsEnrichmentCompleted`
    - `markFlashcardsEnrichmentFailed`
    - `saveNotebookArtifacts`
    - `saveFlashcardsArtifacts`
    - `saveQuizzesArtifacts`
    - `markStageFailed`
    - `getDocumentStatus`
    - `getDocumentFlashcards`
    - `getDocumentQuizzes`
    - `getDocumentNotes`
    - `getNotesForProcessing`
    - `getFlashcardsForProcessing`
    - `applyFlashcardsEnrichment`
    - `setFlashcardsDefaultMetadata`
    - `getDocumentsByUserId`
    - `getExpiredTrashDocuments`
    - `softDeleteById`
    - `restoreById`
    - `deleteById`
    - `getFlashcardById`
    - `updateFlashcardImageStatus`
    - `updateFlashcardImageResult`
    - `getQueuedFlashcards`
- Local helper:
  - `toFlashcardImageStatus(value)`

### `src/services/auth.service.ts`
- Interface:
  - `IAuthService`
- Class:
  - `AuthService` methods:
    - `register`
    - `login`
    - `refresh`
    - `revoke`
    - `verifyAccessToken`
    - `updateNickname`
    - `getGoogleAuthUrl`
    - `consumeGoogleState`
    - `loginWithGoogleCode`
    - private `issueTokens`
    - private `rotateTokens`
    - private `verifyRefreshToken`
    - private `hashToken`
    - private `generateUniqueNickname`

### `src/services/document.service.ts`
- Interface:
  - `IDocumentService`
- Class:
  - `DocumentService` methods:
    - `uploadAndQueue`
    - `processDocument`
    - `getStatus`
    - `getFlashcards`
    - `getQuizzes`
    - `getNotes`
    - `getDocuments`
    - `getTrashDocuments`
    - `restoreDocument`
    - `deleteDocument`
    - `deleteDocumentForever`
    - `requestFlashcardImage`
    - `retryStage`
    - `processQueuedFlashcardImages`
    - `cleanupExpiredTrash`
    - private `ensureOwnershipOrNotFound`
    - private `mapMimeTypeToDocumentType`
    - private `runWithTimeout`
    - private `getNotebookTextFromDb`
    - private `generateNotebookStage`
    - private `generateFlashcardsStage`
    - private `enrichFlashcardsStage`
    - private `normalizeEnrichment`
    - private `generateQuizzesStage`

### `src/services/ai.service.ts`
- Interface:
  - `IAIService`
- Class:
  - `AIService` methods:
    - `generateNotebook`
    - `generateFlashcardsCoreFromNotebook`
    - `enrichFlashcardsMetadata`
    - `generateQuizzesFromNotebook`
    - private `generateWithFailover`
    - private `resolveTargetChain`
    - private `resolveTargetByProvider`
    - private `resolveModel`
    - private `withTimeout`

### `src/services/extraction.service.ts`
- Interface:
  - `IExtractionService`
- Class:
  - `ExtractionService` methods:
    - `extractText`
    - private `extractPptxText`
    - private `extractTextNodes`

### `src/services/storage.service.ts`
- Interface:
  - `IStorageService`
- Class:
  - `StorageService` methods:
    - `upload`
    - `download`
    - `delete`

### `src/controllers/auth.controller.ts`
- Export:
  - `createAuthController(authService)`
- Local helpers:
  - `checkLoginRateLimit`
  - `readCookie`
  - `appendSetCookie`
  - `setAuthCookies`
  - `clearAuthCookies`

### `src/controllers/document.controller.ts`
- Export:
  - `createDocumentController(documentService, authService)`
- Local helpers/constants:
  - `allowedMimeTypes`
  - upload rate-limit constants/buckets
  - `checkUploadRateLimit`
  - `readCookie`

### `src/jobs/trash-retention.job.ts`
- Exports:
  - `TrashRetentionJobConfig`
  - `startTrashRetentionJob(documentService, config)` -> returns stop function

### `src/jobs/flashcard-image-queue.job.ts`
- Exports:
  - `FlashcardImageQueueJobConfig`
  - `startFlashcardImageQueueJob(documentService, config)` -> returns stop function

### `prisma/schema.prisma`
- Prisma data model and enums.

### `prisma/migrations/*/migration.sql`
- SQL migration timeline listed in section 13.

### `scripts/e2e-endpoints.ts`
- End-to-end script testing:
  - health
  - auth lifecycle
  - google redirect
  - document upload/polling/artifact endpoints
  - ownership check
  - delete flow

### `scripts/test-selected-pages-extract.ts`
- Utility script for manual extraction verification with selected pages/slides.

### Root docs
- `README.md`: setup/usage overview (partially stale vs current code details).
- `TESTING.md`: manual + scripted testing guide.
- `docs/*.md`: modular docs set (several sections partially outdated).
- `LOGGING_POINTS.md`: map of logger event locations.

---

## 21. Operational commands

Local run:

```bash
bun install
bun run prisma:generate
bun run prisma:migrate:dev
bun run dev
```

Health:

```bash
curl -sS http://localhost:3000/health
```

Typecheck:

```bash
bun run typecheck
```

E2E:

```bash
bun run test:e2e
```

Selected-pages extraction check:

```bash
bun run scripts/test-selected-pages-extract.ts /absolute/path/to/file.pdf 4
```

---

## 22. Final instruction to AI agents

When modifying this backend, treat this document + current source code as canonical.
If behavior changes, update this file immediately in the same change set.
