# Dapter Backend — API Documentation

**Base URL:** `http://localhost:3000`
**Swagger UI:** `http://localhost:3000/docs`

---

## Authentication

All `/documents/*` endpoints require a PocketBase user token:

```
Authorization: Bearer <pocketbase-user-token>
```

Auth (login/register) is handled directly by PocketBase at `http://localhost:8090`.

---

## Endpoints

### Health Check

#### `GET /health`

No auth required.

**Response `200`**
```json
{ "status": "ok" }
```

---

### Documents

#### `GET /documents/`

List all documents for the authenticated user.

**Response `200`**
```json
[
  {
    "documentId": "abc123",
    "fileName": "lecture.pdf",
    "mimeType": "application/pdf",
    "fileSize": 1048576,
    "status": "PROCESSING" | "COMPLETED" | "FAILED",
    "createdAt": "2026-04-19T12:00:00Z",
    "updatedAt": "2026-04-19T12:01:00Z"
  }
]
```

---

#### `POST /documents/upload`

Upload a PDF, PPTX, or TXT file. Triggers async AI processing (notes, flashcards, quizzes).

**Rate limit:** 8 uploads/min per user.

**Request** — `multipart/form-data`

| Field  | Type   | Required | Notes                          |
|--------|--------|----------|--------------------------------|
| `file` | `File` | Yes      | PDF, PPTX, or TXT; max 20 MB default |

**Allowed MIME types:**
- `application/pdf`
- `application/vnd.openxmlformats-officedocument.presentationml.presentation`

**Response `200`**
```json
{
  "documentId": "abc123",
  "status": "PROCESSING"
}
```

**Errors:**
- `400` — missing file, unsupported type, or exceeds size limit
- `429` — `{ "message": "Too many uploads. Please retry later." }`

---

#### `GET /documents/:id/status`

Poll the processing status of a document. Returns statuses only, no artifact data.

**Path params:** `id` — document ID

**Response `200`**
```json
{
  "documentId": "abc123",
  "status": "PROCESSING" | "COMPLETED" | "FAILED",
  "error": "..."
}
```

> `error` appears only on failure.

**Errors:**
- `403` — document belongs to another user
- `404` — document not found

---

#### `GET /documents/:id/notes`

Retrieve notes for a document.

**Path params:** `id` — document ID

**Response `200`**
```json
{
  "documentId": "abc123",
  "status": "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED",
  "error": "...",
  "notes": [
    {
      "id": "note1",
      "title": "Chapter 1",
      "content": "Markdown content..."
    }
  ]
}
```

---

#### `GET /documents/:id/flashcards`

Retrieve flashcard decks for a document.

**Path params:** `id` — document ID

**Response `200`**
```json
{
  "documentId": "abc123",
  "status": "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED",
  "error": "...",
  "flashcardDecks": [
    {
      "id": "deck1",
      "title": "Key Concepts",
      "description": "...",
      "cards": [
        {
          "id": "card1",
          "front": "What is X?",
          "back": "X is...",
          "imageUrls": ["https://..."],
          "tags": ["chapter1"]
        }
      ]
    }
  ]
}
```

---

#### `GET /documents/:id/quizzes`

Retrieve quizzes for a document.

**Path params:** `id` — document ID

**Response `200`**
```json
{
  "documentId": "abc123",
  "status": "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED",
  "error": "...",
  "quizzes": [
    {
      "id": "quiz1",
      "title": "Chapter 1 Quiz",
      "description": "...",
      "questions": [
        {
          "id": "q1",
          "question": "What is X?",
          "options": ["A", "B", "C", "D"],
          "correctIndex": 0,
          "explanation": "Because...",
          "tags": ["chapter1"],
          "imageUrls": ["https://..."]
        }
      ]
    }
  ]
}
```

---

#### `POST /documents/:id/retry/:stage`

Retry a failed processing stage.

**Path params:**

| Param   | Values                                  |
|---------|-----------------------------------------|
| `id`    | Document ID                             |
| `stage` | `notebook` \| `flashcards` \| `quizzes` |

**Request body:** none

**Response `200`**
```json
{
  "documentId": "abc123",
  "status": "PROCESSING"
}
```

**Errors:**
- `400` — `{ "message": "Invalid stage. Allowed: notebook, flashcards, quizzes" }`

---

#### `DELETE /documents/:id/forever`

Permanently delete a specific artifact type from a document.

**Path params:** `id` — document ID

**Query params:**

| Param    | Required | Values                                |
|----------|----------|---------------------------------------|
| `target` | Yes      | `notes` \| `flashcards` \| `quizzes` |

**Example:** `DELETE /documents/abc123/forever?target=flashcards`

**Response `200`**
```json
{ "success": true }
```

**Errors:**
- `400` — `{ "message": "Invalid target. Allowed: notes, flashcards, quizzes" }`

---

## Common Error Responses

All endpoints may return:

| Status | Meaning              | Body                                  |
|--------|----------------------|---------------------------------------|
| `401`  | Unauthorized         | `{ "message": "Unauthorized" }`       |
| `403`  | Forbidden            | `{ "message": "..." }`               |
| `404`  | Not found            | `{ "message": "..." }`               |
| `500`  | Internal server error| `{ "message": "..." }`               |

---

## Typical Frontend Flow

1. **Auth** — register/login via PocketBase SDK, obtain token.
2. **Upload** — `POST /documents/upload` with the file.
3. **Poll** — `GET /documents/:id/status` until `status` is `COMPLETED` or `FAILED`.
4. **Display** — use `/notes`, `/flashcards`, `/quizzes` endpoints to fetch specific artifacts.
5. **Retry** — if a stage failed, `POST /documents/:id/retry/:stage`.
6. **Delete** — `DELETE /documents/:id/forever?target=...` to remove an artifact.
