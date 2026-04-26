# Dapter Backend AI Instruction

## 1. Scope

The backend is a thin layer in front of:

- **PocketBase** — auth, JSON storage, file blobs.
- **xAI Grok** (`@ai-sdk/xai` via the Vercel AI SDK) — structured object generation and image generation.

It exposes three parallel surfaces, `/flashcards`, `/quizzes`, and `/notes`. Each upload produces exactly one row whose full content (cards, questions, or a Markdown study guide) lives in a JSON column on that row.

## 2. Runtime stack

- Bun + TypeScript (strict)
- Elysia 1.x with `@elysiajs/cors` and `@elysiajs/swagger`
- `pdf-parse`, `jszip`, `fast-xml-parser` for source-file extraction
- `pocketbase` SDK
- xAI provider (`grok-4.2` text model, `grok-2-image-1212` image model by default)

## 3. Collections

`users`, `storage_files`, `flashcards`, `quizzes`, `notes`. There is **no** `documents`, `flashcard_decks`, or `quiz_questions` collection. The setup script (`scripts/setup-collections.ts`) drops legacy collections of those names before reconciling the five current ones. `DROPPED_COLLECTIONS` only lists truly obsolete names; live collections (`flashcards`, `quizzes`, `notes`) are intentionally absent so user data isn't wiped on every `setup:db` run, and the script has a defensive guard that refuses to drop any collection still defined in the schema.

`flashcards`, `quizzes`, and `notes` rows share shape:

```
owner       relation -> users (single)
docs        relation -> storage_files (1..5, NOT cascadeDelete)
title       text (required)
description text (nullable)
content     json (required)
              flashcards: { cards: [...] }
              quizzes:    { questions: [...] }
              notes:      { markdown: string }
status      select PROCESSING | COMPLETED | FAILED
error       text
created     autodate
updated     autodate
```

## 4. Layered architecture

- `src/controllers/{flashcards,quizzes,notes}.controller.ts` — HTTP only. Bearer-token auth, file validation, rate-limit, response shaping.
- `src/services/{flashcards,quizzes,notes}.service.ts` — orchestrates upload → row insert → background pipeline. Owns ownership checks via `AppError(403/404)`.
- `src/services/ai.service.ts` — single LLM call per stage (`generateFlashcardDeck`, `generateQuiz`, `generateNotes`). Asserts a minimum source length (80 chars).
- `src/services/extraction.service.ts` — PDF/PPTX/TXT/MD → string.
- `src/services/storage.service.ts` — wraps `pocketbase.collection("storage_files")`.
- `src/services/pipeline-helpers.ts` — `buildProvisionalTitle`, `extractCombinedText`, `runWithStageTimeout`, `allowedMimeTypes`, `normalizeMimeType`. `LLMStage` includes `'flashcards' | 'quizzes' | 'notes'`.
- `src/services/providers/{provider.interface,xai.provider,factory}.ts` — `ILLMProvider` with `generateObject` and `generateImage`. xAI is the only adapter today; `factory.createLLMProvider()` returns a fresh `XaiProvider` instance.
- `src/repositories/{flashcards,quizzes,notes}.repository.ts` — PocketBase CRUD plus content-merging helpers. Flashcards repo holds a per-row mutex (`rowLocks`) so concurrent image workers can't clobber each other's `content` patches. Notes repo has no mutex (single-shot Markdown write).
- `src/schemas/{flashcards,quizzes,notes}.schema.ts` — Elysia response schemas + zod LLM payload schemas (`flashcardPayloadSchema`, `quizPayloadSchema`, `notesPayloadSchema`). Per-field guidance lives in zod `.describe()` and is forwarded to the model by the AI SDK. `notesPayloadSchema` is `{ title, description, markdown }` — singular, one Markdown guide per call.
- `prompts/notes.system.ts` — system prompt for notes generation. Targets ≥1500 words (prefer 3000–6000+), enforces H1/H2/H3 structure, **bold** key terms, fenced code, `$...$` inline + `$$...$$` display LaTeX, GFM tables, and blockquote callouts (`> **Worked example:** ...`, `> **Common pitfall:** ...`, `> **Intuition:** ...`).

## 5. AI pipeline

For each upload (per `flashcards.service.ts` / `quizzes.service.ts` / `notes.service.ts`):

