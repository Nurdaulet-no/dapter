# 6. Processing Pipeline and AI Runtime

## Per-upload pipeline

Triggered by `POST /flashcards/` or `POST /quizzes/`. The two services are structurally identical (`flashcards.service.ts` / `quizzes.service.ts`); they diverge only in (a) which AI method they call and (b) flashcards' image sub-pipeline.

1. **Validate.** Controller checks bearer token (`resolveCurrentUserId`), upload rate limit (8/min/user), file count (1–5), MIME type (`allowedMimeTypes`), and per-file size (`MAX_UPLOAD_SIZE_BYTES`). Each file's bytes are read into memory.
2. **Upload sources.** Service uploads each file to `storage_files`, collecting `fileKey`s into `docs[]` and matching `{ fileKey, fileName, mimeType }` triples for the pipeline.
3. **Insert row.** Repository creates one `flashcards` (or `quizzes`) row with provisional title (`buildProvisionalTitle`), `content: { cards: [] }` (or `{ questions: [] }`), `status: "PROCESSING"`. The id is returned to the client immediately.
4. **Background pipeline** (`runPipeline`, fire-and-forget):
   1. **Download + extract.** `extractCombinedText` downloads each file, runs `ExtractionService.extractText`, truncates each per-file output to `MAX_EXTRACTED_CHARS`, joins with `--- file: <name> ---` separators, and truncates the joined string to `MAX_EXTRACTED_CHARS` again.
      - PDF → `pdf-parse` (page-aware text reassembly).
      - PPTX → `JSZip` + `fast-xml-parser` walking each `ppt/slides/slideN.xml`.
      - TXT/MD → UTF-8 decode.
   2. **LLM call.** `runWithStageTimeout(stage, rowId, ...)` wraps `aiService.generateFlashcardDeck(text)` or `generateQuiz(text)` in a `Promise.race` against `AI_STAGE_TIMEOUT_MS`. The provider call is also bounded by `AI_PROVIDER_ATTEMPT_TIMEOUT_MS` internally.
   3. **Persist.** `repository.saveCompletedContent(id, { title, description, cards|questions })` atomically writes `title`, `description`, `content`, `status=COMPLETED`, `error=null`. For flashcards this goes through the per-row mutex so it can't interleave with image patches.
5. **Image sub-pipeline (flashcards only).** `generateImages(id, cards)`:
   - Builds a queue of cards.
   - Spawns `min(AI_IMAGE_CONCURRENCY, queue.length)` workers.
   - Each worker pops a card, calls `provider.generateImage({ prompt: card.imagePrompt })` (bounded by `AI_IMAGE_TIMEOUT_MS`), uploads the PNG bytes to `storage_files` with name `flashcard-<cardId>.png`, then calls `repository.updateCardImageUrls(id, cardId, [fileUrl])`. The repository acquires the row mutex, re-reads the row, patches the card's `imageUrls`, and writes the whole `content` back.
   - Failures on a single image are logged (`flashcards.images.card.failed`) and skipped — the row stays `COMPLETED`. There is currently no quiz image sub-pipeline.
6. **Failure handling.** Any throw in `runPipeline` is caught and routed to `repository.markFailed(id, message)`, flipping `status=FAILED` and writing `error`. Background errors that escape `runPipeline` are logged as `flashcards.pipeline.unhandled` / `quizzes.pipeline.unhandled` but the row state has already been updated.

## Retry

`POST /:resource/:id/retry`:

1. Verify ownership (`getById(id, ownerId)`).
2. `markProcessing(id)` (clears `error`).
3. Resolve `docs[]` back into `{ fileKey, fileName, mimeType }` triples by re-fetching each `storage_files` record.
4. Re-run `runPipeline` against those sources.

The original LLM output is replaced wholesale; partial recovery is not attempted.

## LLM contract

- **Provider.** xAI Grok via `@ai-sdk/xai`. `XAI_MODEL` for text/structured-object output; `XAI_IMAGE_MODEL` for images.
- **Call shape.** `generateText` from `ai` with `Output.object({ schema })`, `temperature: 0.3`, `maxOutputTokens: AI_MAX_OUTPUT_TOKENS`. The schema (`flashcardPayloadSchema` / `quizPayloadSchema`) is a zod object; per-field guidance lives on each `.describe()`.
- **Prompt assembly.** `[<system prompt>, "", "SOURCE:\n" + text.slice(0, MAX_EXTRACTED_CHARS)].join("\n")`. The system prompts live in `prompts/flashcards.system.ts` and `prompts/quizzes.system.ts`.
- **Validation.** AI SDK enforces the zod schema. The flashcards schema requires ≥40 cards; the quizzes schema requires ≥30 questions and ≥4 options per question.
- **Failure modes.**
  - Provider error / timeout → `xAI failed for <stage>: <message>` thrown out of `generateObject`.
  - Schema validation failure → SDK throws; the service catches it and marks the row failed.
  - Empty / too-short source text (<80 chars after extraction) → `aiService` throws before calling the provider.

## Limits and ownership

- File count: 1–5 per upload, enforced at the controller and by the `storage_files` relation `maxSelect: 5`.
- File size: `MAX_UPLOAD_SIZE_BYTES` (controller) + `25 MB` collection cap on `storage_files.file`.
- Source text: capped at `MAX_EXTRACTED_CHARS` per file and again on the joined string.
- Ownership: services use `assertOwnershipOrThrow` to differentiate `404` (no such row) from `403` (row exists but `owner` ≠ caller).

## What's intentionally NOT here

- No notebook / intermediate stage. Extraction → LLM is direct.
- No soft delete or trash.
- No multi-stage status (no `notebookStatus`, `flashcardsStatus`, etc.). The single row-level `status` is the only signal.
