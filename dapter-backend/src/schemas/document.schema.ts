import { t } from "elysia";
import { z } from "zod";

const documentStatusSchema = t.Union([t.Literal("PROCESSING"), t.Literal("COMPLETED"), t.Literal("FAILED")]);
const artifactStageStatusSchema = t.Union([
  t.Literal("PENDING"),
  t.Literal("PROCESSING"),
  t.Literal("COMPLETED"),
  t.Literal("FAILED"),
]);

const flashcardResponseSchema = t.Object({
  id: t.String(),
  front: t.String(),
  back: t.String(),
  imageUrls: t.Optional(t.Array(t.String())),
  tags: t.Optional(t.Array(t.String())),
});

const flashcardDeckResponseSchema = t.Object({
  id: t.String(),
  title: t.String(),
  description: t.Optional(t.String()),
  cards: t.Array(flashcardResponseSchema),
});

const quizQuestionResponseSchema = t.Object({
  id: t.String(),
  question: t.String(),
  options: t.Array(t.String()),
  correctIndex: t.Number(),
  explanation: t.Optional(t.String()),
  tags: t.Optional(t.Array(t.String())),
  imageUrls: t.Optional(t.Array(t.String())),
});

const quizResponseSchema = t.Object({
  id: t.String(),
  title: t.String(),
  description: t.Optional(t.String()),
  questions: t.Array(quizQuestionResponseSchema),
});

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
    status: documentStatusSchema,
    createdAt: t.String(),
    updatedAt: t.String(),
  }),
);

const stageEnvelopeSchema = {
  documentId: t.String(),
  status: documentStatusSchema,
  error: t.Optional(t.String()),
  notebookStatus: artifactStageStatusSchema,
  notebookError: t.Optional(t.String()),
  flashcardsStatus: artifactStageStatusSchema,
  flashcardsError: t.Optional(t.String()),
  quizzesStatus: artifactStageStatusSchema,
  quizzesError: t.Optional(t.String()),
};

export const documentStatusResponseSchema = t.Object({
  ...stageEnvelopeSchema,
  flashcardDecks: t.Optional(t.Array(flashcardDeckResponseSchema)),
  notes: t.Optional(
    t.Array(
      t.Object({
        id: t.String(),
        title: t.String(),
        content: t.String(),
      }),
    ),
  ),
  quizzes: t.Optional(t.Array(quizResponseSchema)),
});

export const documentFlashcardsResponseSchema = t.Object({
  ...stageEnvelopeSchema,
  flashcardDecks: t.Optional(t.Array(flashcardDeckResponseSchema)),
});

export const documentQuizzesResponseSchema = t.Object({
  ...stageEnvelopeSchema,
  quizzes: t.Optional(t.Array(quizResponseSchema)),
});

export const documentNotesResponseSchema = t.Object({
  ...stageEnvelopeSchema,
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
  id: z.string(),
  front: z.string().min(1),
  back: z.string().min(1),
  imageUrls: z.array(z.string().url()).optional(),
  tags: z.array(z.string()).optional(),
});

export const flashcardDeckSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  cards: z.array(flashcardSchema).min(1),
});

export const noteSchema = z.object({
  title: z.string().min(3),
  content: z.string().min(1),
});

export const quizQuestionSchema = z.object({
  id: z.string(),
  question: z.string().min(1),
  options: z.array(z.string()).min(2),
  correctIndex: z.number().int().min(0),
  explanation: z.string().optional(),
  tags: z.array(z.string()).optional(),
  imageUrls: z.array(z.string().url()).optional(),
});

export const quizSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  questions: z.array(quizQuestionSchema).min(1),
});

export const llmPayloadSchema = z.object({
  notes: z.array(noteSchema).min(1),
  flashcardDecks: z.array(flashcardDeckSchema).min(1),
  quizzes: z.array(quizSchema).min(1),
});

export type LlmPayload = z.infer<typeof llmPayloadSchema>;

export const notesOnlyPayloadSchema = z.object({
  notes: z.array(noteSchema).min(1),
});

export const flashcardDecksPayloadSchema = z.object({
  flashcardDecks: z.array(
    z.object({
      id: z.string(),
      title: z.string().min(1),
      description: z.string().optional(),
      cards: z.array(
        z.object({
          id: z.string(),
          front: z.string().min(1),
          back: z.string().min(1),
          imagePrompt: z.string().min(1),
          imageUrls: z.array(z.string().url()).optional(),
          tags: z.array(z.string()).optional(),
        }),
      ).min(1),
    }),
  ).min(1),
});

export const quizzesOnlyPayloadSchema = z.object({
  quizzes: z.array(
    z.object({
      id: z.string(),
      title: z.string().min(1),
      description: z.string().optional(),
      questions: z.array(
        z.object({
          id: z.string(),
          question: z.string().min(1),
          options: z.array(z.string()).min(2),
          correctIndex: z.number().int().min(0),
          explanation: z.string().optional(),
          tags: z.array(z.string()).optional(),
          imagePrompt: z.string().min(1),
          imageUrls: z.array(z.string().url()).optional(),
        }),
      ).min(1),
    }),
  ).min(1),
});

export type NotesOnlyPayload = z.infer<typeof notesOnlyPayloadSchema>;
export type FlashcardDecksPayload = z.infer<typeof flashcardDecksPayloadSchema>;
export type QuizzesOnlyPayload = z.infer<typeof quizzesOnlyPayloadSchema>;
