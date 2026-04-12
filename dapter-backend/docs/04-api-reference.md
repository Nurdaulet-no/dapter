# 4. API Reference

Base URL (local): `http://localhost:3000`  
Swagger: `GET /docs`

Important behavior notes:

1. Auth routes mostly rely on **HttpOnly cookies** for session continuity.
2. Documents routes accept either:
   - `Authorization: Bearer <access-token>`, or
   - access cookie (`dapter_access_token`).
3. Error payloads are mostly `{ "message": "..." }` on controller-level errors.

---

## Health

### `GET /health`

Response:

```json
{ "status": "ok" }
```

---

## Authentication (`/auth`)

### `POST /auth/register`

Body:

```json
{
  "email": "user@example.com",
  "password": "StrongPass123"
}
```

Behavior:
- rate limit by IP (10 requests / 15 min shared with login)
- creates user
- generates random unique nickname (7 lowercase letters)
- issues access/refresh tokens
- sets auth cookies

Success `201`:

```json
{
  "user": {
    "id": "cm...",
    "email": "user@example.com",
    "nickname": "abcdeff"
  },
  "authenticated": true
}
```

Errors: `400`, `409`, `429`

### `POST /auth/login`

Body:

```json
{
  "email": "user@example.com",
  "password": "StrongPass123"
}
```

Behavior:
- same rate limit bucket as register
- verifies password hash
- sets auth cookies

Success `200`:

```json
{
  "user": {
    "id": "cm...",
    "email": "user@example.com",
    "nickname": "abcdeff"
  },
  "authenticated": true
}
```

Errors: `401`, `429`

### `POST /auth/refresh`

Body (optional):

```json
{
  "refreshToken": "..."
}
```

Behavior:
- refresh token is read from body or `dapter_refresh_token` cookie
- rotates refresh token/session hash
- sets new auth cookies

Success `200`:

```json
{
  "user": {
    "id": "cm...",
    "email": "user@example.com",
    "nickname": "abcdeff"
  },
  "authenticated": true
}
```

Errors: `401`

### `POST /auth/logout`

Body (optional):

```json
{
  "refreshToken": "..."
}
```

Behavior:
- revoke refresh session when token provided
- clear auth cookies

Success `200`:

```json
{ "success": true }
```

Errors: `400`

### `GET /auth/me`

Behavior:
- reads access token from cookie
- verifies user

Success `200`:

```json
{
  "user": {
    "id": "cm...",
    "email": "user@example.com",
    "nickname": "abcdeff"
  },
  "authenticated": true
}
```

Errors: `401`

### `PATCH /auth/me/nickname`

Body:

```json
{
  "nickname": "newname"
}
```

Rules:
- normalized to lowercase
- regex: `^[a-z0-9]{1,7}$`
- must be unique

Success `200`:

```json
{
  "user": {
    "id": "cm...",
    "email": "user@example.com",
    "nickname": "newname"
  },
  "authenticated": true
}
```

Errors: `400`, `401`, `409`

### `GET /auth/google`

Behavior:
- creates oauth state + PKCE verifier
- responds with `302` redirect to Google

### `GET /auth/google/callback`

Query:
- `code`
- `state`

Behavior:
- validates oauth state/verifier
- upserts Google user
- sets auth cookies
- redirects `302` to frontend `/u/:nickname`
- on failure redirects `302` to `/login?error=google_oauth_failed`

---

## Documents (`/documents`)

All routes below require authenticated user.

### `GET /documents`

Returns current user non-deleted documents sorted by `createdAt DESC`.

Success `200`:

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

Errors: `401`, `500`

### `POST /documents/upload`

Request: `multipart/form-data`

Fields:
- `file` (required)
- `selectedStartPage` (optional numeric, >= 1)
- `selectedEndPage` (optional numeric, >= 1)
- `selectedPages` (optional CSV string, e.g. `"1,3,8,9"`)

Validation:
- MIME only:
  - `application/pdf`
  - `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- size <= `MAX_UPLOAD_SIZE_BYTES`
- if both range bounds are set: `selectedStartPage <= selectedEndPage`
- selected range length <= `MAX_SELECTED_PAGES` (when CSV not provided)
- selectedPages parsed as int >= 1, deduplicated, sorted
- selectedPages count <= `MAX_SELECTED_PAGES`
- upload rate limit: 8 per minute per user/IP key

Success `200`:

```json
{
  "documentId": "ckxxxxxxxxxxxx",
  "status": "PROCESSING"
}
```

Errors: `400`, `401`, `429`, `500`

### `GET /documents/:id/status`

Returns full processing status and stage details.

Success `200` includes:
- `status`, `error`
- `notebookStatus`, `notebookError`
- `flashcardsStatus`, `flashcardsError`
- `flashcardsEnrichmentStatus`, `flashcardsEnrichmentError`
- `quizzesStatus`, `quizzesError`
- `notes`, `flashcards`, `quizzes` (only when relevant stage completed)

Errors: `401`, `403`, `404`, `500`

### `GET /documents/:id/flashcards`

Flashcards-specific payload with all stage status fields.

Errors: `401`, `403`, `404`, `500`

### `GET /documents/:id/quizzes`

Quizzes-specific payload with all stage status fields.

Errors: `401`, `403`, `404`, `500`

### `GET /documents/:id/notes`

Notes-specific payload with all stage status fields.

Errors: `401`, `403`, `404`, `500`

### `POST /documents/:id/flashcards/:flashcardId/image/request`

Queues image generation for one flashcard.

Rules:
- must own document
- flashcard must exist
- `visualNeedScore >= 0.6` required
- allowed transitions to queued from:
  - `null`
  - `not_requested`
  - `failed`

Success `200`:

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

Errors: `401`, `403`, `404`, `409`, `500`

### `POST /documents/:id/retry/:stage`

Stage retry trigger.

Allowed `stage` values:
- `notebook`
- `flashcards`
- `quizzes`

Behavior:
- async fire-and-forget retry
- returns immediately

Success `200`:

```json
{
  "documentId": "cm...",
  "status": "PROCESSING"
}
```

Errors: `400`, `401`, `403`, `404`, `500`

### `DELETE /documents/:id`

Soft delete (move to trash).

Success `200`:

```json
{ "success": true }
```

Errors: `401`, `403`, `404`, `409`, `500`

### `GET /documents/trash`

Returns current user trashed documents (`deletedAt != null`).

Errors: `401`, `500`

### `POST /documents/:id/restore`

Restores trashed document.

Success `200`:

```json
{ "success": true }
```

Errors: `401`, `403`, `404`, `409`, `500`

### `DELETE /documents/:id/forever`

Permanent delete:
- remove object from storage
- remove DB row

Success `200`:

```json
{ "success": true }
```

Errors: `401`, `403`, `404`, `500`
