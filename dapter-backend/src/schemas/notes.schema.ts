import { t } from "elysia";
import { z } from "zod";

const rowStatusSchema = t.Union([
  t.Literal("PROCESSING"),
  t.Literal("COMPLETED"),
  t.Literal("FAILED"),
]);

export const notesListItemSchema = t.Object({
  id: t.String(),
  title: t.String(),
  description: t.Optional(t.String()),
  status: rowStatusSchema,
  error: t.Optional(t.String()),
  wordCount: t.Number(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const notesListResponseSchema = t.Array(notesListItemSchema);

export const notesDetailResponseSchema = t.Object({
  id: t.String(),
  title: t.String(),
  description: t.Optional(t.String()),
  status: rowStatusSchema,
  error: t.Optional(t.String()),
  wordCount: t.Number(),
  createdAt: t.String(),
  updatedAt: t.String(),
  markdown: t.String(),
});

export const notesStatusResponseSchema = t.Object({
  id: t.String(),
  status: rowStatusSchema,
  error: t.Optional(t.String()),
});

export const createNotesResponseSchema = t.Object({
  id: t.String(),
  status: t.Literal("PROCESSING"),
});

/**
 * LLM-output zod schema for a single Markdown study guide. The AI SDK forwards
 * each `.describe()` to the model so all per-field guidance lives here.
 */
export const notesPayloadSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .describe(
        "Precise, descriptive title for the study guide (3-10 words). Avoid generic titles like 'Study Notes' or 'Summary'.",
      ),
    description: z
      .string()
      .nullable()
      .describe(
        "One or two sentence subtitle scoping the guide. Use null only if truly nothing useful to say.",
      ),
    markdown: z
      .string()
      .min(1)
      .describe(
        [
          "The full study guide as a single Markdown string.",
          "",
          "STRUCTURE (must follow):",
          "- Begin with an H1 (#) — the same as `title`, or a close variant.",
          "- Use H2 (##) for major sections, H3 (###) for sub-sections. Order sections logically (foundational → advanced).",
          "- **Bold** key terms on first introduction.",
          "- Use Markdown tables for any genuinely tabular comparison (e.g., 'X vs Y vs Z').",
          "- Use fenced code blocks with the correct language tag for code/pseudocode.",
          "- Inline math: `$...$`. Display math: `$$...$$`. Use real LaTeX, not unicode hacks.",
          "- Use blockquotes (`>`) prefixed with **Worked example**, **Common pitfall**, or **Intuition** to mark callouts.",
          "- Include 1-3 worked examples per major section where the material supports it. Show the full reasoning.",
          "- Do NOT include multiple-choice questions (those belong in quizzes).",
          "",
          "VOLUME:",
          "- Minimum 1500 words. For substantive sources, target 3000-6000+ words. There is no upper bound.",
          "- Coverage must be exhaustive — every meaningful concept, formula, mechanism, edge case, and contrast in the SOURCE must appear.",
          "",
          "QUALITY:",
          "- Faithful to the SOURCE. Do not invent facts. Standard background may be added sparingly when needed for context.",
          "- Crisp, academic, neutral tone. No emoji. No filler. No marketing language.",
          "- Consistent terminology and notation throughout.",
          "- Cross-link sections by name when relationships matter (e.g., 'See: §Eigenvalue Decomposition').",
        ].join("\n"),
      ),
  })
  .describe(
    "A single Markdown study guide covering all study-worthy material from the source. Exactly one guide per call.",
  );

export type NotesPayload = z.infer<typeof notesPayloadSchema>;
