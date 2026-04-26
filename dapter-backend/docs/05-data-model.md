# 5. Data Model (PocketBase)

Source of truth: `src/config/pocketbase-schema.ts`.

There are exactly four collections: `users`, `storage_files`, `flashcards`, `quizzes`. The previous `documents`, `notes`, `flashcard_decks`, and `quiz_questions` collections are dropped on every run of `scripts/setup-collections.ts` (see `DROPPED_COLLECTIONS`); the previous `flashcards`/`quizzes` shapes are also wiped because the schema is now content-as-JSON rather than rows-with-children.

## Enums

### `RowStatus`
- `PROCESSING`
- `COMPLETED`
- `FAILED`

(Stored in the `status` `select` field on both `flashcards` and `quizzes`.)

## `users`
Auth collection, managed by PocketBase. No custom fields are added.

## `storage_files`
Generic blob storage used both for source uploads and for generated card images.

| Field | Type | Notes |
|---|---|---|
| `file` | file (required) | Max size 25 MB on the collection (separate from `MAX_UPLOAD_SIZE_BYTES` enforced at the controller). |
| `fileName` | text (required) | Original file name from the upload. |
| `mimeType` | text (required) | e.g. `application/pdf`, `image/png`. |
| `size` | number (required, min 0) | Byte length. |
| `created`, `updated` | autodate | Standard. |

## `flashcards`
One row = one deck.

| Field | Type | Notes |
|---|---|---|
| `owner` | relation → `users` (required, maxSelect=1) | Owning user. |
| `docs` | relation → `storage_files` (required, maxSelect=5, **cascadeDelete=false**) | The 1–5 source files used for this deck. |
| `title` | text (required) | Provisional title `Generating: <firstFile> (+N more)` until the LLM picks a real one. |
| `description` | text (nullable) | Filled by the LLM. |
| `content` | json (required) | `{ cards: FlashcardCard[] }`. Empty `{ cards: [] }` until pipeline completes. |
| `status` | select (required) | `PROCESSING | COMPLETED | FAILED`. |
| `error` | text (nullable) | Set when `status=FAILED`. |
| `created`, `updated` | autodate | |

`FlashcardCard` (inside `content.cards`):
```ts
{
  id: string;
  front: string;
  back: string;
  imagePrompt: string;
  imageUrls?: string[];
  tags?: string[];
}
```
`imageUrls` is populated incrementally by the image sub-pipeline after the row is `COMPLETED`.

## `quizzes`
One row = one quiz. Same shape as `flashcards` except for `content`:

| Field | Type | Notes |
|---|---|---|
| `owner` | relation → `users` (required, maxSelect=1) | |
| `docs` | relation → `storage_files` (required, maxSelect=5, cascadeDelete=false) | 1–5 source files. |
| `title` | text (required) | |
| `description` | text (nullable) | |
| `content` | json (required) | `{ questions: QuizQuestion[] }`. |
| `status` | select (required) | `PROCESSING | COMPLETED | FAILED`. |
| `error` | text (nullable) | |
| `created`, `updated` | autodate | |

`QuizQuestion`:
```ts
{
  id: string;
  question: string;
  options: string[];          // ≥4
  correctIndex: number;       // zero-based
  explanation: string | null;
  tags?: string[];
  imagePrompt: string;
  imageUrls?: string[];       // not currently populated for quizzes
}
```

## Notable design choices

- `docs` is non-cascade so deleting a row doesn't tear out the user's source files; a retry can still reach them.
- All children (cards, questions) are denormalized into `content` JSON. There is no separate cards or questions collection.
- The repositories perform defensive parsing of `content` (`parseContent`) so a corrupted JSON blob never blows up a list/detail call — they simply degrade to an empty array.
- The flashcards repository serializes writes to `content` with a per-row in-memory mutex so concurrent image workers can't lose updates.
