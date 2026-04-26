import { t } from "elysia";
import { z } from "zod";

const rowStatusSchema = t.Union([
  t.Literal("PROCESSING"),
  t.Literal("COMPLETED"),
  t.Literal("FAILED"),
]);

const flashcardCardSchema = t.Object({
  id: t.String(),
  front: t.String(),
  back: t.String(),
  imageUrls: t.Optional(t.Array(t.String())),
  tags: t.Optional(t.Array(t.String())),
});

export const flashcardsListItemSchema = t.Object({
  id: t.String(),
  title: t.String(),
  description: t.Optional(t.String()),
  status: rowStatusSchema,
  error: t.Optional(t.String()),
  cardCount: t.Number(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const flashcardsListResponseSchema = t.Array(flashcardsListItemSchema);

export const flashcardsDetailResponseSchema = t.Object({
  id: t.String(),
  title: t.String(),
  description: t.Optional(t.String()),
  status: rowStatusSchema,
  error: t.Optional(t.String()),
  cardCount: t.Number(),
  createdAt: t.String(),
  updatedAt: t.String(),
  cards: t.Array(flashcardCardSchema),
});

export const flashcardsStatusResponseSchema = t.Object({
  id: t.String(),
  status: rowStatusSchema,
  error: t.Optional(t.String()),
});

export const createFlashcardsResponseSchema = t.Object({
  id: t.String(),
  status: t.Literal("PROCESSING"),
});

/**
 * LLM-output zod schema for a single flashcard deck. The AI SDK forwards each
 * `.describe()` to the model so all per-field guidance lives here, not in the
 * system prompt.
 */
export const flashcardPayloadSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .describe(
        "Short, descriptive deck title (3-10 words) summarizing the topical scope.",
      ),
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
              "Stable, kebab-case slug for the card (e.g., 'card-eigenvalue-defn'). Must be unique within this deck.",
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
        "Cards in this deck. Generate AT LEAST 40; for substantive sources, prefer 60-150+. Each card must be atomic (one fact per card). Cover every important fact, definition, formula, theorem, named entity, mechanism, parameter, edge case, and contrast in the source. No duplicates or trivial paraphrases.",
      ),
  })
  .describe(
    "A single flashcard deck covering all study-worthy material from the source. Exactly one deck per call.",
  );

export type FlashcardPayload = z.infer<typeof flashcardPayloadSchema>;
