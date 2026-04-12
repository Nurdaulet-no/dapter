import { t } from "elysia";
import { z } from "zod";

export const uploadDocumentResponseSchema = t.Object({
  documentId: t.String(),
  status: t.Literal("PROCESSING"),
});

export const documentListResponseSchema = t.Array(
  t.Object({
    documentId: t.String(),
    fileName: t.String(),
    mimeType: t.String(),
    fileSize: t.Number(),
    status: t.Union([t.Literal("PROCESSING"), t.Literal("COMPLETED"), t.Literal("FAILED")]),
    deletedAt: t.Optional(t.String()),
    createdAt: t.String(),
    updatedAt: t.String(),
  }),
);

export const documentStatusResponseSchema = t.Object({
  documentId: t.String(),
  status: t.Union([t.Literal("PROCESSING"), t.Literal("COMPLETED"), t.Literal("FAILED")]),
  error: t.Optional(t.String()),
  notebookStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  notebookError: t.Optional(t.String()),
  flashcardsStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  flashcardsError: t.Optional(t.String()),
  flashcardsEnrichmentStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  flashcardsEnrichmentError: t.Optional(t.String()),
  quizzesStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  quizzesError: t.Optional(t.String()),
  flashcards: t.Optional(
    t.Array(
      t.Object({
        id: t.String(),
        question: t.String(),
        answer: t.String(),
        topic: t.Optional(t.String()),
        iconKey: t.Optional(t.String()),
        visualNeedScore: t.Optional(t.Number()),
        imagePrompt: t.Optional(t.String()),
        imageStatus: t.Optional(t.String()),
        imageUrl: t.Optional(t.String()),
        requiresPointer: t.Optional(t.Boolean()),
        pointerX: t.Optional(t.Number()),
        pointerY: t.Optional(t.Number()),
      }),
    ),
  ),
  notes: t.Optional(
    t.Array(
      t.Object({
        id: t.String(),
        title: t.String(),
        content: t.String(),
      }),
    ),
  ),
  quizzes: t.Optional(
    t.Array(
      t.Object({
        id: t.String(),
        question: t.String(),
        options: t.Array(t.String()),
        correctOption: t.Number(),
        explanation: t.Optional(t.String()),
      }),
    ),
  ),
});

export const documentFlashcardsResponseSchema = t.Object({
  documentId: t.String(),
  status: t.Union([t.Literal("PROCESSING"), t.Literal("COMPLETED"), t.Literal("FAILED")]),
  error: t.Optional(t.String()),
  notebookStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  notebookError: t.Optional(t.String()),
  flashcardsStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  flashcardsError: t.Optional(t.String()),
  flashcardsEnrichmentStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  flashcardsEnrichmentError: t.Optional(t.String()),
  quizzesStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  quizzesError: t.Optional(t.String()),
  flashcards: t.Optional(
    t.Array(
      t.Object({
        id: t.String(),
        question: t.String(),
        answer: t.String(),
        topic: t.Optional(t.String()),
        iconKey: t.Optional(t.String()),
        visualNeedScore: t.Optional(t.Number()),
        imagePrompt: t.Optional(t.String()),
        imageStatus: t.Optional(t.String()),
        imageUrl: t.Optional(t.String()),
        requiresPointer: t.Optional(t.Boolean()),
        pointerX: t.Optional(t.Number()),
        pointerY: t.Optional(t.Number()),
      }),
    ),
  ),
});

export const documentQuizzesResponseSchema = t.Object({
  documentId: t.String(),
  status: t.Union([t.Literal("PROCESSING"), t.Literal("COMPLETED"), t.Literal("FAILED")]),
  error: t.Optional(t.String()),
  notebookStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  notebookError: t.Optional(t.String()),
  flashcardsStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  flashcardsError: t.Optional(t.String()),
  flashcardsEnrichmentStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  flashcardsEnrichmentError: t.Optional(t.String()),
  quizzesStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  quizzesError: t.Optional(t.String()),
  quizzes: t.Optional(
    t.Array(
      t.Object({
        id: t.String(),
        question: t.String(),
        options: t.Array(t.String()),
        correctOption: t.Number(),
        explanation: t.Optional(t.String()),
      }),
    ),
  ),
});

