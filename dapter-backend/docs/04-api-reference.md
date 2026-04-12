# 4. API Reference

Base URL (local): `http://localhost:3000`

Swagger: `GET /docs`

## Health

### `GET /health`

Response:

```json
{"status":"ok"}
```

## Authentication

### `POST /auth/register`

Body:

```json
{
  "email": "user@example.com",
  "password": "StrongPass123"
}
```

Success: `201`

```json
{
  "user": { "id": "cm...", "email": "user@example.com" },
  "tokens": { "accessToken": "...", "refreshToken": "..." }
}
```

Errors:
- `409` duplicate email
- `400` validation failure
- `429` rate limit

---

### `POST /auth/login`

Body:

```json
{
  "email": "user@example.com",
  "password": "StrongPass123"
}
```

Success: `200` (same response shape as register)

Errors:
- `401` invalid credentials
- `429` rate limit

---

### `POST /auth/refresh`

Body:

```json
{
  "refreshToken": "..."
}
```

Success: `200` (new rotated access/refresh pair)

Errors:
- `401` invalid/expired/revoked refresh token

---

### `POST /auth/logout`

Body:

```json
{
  "refreshToken": "..."
}
```

Success:

```json
{ "success": true }
```

---

### `GET /auth/google`

Starts OAuth2 authorization flow, returns redirect (`302`) to Google.

### `GET /auth/google/callback`

Handles OAuth callback and returns auth payload:

```json
{
  "user": { "id": "cm...", "email": "google-user@example.com" },
  "tokens": { "accessToken": "...", "refreshToken": "..." }
}
```

## Documents

All `/documents/*` routes require:

```http
Authorization: Bearer <access-token>
```

### `GET /documents`

Purpose: return current user's documents ordered by creation date (desc).

Response:

```json
[
  {
    "documentId": "cm...",
    "fileName": "Smart Gym Membership.pdf",
    "mimeType": "application/pdf",
    "fileSize": 103189,
    "status": "COMPLETED",
    "createdAt": "2026-04-10T18:40:15.745Z",
    "updatedAt": "2026-04-10T18:40:38.771Z"
  }
]
```

### `POST /documents/upload`

Purpose: upload PDF/PPTX, register the document, and start background processing.

Request: `multipart/form-data`
- field: `file`
- optional field: `selectedStartPage` (number >= 1)
- optional field: `selectedEndPage` (number >= 1)

Validation rules:
- when both are provided, `selectedStartPage <= selectedEndPage`
- selected range cannot exceed `MAX_SELECTED_PAGES`

Success response:

```json
{
  "documentId": "ckxxxxxxxxxxxx",
  "status": "PROCESSING"
}
```

Error responses:
- `400` — invalid MIME, invalid size, or missing file
- `401` — unauthorized
- `429` — upload rate limit exceeded
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

Error responses:
- `401` — unauthorized
- `403` — document belongs to another user
- `404` — document not found

---

### `GET /documents/:id/flashcards`

Purpose: return only flashcards for a document.

Response fields:
- `documentId`
- `status`
- `error` (optional)
- `flashcards` (only when `COMPLETED`)

Error responses:
- `401`, `403`, `404`

---

### `POST /documents/:id/flashcards/:flashcardId/image/request`

Purpose: queue lazy image generation for one flashcard.

Behavior:
- requires ownership of document
- only visual-eligible cards can be queued (`visualNeedScore >= 0.6`)
- transitions `imageStatus` to `queued` when allowed

Success response:

```json
{
  "documentId": "cm...",
  "flashcard": {
    "id": "cm...",
    "imageStatus": "queued",
    "imagePrompt": "optional prompt",
    "visualNeedScore": 0.78
  }
}
```

Error responses:
- `401` unauthorized
- `403` forbidden (foreign document)
- `404` document/flashcard not found
- `409` visual image is not required for this flashcard

---

### `GET /documents/:id/quizzes`

Purpose: return only quizzes for a document.

Response fields:
- `documentId`
- `status`
- `error` (optional)
- `quizzes` (only when `COMPLETED`)

Error responses:
- `401`, `403`, `404`

---

### `GET /documents/:id/notes`

Purpose: return only notes for a document.

Response fields:
- `documentId`
- `status`
- `error` (optional)
- `notes` (only when `COMPLETED`)

Error responses:
- `401`, `403`, `404`

---

### `DELETE /documents/:id`

Purpose: move current user's document to trash (soft-delete).

Success:

```json
{ "success": true }
```

---

### `GET /documents/trash`

Purpose: return current user's trashed documents.

---

### `POST /documents/:id/restore`

Purpose: restore document from trash.

Success:

```json
{ "success": true }
```

---

### `DELETE /documents/:id/forever`

Purpose: permanently delete a trashed document and its storage object.

Success:

```json
{ "success": true }
```

Error responses:
- `401` unauthorized
- `403` forbidden (foreign document)
- `404` not found

## Common error format

```json
{
  "message": "Human-readable error message"
}
```
