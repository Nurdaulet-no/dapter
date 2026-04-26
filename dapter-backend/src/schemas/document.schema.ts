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

export const documentStatusResponseSchema = t.Object({
  documentId: t.String(),
  status: documentStatusSchema,
  error: t.Optional(t.String()),
});

export const documentNotesResponseSchema = t.Object({
  documentId: t.String(),
  status: artifactStageStatusSchema,
  error: t.Optional(t.String()),
  notes: t.Array(
    t.Object({
      id: t.String(),
      title: t.String(),
      content: t.String(),
    }),
  ),
});

export const documentFlashcardsResponseSchema = t.Object({
  documentId: t.String(),
  status: artifactStageStatusSchema,
  error: t.Optional(t.String()),
  flashcardDecks: t.Array(flashcardDeckResponseSchema),
});

export const documentQuizzesResponseSchema = t.Object({
  documentId: t.String(),
  status: artifactStageStatusSchema,
  error: t.Optional(t.String()),
  quizzes: t.Array(quizResponseSchema),
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
  title: z
    .string()
    .min(3)
    .describe(
      "Precise, descriptive section heading (3-12 words). Avoid generic titles like 'Introduction' or 'Overview' unless truly warranted.",
    ),
  content: z
    .string()
    .min(1)
    .describe(
      "Rich Markdown body for this note. Use headings (##, ###), bullet/numbered lists, bold for key terms, inline code for symbols, fenced code blocks for code/pseudocode, $...$ for inline LaTeX, and Markdown tables for comparative data. Self-contained: a reader opening only this note must fully understand the topic. Include precise definitions, intuition, formal statements, worked examples, common mistakes, and connections to adjacent notes.",
    ),
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
  notes: z
    .array(noteSchema)
    .min(1)
    .describe(
      "Comprehensive set of structured notes derived from the SOURCE. Aim for at least 12 well-scoped notes for any non-trivial source; favor coverage and depth over brevity. Break material into focused sections rather than one giant blob.",
    ),
});

export const flashcardDeckSchemaForLLM = z
  .object({
    id: z
      .string()
      .describe(
        "Stable, kebab-case slug for the deck (e.g., 'deck-linear-algebra-basics').",
      ),
    title: z
      .string()
      .min(1)
      .describe("Short, descriptive deck title (3-10 words)."),
    description: z
      .string()
      .nullable()
      .describe(
        "One or two sentences scoping the deck. Use null only if truly nothing useful to say.",
      ),
    cards: z
      .array(
        z.object({
          id: z
            .string()
            .describe(
              "Stable, kebab-case slug for the card (e.g., 'card-eigenvalue-defn').",
            ),
          front: z
            .string()
            .min(1)
            .describe(
              "The recall prompt. Phrase as a direct question or cloze prompt that tests ONE atomic fact (definition, formula, comparison, why/when, micro-example). No yes/no fronts. Use $...$ for inline math and Markdown fenced blocks for code.",
            ),
          back: z
            .string()
            .min(1)
            .describe(
              "Concise but complete answer. Precise reply plus, when useful, one short clarifying sentence or concrete mini-example. No filler.",
            ),
          imagePrompt: z
            .string()
            .min(1)
            .describe(
              "Concrete, visually descriptive prompt for a text-to-image model (15-40 words). Describe a clean instructional diagram-style illustration that reinforces the card's concept; specify subject, key visual elements, and style (e.g., 'minimalist vector diagram', 'whiteboard sketch', 'isometric infographic'). Avoid text-heavy images, logos, real people, or copyrighted material.",
            ),
          tags: z
            .array(z.string())
            .nullable()
            .describe(
              "2-6 short topical tags (lowercase, kebab-case). Use null only if no sensible tags exist.",
            ),
        }),
      )
      .min(40)
      .describe(
        "Cards in this deck. Generate AT LEAST 40; for substantive notebooks, prefer 60-150+. Each card must be atomic (one fact per card). Cover every important fact, definition, formula, theorem, named entity, mechanism, parameter, edge case, and contrast in the notebook. No duplicates or trivial paraphrases.",
      ),
  })
  .describe(
    "A single flashcard deck focused on one coherent topic from the notebook.",
  );

