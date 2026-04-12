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
- `nickname` (unique, varchar(7))
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
- `selectedStartPage` (nullable)
- `selectedEndPage` (nullable)
- `type` (`DocumentType`)
- `status` (`DocumentStatus`)
- `error` (nullable)
- `userId` (FK -> User)
- `deletedAt` (nullable, trash soft-delete marker)
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
- index: `[userId, deletedAt, createdAt]`

### `Flashcard`

- `id`
- `topic` (nullable)
- `iconKey` (nullable)
- `visualNeedScore` (nullable float)
- `imagePrompt` (nullable)
- `imageStatus` (nullable string)
- `imageUrl` (nullable)
- `requiresPointer` (nullable bool)
- `pointerX` (nullable float)
- `pointerY` (nullable float)
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
