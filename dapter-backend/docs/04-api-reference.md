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

Returns current user non-deleted documents sorted by `createdAt DESC`.

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

`flashcardDecks` shape:

```json
[
  {
    "id": "deck_1",
    "title": "Core Concepts",
    "description": "optional",
    "cards": [
      {
        "id": "card_1",
        "front": "Question/term",
        "back": "Answer/definition",
        "imageUrls": ["https://..."],
        "tags": ["optional"]
      }
    ]
  }
]
```

`quizzes` shape:

```json
[
  {
    "id": "quiz_1",
    "title": "Quiz title",
    "description": "optional",
    "questions": [
      {
        "id": "q_1",
        "question": "Question text",
        "options": ["A", "B", "C"],
        "correctIndex": 1,
        "explanation": "optional",
        "tags": ["optional"],
        "imageUrls": ["https://..."]
      }
    ]
  }
]
```

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

### `DELETE /documents/:id`

Soft delete (move to trash).

### `GET /documents/trash`

Returns current user trashed documents (`deletedAt != null`).

### `POST /documents/:id/restore`

Restores trashed document.

### `DELETE /documents/:id/forever`

Permanent delete:
- remove object from storage
- remove DB row