export const documentNotesResponseSchema = t.Object({
  documentId: t.String(),
  status: t.Union([t.Literal("PROCESSING"), t.Literal("COMPLETED"), t.Literal("FAILED")]),
  error: t.Optional(t.String()),
  notebookStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  notebookError: t.Optional(t.String()),
  flashcardsStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  flashcardsError: t.Optional(t.String()),
  flashcardsEnrichmentStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  flashcardsEnrichmentError: t.Optional(t.String()),
  quizzesStatus: t.Union([
    t.Literal("PENDING"),
    t.Literal("PROCESSING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
  ]),
  quizzesError: t.Optional(t.String()),
  notes: t.Optional(
    t.Array(
      t.Object({
        id: t.String(),
        title: t.String(),
        content: t.String(),
      }),
    ),
  ),
});

export const flashcardImageRequestResponseSchema = t.Object({
  documentId: t.String(),
  flashcard: t.Object({
    id: t.String(),
    imageStatus: t.Optional(t.String()),
    imageUrl: t.Optional(t.String()),
    imagePrompt: t.Optional(t.String()),
    visualNeedScore: t.Optional(t.Number()),
  }),
});

export const flashcardSchema = z.object({
  question: z.string().min(3),
  answer: z.string().min(1),
  topic: z.string().min(2).max(64).optional(),
  iconKey: z.string().min(2).max(64).optional(),
  visualNeedScore: z.number().min(0).max(1).optional(),
  imagePrompt: z.string().min(3).max(500).optional(),
  requiresPointer: z.boolean().optional(),
  pointerX: z.number().min(0).max(100).optional(),
  pointerY: z.number().min(0).max(100).optional(),
});

export const flashcardCoreSchema = z.object({
  question: z.string().min(3),
  answer: z.string().min(1),
});

export const flashcardIconKeySchema = z.enum([
  "book-open",
  "brain",
  "code",
  "landmark",
  "mountain",
  "users",
  "credit-card",
  "shield-check",
  "chart-bar",
  "database",
  "target",
  "workflow",
  "qrcode",
  "calendar-clock",
]);

export const flashcardEnrichmentSchema = z.object({
  index: z.number().int().min(0),
  topic: z.string().min(2).max(64).optional(),
  iconKey: flashcardIconKeySchema.optional(),
  visualNeedScore: z.number().min(0).max(1).optional(),
  imagePrompt: z.string().min(3).max(500).optional(),
  requiresPointer: z.boolean().optional(),
  pointerX: z.number().min(0).max(100).optional(),
  pointerY: z.number().min(0).max(100).optional(),
});

export const noteSchema = z.object({
  title: z.string().min(3),
  content: z.string().min(1),
});

export const quizSchema = z.object({
  question: z.string().min(3),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctOption: z.number().int().min(0),
  explanation: z.string().optional(),
});

export const llmPayloadSchema = z.object({
  notes: z.array(noteSchema).min(1),
  flashcards: z.array(flashcardSchema).min(3),
  quizzes: z.array(quizSchema).min(3),
});

export type LlmPayload = z.infer<typeof llmPayloadSchema>;

export const notesOnlyPayloadSchema = z.object({
  notes: z.array(noteSchema).min(1),
});

export const flashcardsOnlyPayloadSchema = z.object({
  flashcards: z.array(flashcardSchema).min(3),
});

export const flashcardsCorePayloadSchema = z.object({
  flashcards: z.array(flashcardCoreSchema).min(3),
});

export const flashcardsEnrichmentPayloadSchema = z.object({
  enrichment: z.array(flashcardEnrichmentSchema),
});

export const quizzesOnlyPayloadSchema = z.object({
  quizzes: z.array(quizSchema).min(3),
});

export type NotesOnlyPayload = z.infer<typeof notesOnlyPayloadSchema>;
export type FlashcardsOnlyPayload = z.infer<typeof flashcardsOnlyPayloadSchema>;
export type FlashcardsCorePayload = z.infer<typeof flashcardsCorePayloadSchema>;
export type FlashcardsEnrichmentPayload = z.infer<typeof flashcardsEnrichmentPayloadSchema>;
export type QuizzesOnlyPayload = z.infer<typeof quizzesOnlyPayloadSchema>;
