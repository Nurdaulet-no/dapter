# 6. Processing Pipeline and AI Failover

## Document Processing Pipeline

1. Client authenticates and sends Bearer access token.
2. `POST /documents/upload` receives file from authenticated user.
3. Controller validates MIME/size and upload rate limits.
4. `StorageService.upload()` stores file in S3-compatible storage.
5. `DocumentRepository.createDocument()` creates `Document` with:
   - `PROCESSING` status
   - `userId` owner binding
6. `DocumentService.processDocument(documentId)` starts asynchronously.
7. `StorageService.download()` downloads source file from storage.
8. `ExtractionService.extractText()` extracts text:
   - PDF -> `pdf-parse`
   - PPTX -> XML parsing with `jszip` + `fast-xml-parser`
9. `AIService.generateLearningArtifacts()` produces notes/flashcards/quizzes.
10. `DocumentRepository.markCompleted()` persists artifacts and sets `COMPLETED`.
11. On any error: `DocumentRepository.markFailed()` + `FAILED` status.

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

Logic:

1. The first provider from `AI_PROVIDER_ORDER` is attempted.
2. If it fails (quota/network/auth/model), the error is logged.
3. The next provider is tried automatically.
4. If any provider succeeds, the result is returned.
5. If all fail, an aggregated error is thrown.
