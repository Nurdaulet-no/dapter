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
  - `pipeline.process_document.started`
  - `pipeline.process_document.completed`
  - `pipeline.process_document.failed`
- AI failover:
  - `ai.failover.attempt.started`
  - `ai.failover.attempt.failed`
  - `ai.failover.attempt.completed`
