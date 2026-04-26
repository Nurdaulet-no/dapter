import { t } from "elysia";
import { z } from "zod";

const rowStatusSchema = t.Union([
  t.Literal("PROCESSING"),
  t.Literal("COMPLETED"),
  t.Literal("FAILED"),
]);

const quizQuestionSchema = t.Object({
  id: t.String(),
  question: t.String(),
  options: t.Array(t.String()),
  correctIndex: t.Number(),
  explanation: t.Optional(t.String()),
  tags: t.Optional(t.Array(t.String())),
  imageUrls: t.Optional(t.Array(t.String())),
});

export const quizListItemSchema = t.Object({
  id: t.String(),
  title: t.String(),
  description: t.Optional(t.String()),
  status: rowStatusSchema,
  error: t.Optional(t.String()),
  questionCount: t.Number(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const quizListResponseSchema = t.Array(quizListItemSchema);

export const quizDetailResponseSchema = t.Object({
  id: t.String(),
  title: t.String(),
  description: t.Optional(t.String()),
  status: rowStatusSchema,
  error: t.Optional(t.String()),
  questionCount: t.Number(),
  createdAt: t.String(),
  updatedAt: t.String(),
  questions: t.Array(quizQuestionSchema),
});

export const quizStatusResponseSchema = t.Object({
  id: t.String(),
  status: rowStatusSchema,
  error: t.Optional(t.String()),
});

export const createQuizResponseSchema = t.Object({
  id: t.String(),
  status: t.Literal("PROCESSING"),
});

/**
 * LLM-output zod schema for a single quiz. Per-field guidance is on the schema
 * via `.describe()` so it travels through the AI SDK alongside the type info.
 */
export const quizPayloadSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .describe("Short, descriptive quiz title (3-10 words) summarizing the topical scope."),
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
              "Stable, kebab-case slug for the question (e.g., 'q-second-law-entropy'). Must be unique within this quiz.",
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
        "Questions in this quiz. Generate AT LEAST 30; for substantive sources, prefer 50-120+. Coverage must be exhaustive — do not leave key facts, formulas, or contrasts unassessed. No duplicates or trivial paraphrases.",
      ),
  })
  .describe(
    "A single quiz covering all study-worthy material from the source. Exactly one quiz per call.",
  );

export type QuizPayload = z.infer<typeof quizPayloadSchema>;
