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
- `TXT`

---

## Collections / Entities

## `User`

Auth collection managed by PocketBase.

## `Document`

Columns:
- `id` (record id)
- `owner` (FK -> `users.id`)
- `fileName`
- `mimeType`
- `fileSize`
- `storageFileId` (reference to `storage_files`)
- `type` (`DocumentType`)
- `status` (`DocumentStatus`)
- `error` (nullable)
- `notebookStatus`, `notebookError`
- `flashcardsStatus`, `flashcardsError`
- `quizzesStatus`, `quizzesError`
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
- `id`
- `document` (FK -> `documents.id`)
- `title`
- `content`
- `sortOrder`
- `createdAt`
- `updatedAt`

## `FlashcardDeck` (`flashcard_decks`)

Columns:
- `id`
- `document` (FK -> `documents.id`)
- `externalId`
- `title`
- `description` (nullable)
- `sortOrder`
- `createdAt`
- `updatedAt`

## `Flashcard` (`flashcards`)

Columns:
- `id`
- `document` (FK -> `documents.id`)
- `deck` (FK -> `flashcard_decks.id`)
- `externalId`
- `front`
- `back`
- `imagePrompt`
- `imageUrls` (JSON array of URLs)
- `tags` (JSON array of strings)
- `sortOrder`
- `createdAt`
- `updatedAt`

## `Quiz` (`quizzes`)

Columns:
- `id`
- `document` (FK -> `documents.id`)
- `externalId`
- `title`
- `description` (nullable)
- `sortOrder`
- `createdAt`
- `updatedAt`

## `QuizQuestion` (`quiz_questions`)

Columns:
- `id`
- `document` (FK -> `documents.id`)
- `quiz` (FK -> `quizzes.id`)
- `externalId`
- `question`
- `options` (JSON array)
- `correctIndex`
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
