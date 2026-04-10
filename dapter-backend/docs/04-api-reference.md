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

Purpose: delete current user's document and related entities.

Success:

```json
{ "success": true }
```

Behavior:
- removes source object from S3-compatible storage
- removes `Document` row from DB
- related artifacts (`notes`, `flashcards`, `quizzes`) are deleted by cascade

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
