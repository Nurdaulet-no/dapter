# 6. Processing Pipeline and AI Failover

## Document Processing Pipeline

1. `POST /documents/upload` receives a file.
2. The controller validates MIME/size.
3. `StorageService.upload()` stores the file in S3-compatible storage.
4. `DocumentRepository.createDocument()` creates a `Document` with `PROCESSING` status.
5. `DocumentService.processDocument(documentId)` starts in background.
6. `StorageService.download()` downloads the file from storage.
7. `ExtractionService.extractText()` extracts text:
   - PDF -> `pdf-parse`
   - PPTX -> XML parsing with `jszip` + `fast-xml-parser`
8. `AIService.generateLearningArtifacts()` generates notes/flashcards/quizzes.
9. `DocumentRepository.markCompleted()` persists artifacts and sets `COMPLETED`.
10. On any error: `DocumentRepository.markFailed()` + `FAILED` status.

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
