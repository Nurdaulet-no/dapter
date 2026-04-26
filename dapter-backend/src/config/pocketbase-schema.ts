import type { PocketBaseCollectionFieldSpec, PocketBaseSchemaMapping } from "../types/pocketbase";

const timestampFields: PocketBaseCollectionFieldSpec[] = [
  { name: "created", type: "autodate", onCreate: true },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];

/**
 * Truly obsolete collection names from earlier architectures. The setup script
 * deletes any of these that still exist in PocketBase before reconciling the
 * current schema. Names that ALSO appear in `pocketBaseSchemaMapping.collections`
 * must NOT be listed here — that would wipe user data on every run.
 *
 * Note for users upgrading from the very old `documents` architecture: if you
 * still have a legacy `notes` collection (the old child-of-document `notes`,
 * not the new top-level Notes), drop it manually in the PocketBase admin
 * before running `setup:db`. Field types changed (text → json), and the sync
 * loop does not detect type changes.
 */
export const DROPPED_COLLECTIONS = [
  "quiz_questions",
  "flashcard_decks",
  "documents",
];

export const pocketBaseSchemaMapping: PocketBaseSchemaMapping = {
  meta: {
    purpose:
      "Top-level entities are flashcards and quizzes. Each row owns its full content as JSON, with a multi-file `docs` relation to storage_files.",
    compatibility: [
      "Each upload produces exactly one flashcards or quizzes row.",
      "Children (cards, questions) live inside the row's `content` JSON field.",
      "Extracted source text is sent directly to the LLM; no intermediate artifacts are persisted.",
    ],
  },
  collections: [
    {
      collection: "users",
      type: "auth",
      fields: [],
    },
    {
      collection: "storage_files",
      type: "base",
      fields: [
        { name: "file", type: "file", required: true, maxSize: 25 * 1024 * 1024 },
        { name: "fileName", type: "text", required: true },
        { name: "mimeType", type: "text", required: true },
        { name: "size", type: "number", required: true, min: 0 },
        ...timestampFields,
      ],
    },
    {
      collection: "flashcards",
      type: "base",
      fields: [
        { name: "owner", type: "relation", required: true, relation: { collection: "users", maxSelect: 1 } },
        { name: "docs", type: "relation", required: true, relation: { collection: "storage_files", maxSelect: 5, cascadeDelete: false } },
        { name: "title", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "content", type: "json", required: true },
        { name: "status", type: "select", required: true, options: ["PROCESSING", "COMPLETED", "FAILED"] },
        { name: "error", type: "text" },
        ...timestampFields,
      ],
    },
    {
      collection: "quizzes",
      type: "base",
      fields: [
        { name: "owner", type: "relation", required: true, relation: { collection: "users", maxSelect: 1 } },
        { name: "docs", type: "relation", required: true, relation: { collection: "storage_files", maxSelect: 5, cascadeDelete: false } },
        { name: "title", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "content", type: "json", required: true },
        { name: "status", type: "select", required: true, options: ["PROCESSING", "COMPLETED", "FAILED"] },
        { name: "error", type: "text" },
        ...timestampFields,
      ],
    },
    {
      collection: "notes",
      type: "base",
      fields: [
        { name: "owner", type: "relation", required: true, relation: { collection: "users", maxSelect: 1 } },
        { name: "docs", type: "relation", required: true, relation: { collection: "storage_files", maxSelect: 5, cascadeDelete: false } },
        { name: "title", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "content", type: "json", required: true },
        { name: "status", type: "select", required: true, options: ["PROCESSING", "COMPLETED", "FAILED"] },
        { name: "error", type: "text" },
        ...timestampFields,
      ],
    },
  ],
};
