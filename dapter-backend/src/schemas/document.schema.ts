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
    createdAt: t.String(),
    updatedAt: t.String(),
  }),
);

export const documentStatusResponseSchema = t.Object({
  documentId: t.String(),
  status: t.Union([t.Literal("PROCESSING"), t.Literal("COMPLETED"), t.Literal("FAILED")]),
  error: t.Optional(t.String()),
  flashcards: t.Optional(
    t.Array(
      t.Object({
        id: t.String(),
        question: t.String(),
        answer: t.String(),
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
  flashcards: t.Optional(
    t.Array(
      t.Object({
        id: t.String(),
        question: t.String(),
        answer: t.String(),
      }),
    ),
  ),
});

export const documentQuizzesResponseSchema = t.Object({
  documentId: t.String(),
  status: t.Union([t.Literal("PROCESSING"), t.Literal("COMPLETED"), t.Literal("FAILED")]),
  error: t.Optional(t.String()),
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

export const flashcardSchema = z.object({
  question: z.string().min(3),
  answer: z.string().min(1),
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
