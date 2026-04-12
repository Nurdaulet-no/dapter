# 6. Processing Pipeline and AI Runtime

## Document Processing Pipeline

1. Client authenticates and sends Bearer access token.
2. `POST /documents/upload` receives file from authenticated user.
3. Controller validates MIME/size/page limits and upload rate limits.
4. `StorageService.upload()` stores file in PocketBase file storage (`storage_files` collection).
5. `DocumentRepository.createDocument()` creates `Document` with:
   - `PROCESSING` status
   - owner binding
   - stage statuses initialized (`PENDING`)
6. `DocumentService.processDocument(documentId)` starts asynchronously.
7. `StorageService.download()` downloads source file from storage.
8. `ExtractionService.extractText()` extracts text (PDF/PPTX).
9. `AIService.generateNotebook()` creates canonical notebook sections.
10. Notebook is persisted immediately (`notebookStatus=COMPLETED` on success).
11. `AIService.generateFlashcardDecksFromNotebook()` creates flashcard decks in one pass, with full card fields (`front`, `back`, `imagePrompt`, optional `tags`, optional `imageUrls`).
12. Backend runs stage-2 image generation for every card using an internal per-card image prompt and writes `imageUrls`.
13. Only after step 12 completes, `flashcardsStatus` is marked `COMPLETED` and flashcards become visible via API.
14. `AIService.generateQuizzesFromNotebook()` creates quizzes in one pass, including questions with `correctIndex`, optional tags/imageUrls, and `imagePrompt`.
15. Document is marked `COMPLETED` when notebook + flashcards + quizzes are completed.
16. If a core stage fails, document status is marked `FAILED`.

## Key product guarantees

- Flashcards are hidden until image generation is completed for generated cards.
- Flashcards and quizzes are persisted in separate tables:
  - `flashcard_decks` + `flashcards`
  - `quizzes` + `quiz_questions`
- Deprecated flashcard metadata fields are removed:
  - `requiresPointer`
  - `visualNeedScore`
  - `pointerX`
  - `pointerY`
  - `topic`
  - `iconKey`

## Limits and validation

- Upload rejects files larger than `MAX_UPLOAD_SIZE_BYTES`.
- Processing fails when extracted text exceeds `MAX_EXTRACTED_CHARS`.
- Errors are explicit and surface precise reason.

## Stage status fields exposed to frontend

- `notebookStatus` / `notebookError`
- `flashcardsStatus` / `flashcardsError`
- `quizzesStatus` / `quizzesError`

## Ownership and access control

- All document retrieval endpoints are protected.
- Service/repository enforce ownership checks:
  - foreign document access -> `403`
  - missing document -> `404`
- Deletion is owner-only and includes both DB and storage cleanup.

## AI runtime (OpenAI-only)

AI generation is configured via:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `AI_PROVIDER_ATTEMPT_TIMEOUT_MS`

Logic:

1. The request is sent to OpenAI model from `OPENAI_MODEL`.
2. Attempt is bounded by `AI_PROVIDER_ATTEMPT_TIMEOUT_MS`.
3. On timeout/provider error, stage fails explicitly (no fallback provider chain).
