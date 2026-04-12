# 6. Processing Pipeline and AI Failover

## Document Processing Pipeline

1. Client authenticates and sends Bearer access token.
2. `POST /documents/upload` receives file from authenticated user.
3. Controller validates MIME/size and upload rate limits.
4. `StorageService.upload()` stores file in S3-compatible storage.
5. `DocumentRepository.createDocument()` creates `Document` with:
   - `PROCESSING` status
   - `userId` owner binding
   - optional selected page range metadata
6. `DocumentService.processDocument(documentId)` starts asynchronously.
7. `StorageService.download()` downloads source file from storage.
8. `ExtractionService.extractText()` extracts text:
   - PDF -> `pdf-parse`
   - PPTX -> XML parsing with `jszip` + `fast-xml-parser`
9. `AIService.generateNotebook()` creates canonical notebook sections.
10. Notebook is persisted immediately (`notebookStatus=COMPLETED` on success).
11. `AIService.generateFlashcardsCoreFromNotebook()` creates flashcards core (`question`, `answer`) and persists it as soon as it succeeds.
12. Flashcards enrichment metadata (`topic`, `iconKey`, `visualNeedScore`, `imagePrompt`, pointer fields) is generated in a non-blocking follow-up call.
13. `AIService.generateQuizzesFromNotebook()` creates quizzes from notebook text.
14. Document is marked `COMPLETED` when notebook + flashcards core + quizzes are completed.
15. If a core stage fails, only that stage is marked failed and status API keeps already saved artifacts available.

### Limits and validation

- upload rejects selected ranges larger than `MAX_SELECTED_PAGES`
- processing fails when extracted text exceeds `MAX_EXTRACTED_CHARS`
- errors are explicit so users can reduce selected range

## Flashcard image lazy pipeline (provider-agnostic scaffold)

1. Cards with `visualNeedScore >= 0.6` are stored with `imageStatus=not_requested`.
2. Frontend requests one image via
   `POST /documents/:id/flashcards/:flashcardId/image/request`.
3. Backend transitions status to `queued`.
4. Background job picks queued cards in batches:
   - `queued -> processing -> failed` (current scaffold behavior)
5. Flashcards remain fully usable in text mode even when image is failed/missing.

## Flashcards two-stage generation

1. Core flashcards (`question`, `answer`) are critical and saved first.
2. Enrichment is optional and asynchronous:
   - metadata may fail without failing the core flashcards stage
   - fallback defaults keep UX usable even without enrichment data

## Ownership and access control

- All document retrieval endpoints are protected.
- Service/repository enforce ownership checks:
  - foreign document access -> `403`
  - missing document -> `404`
- Deletion is owner-only and includes both DB and storage cleanup.

## AI failover

Failover is configured via:

- `AI_PROVIDER_ORDER` (attempt order)
- `AI_MODEL_GOOGLE`
- `AI_MODEL_GROQ`
- `AI_MODEL_OPENROUTER`
- `AI_PROVIDER_ATTEMPT_TIMEOUT_MS` (per-provider attempt timeout)

Logic:

1. The first provider from `AI_PROVIDER_ORDER` is attempted.
2. Each provider attempt is bounded by `AI_PROVIDER_ATTEMPT_TIMEOUT_MS`.
3. If it fails (quota/network/auth/model/timeout), the error is logged.
4. The next provider is tried automatically.
5. If any provider succeeds, the result is returned.
6. If all fail, an aggregated error is thrown.
