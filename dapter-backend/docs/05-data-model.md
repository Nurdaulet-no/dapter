# 5. Data Model (PocketBase)

Source of truth for runtime contract: `src/config/pocketbase-schema.ts`.

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

## Collections / Entities

## `User`

Columns:
- `id` (record id)
- `email` (unique)
- `createdAt`
- `updatedAt`

Relations:
- `documents` (1:N)

## `Document`

Columns:
- `id` (record id)
- file metadata:
  - `fileName`
  - `mimeType`
  - `fileSize`
  - `storageFileId` (reference to `storage_files`)
- classification:
  - `type` (`DocumentType`)
- global status:
  - `status` (`DocumentStatus`, default `PROCESSING`)
  - `error` (nullable)
- stage statuses:
  - `notebookStatus`, `notebookError`
  - `flashcardsStatus`, `flashcardsError`
  - `quizzesStatus`, `quizzesError`
- ownership and lifecycle:
  - `owner` (FK -> `users.id`)
  - `deletedAt` (nullable soft-delete marker)
  - `createdAt`
  - `updatedAt`

Relations:
- `notes` (1:N)
- `flashcard_decks` (1:N)
- `flashcards` (1:N)
- `quizzes` (1:N)
- `quiz_questions` (1:N)

## `Note`

Columns:
- `id` (record id)
- `document` (FK -> `documents.id`)
- `title`
- `content`
- `sortOrder`
- `createdAt`
- `updatedAt`

## `FlashcardDeck` (`flashcard_decks`)

Columns:
- `id` (record id)
- `document` (FK -> `documents.id`)
- `externalId` (original model id from AI output)
- `title`
- `description` (nullable)
- `sortOrder`
- `createdAt`
- `updatedAt`

## `Flashcard` (`flashcards`)

Columns:
- `id` (record id)
- `document` (FK -> `documents.id`)
- `deck` (FK -> `flashcard_decks.id`)
- `externalId` (original model id from AI output)
- `front`
- `back`
- `imagePrompt`
- `imageUrls` (JSON array of URLs)
- `tags` (JSON array of strings)
- `sortOrder`
- `createdAt`
- `updatedAt`

Removed fields (no longer in model):
- `requiresPointer`
- `visualNeedScore`
- `pointerX`
- `pointerY`
- `topic`
- `iconKey`

## `Quiz` (`quizzes`)

Columns:
- `id` (record id)
- `document` (FK -> `documents.id`)
- `externalId` (original model id from AI output)
- `title`
- `description` (nullable)
- `sortOrder`
- `createdAt`
- `updatedAt`

## `QuizQuestion` (`quiz_questions`)

Columns:
- `id` (record id)
- `document` (FK -> `documents.id`)
- `quiz` (FK -> `quizzes.id`)
- `externalId` (original model id from AI output)
- `question`
- `options` (JSON array)
- `correctIndex` (int index)
- `explanation` (nullable)
- `tags` (JSON array of strings)
- `imagePrompt`
- `imageUrls` (JSON array of URLs)
- `sortOrder`
- `createdAt`
- `updatedAt`

## Runtime collections mapping

- `users`
- `storage_files`
- `documents`
- `notes`
- `flashcard_decks`
- `flashcards`
- `quizzes`
- `quiz_questions`
