import type { PocketBaseSchemaMapping } from "../types/pocketbase";

export const pocketBaseSchemaMapping: PocketBaseSchemaMapping = {
  notes: {
    purpose:
      "PocketBase schema contract for AI-first backend with notebook -> flashcards/quizzes pipeline.",
    compatibility: [
      "Preserve staged status polling at document level.",
      "Keep ownership checks via authenticated PocketBase user id.",
      "Use separate tables for flashcard decks/cards and quizzes/questions.",
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
      ],
    },
    {
      collection: "documents",
      type: "base",
      fields: [
        { name: "owner", type: "relation", required: true, relation: { collection: "users", maxSelect: 1 } },
        { name: "fileName", type: "text", required: true },
        { name: "mimeType", type: "text", required: true },
        { name: "fileSize", type: "number", required: true, min: 0 },
        { name: "storageFileId", type: "text", required: true },
        { name: "type", type: "select", required: true, options: ["PDF", "PPTX"] },
        { name: "status", type: "select", required: true, options: ["PROCESSING", "COMPLETED", "FAILED"] },
        { name: "error", type: "text" },
        { name: "notebookStatus", type: "select", required: true, options: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] },
        { name: "notebookError", type: "text" },
        { name: "flashcardsStatus", type: "select", required: true, options: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] },
        { name: "flashcardsError", type: "text" },
        { name: "quizzesStatus", type: "select", required: true, options: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] },
        { name: "quizzesError", type: "text" },
      ],
    },
    {
      collection: "notes",
      type: "base",
      fields: [
        { name: "document", type: "relation", required: true, relation: { collection: "documents", maxSelect: 1, cascadeDelete: true } },
        { name: "title", type: "text", required: true },
        { name: "content", type: "text", required: true },
        { name: "sortOrder", type: "number", required: true, min: 0 },
      ],
    },
    {
      collection: "flashcard_decks",
      type: "base",
      fields: [
        { name: "document", type: "relation", required: true, relation: { collection: "documents", maxSelect: 1, cascadeDelete: true } },
        { name: "externalId", type: "text" },
        { name: "title", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "sortOrder", type: "number", required: true, min: 0 },
      ],
    },
    {
      collection: "flashcards",
      type: "base",
      fields: [
        { name: "document", type: "relation", required: true, relation: { collection: "documents", maxSelect: 1, cascadeDelete: true } },
        { name: "deck", type: "relation", required: true, relation: { collection: "flashcard_decks", maxSelect: 1, cascadeDelete: true } },
        { name: "externalId", type: "text" },
        { name: "front", type: "text", required: true },
        { name: "back", type: "text", required: true },
        { name: "imagePrompt", type: "text", required: true },
        { name: "imageUrls", type: "json" },
        { name: "tags", type: "json" },
        { name: "sortOrder", type: "number", required: true, min: 0 },
      ],
    },
    {
      collection: "quizzes",
      type: "base",
      fields: [
        { name: "document", type: "relation", required: true, relation: { collection: "documents", maxSelect: 1, cascadeDelete: true } },
        { name: "externalId", type: "text" },
        { name: "title", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "sortOrder", type: "number", required: true, min: 0 },
      ],
    },
    {
      collection: "quiz_questions",
      type: "base",
      fields: [
        { name: "document", type: "relation", required: true, relation: { collection: "documents", maxSelect: 1, cascadeDelete: true } },
        { name: "quiz", type: "relation", required: true, relation: { collection: "quizzes", maxSelect: 1, cascadeDelete: true } },
        { name: "externalId", type: "text" },
        { name: "question", type: "text", required: true },
        { name: "options", type: "json", required: true },
        { name: "correctIndex", type: "number", required: true, min: 0 },
        { name: "explanation", type: "text" },
        { name: "tags", type: "json" },
        { name: "imagePrompt", type: "text", required: true },
        { name: "imageUrls", type: "json" },
        { name: "sortOrder", type: "number", required: true, min: 0 },
      ],
    },
  ],
};
