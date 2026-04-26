import { FLASHCARDS_SYSTEM_PROMPT } from "../../prompts/flashcards.system";
import { NOTEBOOK_SYSTEM_PROMPT } from "../../prompts/notebook.system";
import { QUIZZES_SYSTEM_PROMPT } from "../../prompts/quizzes.system";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  flashcardPayloadSchema,
  type FlashcardPayload,
} from "../schemas/flashcards.schema";
import {
  quizPayloadSchema,
  type QuizPayload,
} from "../schemas/quizzes.schema";
import { z } from "zod";
import { createLLMProvider } from "./providers/factory";
import type { ILLMProvider } from "./providers/provider.interface";

const notebookPayloadSchema = z.object({
  notes: z
    .array(
      z.object({
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
      }),
    )
    .min(1)
    .describe(
      "Comprehensive set of structured notes derived from the SOURCE. Aim for at least 12 well-scoped notes for any non-trivial source; favor coverage and depth over brevity. Break material into focused sections rather than one giant blob.",
    ),
});

type NotebookPayload = z.infer<typeof notebookPayloadSchema>;

export interface IAIService {
  generateFlashcardDeck(text: string): Promise<FlashcardPayload>;
  generateQuiz(text: string): Promise<QuizPayload>;
}

export class AIService implements IAIService {
  private readonly provider: ILLMProvider;

  public constructor(provider: ILLMProvider = createLLMProvider()) {
    this.provider = provider;
  }

  public async generateFlashcardDeck(text: string): Promise<FlashcardPayload> {
    const notebookText = await this.generateNotebookText(text);
    const prompt = [
      FLASHCARDS_SYSTEM_PROMPT,
      "",
      `SOURCE:\n${notebookText.slice(0, env.maxExtractedChars)}`,
    ].join("\n");

    const object = await this.provider.generateObject({
      stage: "flashcards",
      schema: flashcardPayloadSchema,
      prompt,
    });
    return object as FlashcardPayload;
  }

  public async generateQuiz(text: string): Promise<QuizPayload> {
    const notebookText = await this.generateNotebookText(text);
    const prompt = [
      QUIZZES_SYSTEM_PROMPT,
      "",
      `SOURCE:\n${notebookText.slice(0, env.maxExtractedChars)}`,
    ].join("\n");

    const object = await this.provider.generateObject({
      stage: "quizzes",
      schema: quizPayloadSchema,
      prompt,
    });
    return object as QuizPayload;
  }

  private async generateNotebookText(text: string): Promise<string> {
    logger.info("ai.notebook.generation.started", {
      provider: this.provider.name,
      model: this.provider.model,
      inputLength: text.length,
    });
    if (text.trim().length < 80) {
      throw new Error("Extracted text is too short for meaningful generation");
    }
    const prompt = [
      NOTEBOOK_SYSTEM_PROMPT,
      "",
      `SOURCE:\n${text.slice(0, env.maxExtractedChars)}`,
    ].join("\n");
    const notebook = (await this.provider.generateObject({
      stage: "notebook",
      schema: notebookPayloadSchema,
      prompt,
    })) as NotebookPayload;
    return notebook.notes.map((note) => `${note.title}\n${note.content}`).join("\n\n").trim();
  }
}
