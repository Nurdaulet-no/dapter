# 5. Data Model (Prisma/PostgreSQL)

Source of truth: `prisma/schema.prisma`.

---

## Enums

### `DocumentStatus`
- `PROCESSING`
- `COMPLETED`
- `FAILED`

### `ArtifactStageStatus`
- `PENDING`
- `PROCESSING`
- `COMPLETED`
- `FAILED`

### `DocumentType`
- `PDF`
- `PPTX`

---

## Tables / Models

## `User`

Columns:
- `id` (cuid, PK)
- `email` (unique)
- `nickname` (unique, `varchar(7)`)
- `passwordHash` (nullable)
- `googleId` (nullable, unique)
- `createdAt`
- `updatedAt`

Relations:
- `documents` (1:N)
- `sessions` (1:N)

## `Session`

Columns:
- `id` (cuid, PK)
- `userId` (FK -> `User.id`)
- `refreshTokenHash`
- `refreshTokenVersion` (default `0`)
- `expiresAt`
- `createdAt`
- `updatedAt`

Indexes:
- `Session_userId_idx`
- `Session_expiresAt_idx`

## `Document`

Columns:
- `id` (cuid, PK)
- file metadata:
  - `fileName`
  - `mimeType`
  - `fileSize`
  - `fileKey` (unique)
  - `fileUrl`
- selection metadata:
  - `selectedStartPage` (nullable)
  - `selectedEndPage` (nullable)
- classification:
  - `type` (`DocumentType`)
- global status:
  - `status` (`DocumentStatus`, default `PROCESSING`)
  - `error` (nullable)
- stage statuses:
  - `notebookStatus`, `notebookError`
  - `flashcardsStatus`, `flashcardsError`
  - `flashcardsEnrichmentStatus`, `flashcardsEnrichmentError`
  - `quizzesStatus`, `quizzesError`
- ownership and lifecycle:
  - `userId` (FK -> `User.id`)
  - `deletedAt` (nullable soft-delete marker)
  - `createdAt`
  - `updatedAt`

Relations:
- `user` (N:1)
- `flashcards` (1:N)
- `quizzes` (1:N)
- `notes` (1:N)

Indexes / constraints:
- unique: `Document_fileKey_key`
- unique composite: `Document_id_userId_key`
- index: `Document_userId_createdAt_idx`
- index: `Document_userId_deletedAt_createdAt_idx`

## `Flashcard`

Columns:
- `id` (cuid, PK)
- core content:
  - `question`
  - `answer`
- enrichment metadata:
  - `topic` (nullable)
  - `iconKey` (nullable)
  - `visualNeedScore` (nullable float)
  - `imagePrompt` (nullable)
  - `imageStatus` (nullable string; app-level enum)
  - `imageUrl` (nullable)
  - `requiresPointer` (nullable bool)
  - `pointerX` (nullable float)
  - `pointerY` (nullable float)
- relation fields:
  - `documentId` (FK -> `Document.id`)
- timestamps:
  - `createdAt`
  - `updatedAt`

`imageStatus` app-level values in TypeScript:
- `not_requested`
- `queued`
- `processing`
- `ready`
- `failed`

## `Quiz`

Columns:
- `id` (cuid, PK)
- `question`
- `options` (JSON)
- `correctOption` (int index)
- `explanation` (nullable)
- `documentId` (FK -> `Document.id`)
- `createdAt`
- `updatedAt`

## `Note`

Columns:
- `id` (cuid, PK)
- `title`
- `content`
- `documentId` (FK -> `Document.id`)
- `createdAt`
- `updatedAt`

---

## Migration timeline

1. `20260410140825_init`
   - initial Document/Flashcard/Quiz/Note schema + enums.
2. `20260410180000_auth_multitenancy`
   - add User/Session, add `Document.userId`, backfill legacy owner.
3. `20260411100709_add_user_nickname`
   - no-op migration.
4. `20260411101500_add_user_nickname`
   - add/backfill `User.nickname`, unique index.
5. `20260411103000_nickname_len_7`
   - enforce `VARCHAR(7)` for nickname.
6. `20260411120000_document_soft_delete`
   - add `Document.deletedAt` + trash index.
7. `20260411193000_document_selected_page_range`
   - add `selectedStartPage`, `selectedEndPage`.
8. `20260411201000_flashcard_visual_metadata`
   - add flashcard enrichment/image metadata columns.
9. `20260411213000_document_stage_statuses`
   - add per-stage statuses/errors on Document.
10. `20260412024000_flashcards_enrichment_status`
   - add flashcards enrichment status/error fields.
