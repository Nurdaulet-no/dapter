# 5. Data Model (Prisma/PostgreSQL)

Source: `prisma/schema.prisma`

## Enums

- `DocumentStatus`:
  - `PROCESSING`
  - `COMPLETED`
  - `FAILED`

- `DocumentType`:
  - `PDF`
  - `PPTX`

## Models

### `Document`

- `id` (cuid, PK)
- `fileName`
- `mimeType`
- `fileSize`
- `fileKey` (unique, S3 key)
- `fileUrl`
- `type` (`DocumentType`)
- `status` (`DocumentStatus`)
- `error` (nullable)
- `createdAt`
- `updatedAt`

Relations:
- `flashcards` (1:N)
- `quizzes` (1:N)
- `notes` (1:N)

### `Flashcard`

- `id`
- `question`
- `answer`
- `documentId` (FK -> Document)
- `createdAt`
- `updatedAt`

### `Quiz`

- `id`
- `question`
- `options` (JSON)
- `correctOption` (int index)
- `explanation` (nullable)
- `documentId` (FK -> Document)
- `createdAt`
- `updatedAt`

### `Note`

- `id`
- `title`
- `content`
- `documentId` (FK -> Document)
- `createdAt`
- `updatedAt`
