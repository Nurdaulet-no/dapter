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
- Auth:
  - `auth.register.failed`
  - `auth.login.failed`
  - `auth.refresh.failed`
  - `auth.logout.failed`
  - `auth.google.callback.failed`
- Pipeline:
  - `pipeline.upload_and_queue.started`
  - `pipeline.process_document.started`
  - `pipeline.stage.completed`
  - `pipeline.process_document.completed`
  - `pipeline.process_document.failed`
  - `pipeline.flashcard_image.request.queued`
  - `pipeline.flashcard_image.batch.started`
  - `pipeline.flashcard_image.queue.completed`
  - `pipeline.flashcard_image.process_failed`
- AI failover:
  - `ai.failover.attempt.started`
  - `ai.failover.attempt.failed`
  - `ai.failover.attempt.completed`
- Background jobs:
  - `documents.trash.cleanup.started`
  - `documents.trash.cleanup.completed`
  - `documents.trash.cleanup.run_failed`
  - `pipeline.flashcard_image.queue.completed`
  - `pipeline.flashcard_image.queue.run_failed`
