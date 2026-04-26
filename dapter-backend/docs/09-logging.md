# 9. Logging

`src/config/logger.ts` writes one JSON object per `console.log` line with shape:

```json
{
  "ts": "2026-04-26T12:00:00.000Z",
  "level": "INFO" | "DEBUG" | "ERROR",
  "message": "<event-name>",
  "context": { ... }
}
```

`logger.error` runs `error`-typed context values through a serializer so `Error` instances are logged as `{ name, message, stack }`.

## Event catalog

### HTTP lifecycle (`src/index.ts`)
- `http.request.received` — `requestId`, `ip`, `method`, `path`.
- `http.request.completed` — `method`, `path`, `status`.
- `http.request.failed` — `code`, `status`, `error`.
- `server.started` — `port`.

### Flashcards pipeline (`src/services/flashcards.service.ts`)
- `flashcards.upload_and_queue.started`
- `flashcards.row.created`
- `flashcards.pipeline.completed`
- `flashcards.pipeline.failed`
- `flashcards.pipeline.unhandled`
- `flashcards.pipeline.retry.unhandled`
- `flashcards.upload.queued` *(controller)*
- `flashcards.images.started`
- `flashcards.images.completed`
- `flashcards.images.card.failed`
- `flashcards.images.background.failed`

### Quizzes pipeline (`src/services/quizzes.service.ts`)
- `quizzes.upload_and_queue.started`
- `quizzes.row.created`
- `quizzes.pipeline.completed`
- `quizzes.pipeline.failed`
- `quizzes.pipeline.unhandled`
- `quizzes.pipeline.retry.unhandled`
- `quizzes.upload.queued` *(controller)*

### Pipeline helpers (`src/services/pipeline-helpers.ts`)
- `pipeline.source.downloaded`
- `pipeline.stage.started`
- `pipeline.stage.finished`

### Extraction (`src/services/extraction.service.ts`)
- `extraction.started`
- `extraction.pdf.completed`
- `extraction.pptx.detected`
- `extraction.pptx.slides.discovered`
- `extraction.pptx.slide.read_failed`
- `extraction.pptx.completed`
- `extraction.text.completed`
- `extraction.unsupported_mime_type`

### AI service (`src/services/ai.service.ts`)
- `ai.flashcards.generation.started`
- `ai.quizzes.generation.started`

### xAI provider (`src/services/providers/xai.provider.ts`)
- `ai.provider.attempt.started`
- `ai.provider.attempt.completed`
- `ai.provider.attempt.failed`
- `ai.image.generated`
- `ai.image.failed`

### Storage (`src/services/storage.service.ts`)
- `storage.upload.started`
- `storage.upload.completed`
- `storage.download.started`
- `storage.download.completed`
- `storage.download.failed`
- `storage.delete.started`
- `storage.delete.completed`
- `storage.delete.object_missing`

## Useful filters

- One request: filter by `context.requestId`.
- One row's full lifecycle: filter by `context.id` (matches `flashcards.*`, `quizzes.*`, `pipeline.stage.*`).
- AI calls: filter `message` starting with `ai.`.
- Extraction issues: filter `message` starting with `extraction.`.
