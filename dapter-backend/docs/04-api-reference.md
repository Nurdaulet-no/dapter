# 4. API Reference

Base URL (local): `http://localhost:3000`  
Swagger: `GET /docs`

Important behavior notes:

1. Backend is AI/documents-oriented and does not expose custom auth routes.
2. Documents routes require `Authorization: Bearer <pocketbase-user-token>`.
3. Flashcards are returned only when image generation stage for deck cards is complete.

---

## Health

### `GET /health`

Response:

```json
{ "status": "ok" }
```

## Documents (`/documents`)

All routes below require authenticated user.

### `GET /documents`

Returns current user documents sorted by `createdAt DESC`.

### `POST /documents/upload`

Request: `multipart/form-data`

Fields:
- `file` (required)

Success `200`:

```json
{
  "documentId": "ckxxxxxxxxxxxx",
  "status": "PROCESSING"
}
```

### `GET /documents/:id/status`

Returns full processing status and stage details.

Success `200` includes:
- `status`, `error`
- `notebookStatus`, `notebookError`
- `flashcardsStatus`, `flashcardsError`
- `quizzesStatus`, `quizzesError`
- `notes`, `flashcardDecks`, `quizzes` (only when relevant stage completed)

### `GET /documents/:id/flashcards`

Returns stage envelope + `flashcardDecks` after flashcards stage completion.

### `GET /documents/:id/quizzes`

Returns stage envelope + `quizzes` after quizzes stage completion.

### `GET /documents/:id/notes`

Returns stage envelope + `notes` after notebook stage completion.

### `POST /documents/:id/retry/:stage`

Stage retry trigger.

Allowed `stage` values:
- `notebook`
- `flashcards`
- `quizzes`

Behavior:
- async fire-and-forget retry
- returns immediately

### `DELETE /documents/:id/forever?target=notes|flashcards|quizzes`

Permanently deletes only one artifacts group for the selected document:
- `target=notes` -> deletes notes rows
- `target=flashcards` -> deletes flashcard decks + cards rows
- `target=quizzes` -> deletes quizzes + quiz questions rows

Response:

```json
{ "success": true }
```

Errors: `400`, `401`, `403`, `404`, `500`