export const flashcardDecksPayloadSchema = z.object({
  flashcardDecks: z
    .array(flashcardDeckSchemaForLLM)
    .min(1)
    .describe(
      "All flashcard decks for the notebook. Split material into multiple decks when topics are clearly distinct (e.g., one deck per major chapter or theme). 1-6 decks is typical.",
    ),
});

export const quizSchemaForLLM = z
  .object({
    id: z
      .string()
      .describe(
        "Stable, kebab-case slug for the quiz (e.g., 'quiz-thermodynamics-laws').",
      ),
    title: z
      .string()
      .min(1)
      .describe("Short, descriptive quiz title (3-10 words)."),
    description: z
      .string()
      .nullable()
      .describe(
        "One or two sentences scoping the quiz. Use null only if truly nothing useful to say.",
      ),
    questions: z
      .array(
        z.object({
          id: z
            .string()
            .describe(
              "Stable, kebab-case slug for the question (e.g., 'q-second-law-entropy').",
            ),
          question: z
            .string()
            .min(1)
            .describe(
              "Self-contained, unambiguous question stem. Avoid negative phrasing unless essential (capitalize NOT when used). Mix Bloom levels: recall, comprehension, application, analysis, evaluation. Include numerical/calculation problems where supported by the source. Use $...$ for inline math and Markdown fenced blocks for code.",
            ),
          options: z
            .array(z.string())
            .min(4)
            .describe(
              "Exactly 4 options (up to 6 only if material truly demands it). Exactly ONE is correct; the others are PLAUSIBLE distractors reflecting realistic misconceptions or near-misses. Keep options parallel in length, grammar, and specificity. Never use 'None of the above' or 'All of the above'.",
            ),
          correctIndex: z
            .number()
            .int()
            .min(0)
            .describe(
              "Zero-based index into options pointing to the single correct choice. Distribute the correct index roughly evenly across questions; do not bias toward any one position.",
            ),
          explanation: z
            .string()
            .nullable()
            .describe(
              "Required teaching explanation (1-4 sentences). State why the correct option is correct AND briefly why each major distractor is wrong or tempting. Treat as a teaching moment, not a restatement. Use null only if absolutely no explanation is possible (rare).",
            ),
          tags: z
            .array(z.string())
            .nullable()
            .describe(
              "2-6 short topical tags (lowercase, kebab-case). Use null only if no sensible tags exist.",
            ),
          imagePrompt: z
            .string()
            .min(1)
            .describe(
              "Concrete, visually descriptive prompt for a text-to-image model (15-40 words). Describe a clean instructional diagram-style illustration that supports the question scenario or concept; specify subject, key visual elements, and style. Avoid text-heavy images, logos, real people, or copyrighted material.",
            ),
        }),
      )
      .min(30)
      .describe(
        "Questions in this quiz. Generate AT LEAST 30; for substantive notebooks, prefer 50-120+. Coverage must be exhaustive — do not leave key facts, formulas, or contrasts unassessed. No duplicates or trivial paraphrases.",
      ),
  })
  .describe(
    "A single quiz focused on one coherent topic from the notebook.",
  );

export const quizzesOnlyPayloadSchema = z.object({
  quizzes: z
    .array(quizSchemaForLLM)
    .min(1)
    .describe(
      "All quizzes for the notebook. Split material into multiple quizzes when topics are clearly distinct (e.g., one quiz per major chapter or theme). 1-5 quizzes is typical.",
    ),
});

export type NotesOnlyPayload = z.infer<typeof notesOnlyPayloadSchema>;
export type FlashcardDecksPayload = z.infer<typeof flashcardDecksPayloadSchema>;
export type QuizzesOnlyPayload = z.infer<typeof quizzesOnlyPayloadSchema>;