1. Files uploaded to `storage_files`. `docs[]` collected.
2. Row inserted with provisional title, empty content, `status=PROCESSING`. Response sent.
3. Background:
   - Download every file in `docs[]`.
   - Extract text per file. Each file is truncated to `MAX_EXTRACTED_CHARS`, joined with `--- file: <name> ---` separators, and the combined string is also truncated to `MAX_EXTRACTED_CHARS`.
   - `aiService.generateFlashcardDeck(text)`, `generateQuiz(text)`, or `generateNotes(text)` runs inside `runWithStageTimeout` (`AI_STAGE_TIMEOUT_MS`).
   - The provider call uses `generateText` with `Output.object({ schema })`, `temperature: 0.3`, `maxOutputTokens: AI_MAX_OUTPUT_TOKENS`, bounded by `AI_PROVIDER_ATTEMPT_TIMEOUT_MS`.
   - Repo `saveCompletedContent` writes title/description/content and flips status to `COMPLETED`. For notes, `content = { markdown }`.
4. Flashcards only: image sub-pipeline. `AI_IMAGE_CONCURRENCY` workers pull cards off a queue, call `provider.generateImage({ prompt: card.imagePrompt })` (bounded by `AI_IMAGE_TIMEOUT_MS`), upload the PNG to `storage_files`, and call `repo.updateCardImageUrls(rowId, cardId, [url])`. The repo serializes content patches via the row mutex. Quizzes and notes have no image sub-step.
5. Errors anywhere in the background flow → `repo.markFailed(id, message)`.

There is **no** notebook stage and **no** intermediate persisted artifact between extraction and the final LLM call.

## 6. Auth

The backend performs no login or refresh. Each request's `Authorization: Bearer <token>` is validated by spinning a throwaway `PocketBase` client and calling `users.authRefresh()` (`src/controllers/auth.ts`). The `users` record id is attached as `currentUser.id`. Requests without a usable token get `401`.

## 7. Environment

Required (startup throws otherwise):

- `POCKETBASE_URL`, `POCKETBASE_SUPERUSER_EMAIL`, `POCKETBASE_SUPERUSER_PASSWORD`
- `XAI_API_KEY`

Optional (with defaults):

- `PORT=3000`
- `AI_PROVIDER=xai`
- `XAI_MODEL=grok-4.2`, `XAI_IMAGE_MODEL=grok-2-image-1212`
- `MAX_UPLOAD_SIZE_BYTES=20971520` (20 MB)
- `MAX_EXTRACTED_CHARS=200000`
- `AI_PROVIDER_ATTEMPT_TIMEOUT_MS=600000` (10 min)
- `AI_STAGE_TIMEOUT_MS=900000` (15 min)
- `AI_IMAGE_TIMEOUT_MS=60000`
- `AI_IMAGE_CONCURRENCY=4`
- `AI_MAX_OUTPUT_TOKENS=2000000`
- `FRONTEND_BASE_URLS=http://localhost:3001,http://localhost:5173`

## 8. Logging

Structured JSON via `src/config/logger.ts`. Notable events:

- `http.request.received`, `http.request.completed`, `http.request.failed`
- `flashcards.upload_and_queue.started`, `flashcards.row.created`, `flashcards.pipeline.completed|failed|unhandled`
- `flashcards.images.started|completed`, `flashcards.images.card.failed`
- `quizzes.upload_and_queue.started`, `quizzes.row.created`, `quizzes.pipeline.completed|failed|unhandled`
- `notes.upload_and_queue.started`, `notes.row.created`, `notes.pipeline.completed|failed|unhandled`, `notes.pipeline.retry.unhandled`
- `pipeline.stage.started|finished`, `pipeline.source.downloaded`
- `extraction.started`, `extraction.pdf.completed`, `extraction.pptx.completed`, `extraction.text.completed`
- `ai.flashcards.generation.started`, `ai.quizzes.generation.started`, `ai.notes.generation.started`
- `ai.provider.attempt.started|completed|failed`, `ai.image.generated|failed`
- `storage.upload.started|completed`, `storage.download.started|completed`, `storage.delete.started|completed`

## 9. Deletion

`DELETE /flashcards/:id`, `DELETE /quizzes/:id`, and `DELETE /notes/:id` remove the row only. `storage_files` rows referenced via `docs[]` are intentionally **not** cascade-deleted; they remain available for retry or recovery. There is no soft-delete or trash.
