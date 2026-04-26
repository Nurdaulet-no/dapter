# 4. API Reference

Base URL (local): `http://localhost:3000`
Swagger UI: `GET /docs`

Behavior:

1. The backend exposes no auth routes. Login/refresh is handled directly against PocketBase.
2. Every route except `/health` requires `Authorization: Bearer <pocketbase-user-token>`.
3. There is **no** `/documents` surface. Flashcards and quizzes are independent, parallel resources. A given upload targets exactly one of them.

---

## `GET /health`

Public.

```json
{ "status": "ok" }
```

---

## Flashcards (`/flashcards`)

Schemas: `src/schemas/flashcards.schema.ts`.

### `GET /flashcards/`
List the caller's rows, newest first.

Response (200) — `flashcardsListResponseSchema`:
```json
[
  {
    "id": "abcd1234",
    "title": "...",
    "description": "...",
    "status": "PROCESSING" | "COMPLETED" | "FAILED",
    "error": "...",
    "cardCount": 72,
    "createdAt": "2026-04-26T12:00:00.000Z",
    "updatedAt": "2026-04-26T12:01:30.000Z"
  }
]
```
`description` and `error` are optional.

### `POST /flashcards/`
Multipart `files` field (single `File` or `Files[]`). 1–5 files per call. Allowed MIMEs:

- `application/pdf`
- `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- `text/plain`
- `text/markdown`

Per-file size cap is `MAX_UPLOAD_SIZE_BYTES`. Rate limit: 8 uploads/min/user (shared with `POST /quizzes/`).

Response (200) — `createFlashcardsResponseSchema`:
```json
{ "id": "abcd1234", "status": "PROCESSING" }
```

Errors: `400` (no files / >5 / bad MIME / oversized), `401`, `429`, `500`.

### `GET /flashcards/:id`
Full row with cards. Response (200) — `flashcardsDetailResponseSchema`:
```json
{
  "id": "abcd1234",
  "title": "...",
  "description": "...",
  "status": "COMPLETED",
  "error": "...",
  "cardCount": 72,
  "createdAt": "...",
  "updatedAt": "...",
  "cards": [
    {
      "id": "card-...",
      "front": "...",
      "back": "...",
      "imageUrls": ["https://..."],
      "tags": ["..."]
    }
  ]
}
```
`imageUrls` and `tags` are omitted on a card when empty. Errors: `401`, `403`, `404`, `500`.

### `GET /flashcards/:id/status`
Lightweight poll. Response (200) — `flashcardsStatusResponseSchema`:
```json
{ "id": "abcd1234", "status": "PROCESSING", "error": "..." }
```
`error` only present on `FAILED`.

### `POST /flashcards/:id/retry`
Marks the row `PROCESSING` again, clears `error`, re-runs the pipeline against the existing `docs[]`. Response (200): same as create. Errors: `401`, `403`, `404`, `500`.

### `DELETE /flashcards/:id`
Response (200): `{ "success": true }`. Errors: `401`, `403`, `404`, `500`. The referenced `storage_files` rows are NOT cascade-deleted.

---

## Quizzes (`/quizzes`)

Schemas: `src/schemas/quizzes.schema.ts`. Contracts mirror flashcards exactly with `questions`/`questionCount` instead of `cards`/`cardCount`.

### `GET /quizzes/`
Response (200) — `quizListResponseSchema`:
```json
[
  {
    "id": "wxyz9876",
    "title": "...",
    "description": "...",
    "status": "COMPLETED",
    "error": "...",
    "questionCount": 60,
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

### `POST /quizzes/`
Same multipart contract as flashcards. Returns `{ id, status: "PROCESSING" }` (`createQuizResponseSchema`).

### `GET /quizzes/:id`
Response (200) — `quizDetailResponseSchema`:
```json
{
  "id": "wxyz9876",
  "title": "...",
  "description": "...",
  "status": "COMPLETED",
  "error": "...",
  "questionCount": 60,
  "createdAt": "...",
  "updatedAt": "...",
  "questions": [
    {
      "id": "q-...",
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "explanation": "...",
      "tags": ["..."],
      "imageUrls": ["..."]
    }
  ]
}
```
`tags`, `imageUrls`, `explanation` are optional. `correctIndex` is zero-based into `options`. The schema enforces ≥4 options.

### `GET /quizzes/:id/status`
Response (200) — `quizStatusResponseSchema`:
```json
{ "id": "wxyz9876", "status": "PROCESSING", "error": "..." }
```

### `POST /quizzes/:id/retry`
Same semantics as the flashcards retry. Response: `{ id, status: "PROCESSING" }`.

### `DELETE /quizzes/:id`
`{ "success": true }`. `storage_files` rows are not cascade-deleted.

---

## Errors

Domain errors (raised via `AppError` in services) are normalized to:
```json
{ "message": "..." }
```

The Elysia global handler also wraps unknown routes and uncaught exceptions:
```json
{
  "error": {
    "code": "ROUTE_NOT_FOUND" | "INTERNAL_SERVER_ERROR",
    "message": "...",
    "statusCode": 404
  }
}
```

Status codes used by services: `400` (validation), `401` (no/invalid token), `403` (foreign owner), `404` (not found), `429` (upload rate limit), `500` (unexpected).
