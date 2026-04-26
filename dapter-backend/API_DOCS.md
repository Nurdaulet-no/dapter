# Dapter Backend — API Documentation

**Base URL:** `http://localhost:3000`
**Swagger UI:** `http://localhost:3000/docs`

---

## Authentication

All non-health endpoints require a PocketBase user token:

```
Authorization: Bearer <pocketbase-user-token>
```

Login/register is handled directly against the PocketBase instance (default `http://localhost:8090`). The backend exposes no auth routes; it only validates the token via `users.authRefresh`.

---

## Health

### `GET /health`

No auth.

```json
{ "status": "ok" }
```

---

## Flashcards (`/flashcards`)

A flashcards row is one independent deck generated from 1–5 source files. Cards live inside the row's `content` JSON.

### `GET /flashcards/`

List the caller's flashcards rows (newest first).

**Response 200**
```json
[
  {
    "id": "abcd1234",
    "title": "Calculus I — Derivatives",
    "description": "Definitions, rules, and worked examples.",
    "status": "COMPLETED",
    "cardCount": 72,
    "createdAt": "2026-04-26T12:00:00.000Z",
    "updatedAt": "2026-04-26T12:01:30.000Z"
  }
]
```

`description` and `error` are optional. `status` is `PROCESSING | COMPLETED | FAILED`.

### `POST /flashcards/`

Upload 1–5 files and start a flashcards generation pipeline.

**Rate limit:** 8 uploads/min per user (single bucket shared with `POST /quizzes/` and `POST /notes/`).
**Request:** `multipart/form-data` with field `files` (single file or array). Allowed MIME types: `application/pdf`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `text/plain`, `text/markdown`. Per-file size cap = `MAX_UPLOAD_SIZE_BYTES`.

**Response 200**
```json
{ "id": "abcd1234", "status": "PROCESSING" }
```

**Errors**
- `400` — no files / >5 files / bad MIME / oversized file
- `401` — missing or invalid bearer token
- `429` — rate limit
- `500` — unexpected upload failure

### `GET /flashcards/:id`

Full row including all cards.

**Response 200**
```json
{
  "id": "abcd1234",
  "title": "Calculus I — Derivatives",
  "description": "...",
  "status": "COMPLETED",
  "cardCount": 72,
  "createdAt": "...",
  "updatedAt": "...",
  "cards": [
    {
      "id": "card-derivative-defn",
      "front": "Define the derivative of $f$ at $x_0$.",
      "back": "$f'(x_0) = \\lim_{h\\to 0} \\frac{f(x_0+h)-f(x_0)}{h}$ when the limit exists.",
      "imageUrls": ["https://.../abcd-card-derivative-defn.png"],
      "tags": ["calculus", "derivative"]
    }
  ]
}
```

`imageUrls` is omitted for cards whose image hasn't landed yet (image-gen runs after the deck content is persisted, so a row may be `COMPLETED` while images are still streaming in). `tags` is omitted when empty.

**Errors:** `401`, `403` (foreign owner), `404`, `500`.

### `GET /flashcards/:id/status`

Lightweight poll endpoint.

**Response 200**
```json
{ "id": "abcd1234", "status": "PROCESSING" }
```

`error` is included only on `FAILED`.

### `POST /flashcards/:id/retry`

Re-run the pipeline against the existing `docs[]` (no re-upload). Flips status back to `PROCESSING` and returns immediately.

**Response 200**
```json
{ "id": "abcd1234", "status": "PROCESSING" }
```

### `DELETE /flashcards/:id`

Deletes the flashcards row. The underlying `storage_files` are **not** cascade-deleted.

**Response 200**
```json
{ "success": true }
```

---

## Quizzes (`/quizzes`)

Mirrors the flashcards surface exactly. Each quiz row is one independent quiz generated from 1–5 source files; questions live inside the row's `content` JSON.

### `GET /quizzes/`

