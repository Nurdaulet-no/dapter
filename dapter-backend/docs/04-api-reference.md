# 4. API Reference

Base URL (local): `http://localhost:3000`

Swagger: `GET /docs`

## Health

### `GET /health`

Response:

```json
{"status":"ok"}
```

## Documents

### `POST /documents/upload`

Purpose: upload PDF/PPTX, register the document, and start background processing.

Request: `multipart/form-data`
- field: `file`

Success response:

```json
{
  "documentId": "ckxxxxxxxxxxxx",
  "status": "PROCESSING"
}
```

Error responses:
- `400` — invalid MIME, invalid size, or missing file
- `500` — internal server error

---

### `GET /documents/:id/status`

Purpose: full document status + all artifacts (when `COMPLETED`).

Response fields:
- `documentId`
- `status`: `PROCESSING | COMPLETED | FAILED`
- `error` (optional)
- `notes` (optional)
- `flashcards` (optional)
- `quizzes` (optional)

---

### `GET /documents/:id/flashcards`

Purpose: return only flashcards for a document.

Response fields:
- `documentId`
- `status`
- `error` (optional)
- `flashcards` (only when `COMPLETED`)

---

### `GET /documents/:id/quizzes`

Purpose: return only quizzes for a document.

Response fields:
- `documentId`
- `status`
- `error` (optional)
- `quizzes` (only when `COMPLETED`)

---

### `GET /documents/:id/notes`

Purpose: return only notes for a document.

Response fields:
- `documentId`
- `status`
- `error` (optional)
- `notes` (only when `COMPLETED`)

## Common error format

```json
{
  "message": "Human-readable error message"
}
```
