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

### `User`

- `id` (cuid, PK)
- `email` (unique)
- `passwordHash` (nullable)
- `googleId` (nullable, unique)
- `createdAt`
- `updatedAt`

Relations:
- `documents` (1:N)
- `sessions` (1:N)

### `Session`

- `id` (cuid, PK)
- `userId` (FK -> User)
- `refreshTokenHash`
- `refreshTokenVersion`
- `expiresAt`
- `createdAt`
- `updatedAt`

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
- `userId` (FK -> User)
- `createdAt`
- `updatedAt`

Relations:
- `user` (N:1)
- `flashcards` (1:N)
- `quizzes` (1:N)
- `notes` (1:N)

Indexes/constraints:
- unique: `fileKey`
- unique composite: `[id, userId]`
- index: `[userId, createdAt]`

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
