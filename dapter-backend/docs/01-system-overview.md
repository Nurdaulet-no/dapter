# 1. System Overview

## Purpose

Dapter API converts uploaded study files (PDF, PPTX, TXT, MD) into one of three artifact types:

- A **flashcard deck** — at least 40 atomic cards (front/back/imagePrompt/tags) plus generated illustrations.
- A **quiz** — at least 30 multiple-choice questions with explanations.
- A **notes** study guide — a single Markdown document (≥1500 words, typically 3000–6000+) with H1/H2/H3 structure, LaTeX math, GFM tables, and worked-example/pitfall/intuition callouts.

The user picks which artifact to generate per upload. The three surfaces are completely parallel and independent.

## Key properties

- One upload → one row. A single `flashcards` row owns its full deck via JSON `content`; a `quizzes` row owns its quiz the same way; a `notes` row owns one Markdown body in `content.markdown`. Children (cards, questions) are not separate collections.
- Up to 5 source files per upload. Files are stored in `storage_files` and referenced through the row's `docs[]` relation.
- Asynchronous: `POST` returns `{ id, status: "PROCESSING" }` immediately; the pipeline finishes in the background.
- Extracted source text is sent **directly** to the LLM. There is no intermediate notebook stage and no persisted intermediate artifact.
- Per-user isolation: all reads/writes are scoped to the row's `owner` (the PocketBase user behind the bearer token).

## High-level flow

1. Client authenticates against PocketBase, gets a user token.
2. Client `POST`s to `/flashcards/`, `/quizzes/`, **or** `/notes/` with 1–5 files.
3. Backend uploads each file to `storage_files`, creates a row with `status=PROCESSING`, returns the row id.
4. Background worker downloads the files, extracts text per file, concatenates with file separators, truncates to `MAX_EXTRACTED_CHARS`.
5. A single xAI Grok call produces a structured payload validated against the row's zod schema.
6. The row is updated with `title`, `description`, `content`, `status=COMPLETED`.
7. Flashcards only: image-generation workers populate per-card `imageUrls` after the deck is persisted. Quizzes and notes have no image sub-step.
8. Failures flip `status=FAILED` and write `error`. `POST /:id/retry` re-runs the pipeline against the same `docs[]`.