```json
[
  {
    "id": "wxyz9876",
    "title": "Linear Algebra Midterm Prep",
    "description": "...",
    "status": "COMPLETED",
    "questionCount": 60,
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

### `POST /quizzes/`

Same multipart contract as flashcards (`files` field, 1–5 files, allowed MIMEs). Returns `{ id, status: "PROCESSING" }`.

### `GET /quizzes/:id`

```json
{
  "id": "wxyz9876",
  "title": "Linear Algebra Midterm Prep",
  "description": "...",
  "status": "COMPLETED",
  "questionCount": 60,
  "createdAt": "...",
  "updatedAt": "...",
  "questions": [
    {
      "id": "q-eigenvalue-defn",
      "question": "Which condition characterizes an eigenvalue $\\lambda$ of $A$?",
      "options": [
        "$\\det(A - \\lambda I) = 0$",
        "$\\det(A) = \\lambda$",
        "$A\\lambda = 0$",
        "$A^{-1}\\lambda = I$"
      ],
      "correctIndex": 0,
      "explanation": "An eigenvalue makes $A - \\lambda I$ singular, so its determinant is zero...",
      "tags": ["linear-algebra", "eigenvalue"]
    }
  ]
}
```

`options` always has at least 4 entries (LLM is constrained to exactly 4 unless the source truly demands more, capped by the schema). `correctIndex` is zero-based. Quiz questions don't currently have images persisted on the row (the LLM emits `imagePrompt`, but no image-gen sub-pipeline runs for quizzes today); when the response includes `imageUrls`, it'll be an array of strings.

### `GET /quizzes/:id/status`, `POST /quizzes/:id/retry`, `DELETE /quizzes/:id`

Identical contracts to the flashcards equivalents.

---

## Notes (`/notes`)

Mirrors the flashcards and quizzes surfaces. Each notes row is one Markdown study guide generated from 1–5 source files. The full guide lives as a single Markdown string inside the row's `content.markdown` JSON field.

### `GET /notes/`

List the caller's notes rows (newest first).

**Response 200**
```json
[
  {
    "id": "note1234",
    "title": "Calculus I — Derivatives",
    "description": "Definitions, rules, and worked examples.",
    "status": "COMPLETED",
    "wordCount": 4321,
    "createdAt": "2026-04-26T12:00:00.000Z",
    "updatedAt": "2026-04-26T12:01:30.000Z"
  }
]
```

`description` and `error` are optional. `status` is `PROCESSING | COMPLETED | FAILED`. `wordCount` is computed server-side from the persisted Markdown (0 while still `PROCESSING`).

### `POST /notes/`

Upload 1–5 files and start a notes generation pipeline.

**Rate limit:** 8 uploads/min per user (single bucket shared with `POST /flashcards/` and `POST /quizzes/`).
**Request:** `multipart/form-data` with field `files` (single file or array). Allowed MIME types: `application/pdf`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `text/plain`, `text/markdown`. Per-file size cap = `MAX_UPLOAD_SIZE_BYTES`.

**Response 200**
```json
{ "id": "note1234", "status": "PROCESSING" }
```

**Errors**
- `400` — no files / >5 files / bad MIME / oversized file
- `401` — missing or invalid bearer token
- `429` — rate limit
- `500` — unexpected upload failure

### `GET /notes/:id`

Full row including the Markdown body.

**Response 200**
```json
{
  "id": "note1234",
  "title": "Calculus I — Derivatives",
  "description": "Definitions, rules, and worked examples.",
  "status": "COMPLETED",
  "wordCount": 4321,
  "createdAt": "...",
  "updatedAt": "...",
  "markdown": "# Calculus I — Derivatives\n\n## Definition\n\nThe **derivative** of $f$ at $x_0$ is $f'(x_0) = \\lim_{h \\to 0} \\frac{f(x_0+h) - f(x_0)}{h}$ ...\n\n> **Worked example:** Differentiate $f(x) = x^2$ from first principles..."
}
```

`description` and `error` are optional. The Markdown body uses H1/H2/H3 headings, **bold** key terms, fenced code blocks, `$...$` inline LaTeX and `$$...$$` display math, GFM tables, and blockquote callouts (`> **Worked example:** ...`, `> **Common pitfall:** ...`, `> **Intuition:** ...`). Volume target is ≥1500 words, typically 3000–6000+.

**Errors:** `401`, `403` (foreign owner), `404`, `500`.

### `GET /notes/:id/status`

Lightweight poll endpoint.

**Response 200**
```json
{ "id": "note1234", "status": "PROCESSING" }
```

`error` is included only on `FAILED`.

### `POST /notes/:id/retry`

Re-run the pipeline against the existing `docs[]` (no re-upload). Flips status back to `PROCESSING` and returns immediately.

**Response 200**
```json
{ "id": "note1234", "status": "PROCESSING" }
```

### `DELETE /notes/:id`

Deletes the notes row. The underlying `storage_files` are **not** cascade-deleted.

**Response 200**
```json
{ "success": true }
```

---

## Common error envelope

All non-2xx responses follow:

```json
{ "message": "..." }
```

The Elysia error handler also wraps unknown routes and uncaught errors in:

```json
{
  "error": {
    "code": "ROUTE_NOT_FOUND" | "INTERNAL_SERVER_ERROR",
    "message": "...",
    "statusCode": 404
  }
}
```

---

## Typical client flow

1. Authenticate via PocketBase SDK; obtain a user token.
2. `POST /flashcards/`, `POST /quizzes/`, **or** `POST /notes/` (the user picks one path) with the chosen files.
3. Poll `GET /:resource/:id/status` until `status` is `COMPLETED` or `FAILED`.
4. Fetch `GET /:resource/:id` to render. For flashcards, `imageUrls` may keep populating after `COMPLETED` as the image workers finish; re-fetch or poll the detail endpoint to pick up new URLs.
5. On `FAILED`, optionally `POST /:resource/:id/retry`.
6. `DELETE /:resource/:id` to remove a row.
