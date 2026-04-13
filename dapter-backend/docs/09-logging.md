# 9. Logging

The backend uses structured JSON logs (`src/config/logger.ts`):

- `ts`
- `level` (`INFO` / `DEBUG` / `ERROR`)
- `message`
- `context`

This makes filtering and root-cause analysis easier.

## Where to Find Logging Points

Complete map of all added logging points:

- [`../LOGGING_POINTS.md`](../LOGGING_POINTS.md)

## Key Events

- HTTP lifecycle:
  - `http.request.received`
  - `http.request.completed`
  - `http.request.failed`
- Pipeline:
  - `pipeline.upload_and_queue.started`
  - `pipeline.background_processing.triggered`
  - `pipeline.process_document.started`
  - `pipeline.stage.started`
  - `pipeline.stage.completed`
  - `pipeline.stage.finished`
  - `pipeline.stage.retry.failed`
  - `pipeline.process_document.completed`
  - `pipeline.process_document.failed`
  - `pipeline.status_lookup.started`
  - `pipeline.flashcards_lookup.started`
  - `pipeline.quizzes_lookup.started`
  - `pipeline.notes_lookup.started`
- AI runtime:
  - `ai.generation.started`
  - `ai.generation.failed`
  - `ai.provider.attempt.started`
  - `ai.provider.attempt.failed`
  - `ai.provider.attempt.completed`
