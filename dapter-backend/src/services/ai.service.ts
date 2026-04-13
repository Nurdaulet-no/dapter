import { FLASHCARDS_SYSTEM_PROMPT } from "../../prompts/flashcards.system";
import { NOTEBOOK_SYSTEM_PROMPT } from "../../prompts/notebook.system";
import { QUIZZES_SYSTEM_PROMPT } from "../../prompts/quizzes.system";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  flashcardDecksPayloadSchema,
  notesOnlyPayloadSchema,
  quizzesOnlyPayloadSchema,
  type FlashcardDecksPayload,
  type NotesOnlyPayload,
  type QuizzesOnlyPayload,
} from "../schemas/document.schema";
import { createLLMProvider } from "./providers/factory";
import type { ILLMProvider } from "./providers/provider.interface";

export interface IAIService {
  generateNotebook(text: string): Promise<NotesOnlyPayload>;
  generateFlashcardDecksFromNotebook(notebookText: string): Promise<FlashcardDecksPayload>;
  generateQuizzesFromNotebook(notebookText: string): Promise<QuizzesOnlyPayload>;
}

export class AIService implements IAIService {
  private readonly provider: ILLMProvider;

  public constructor(provider: ILLMProvider = createLLMProvider()) {
    this.provider = provider;
  }

  public async generateNotebook(text: string): Promise<NotesOnlyPayload> {
    logger.info("ai.generation.started", {
      stage: "notebook",
      inputTextLength: text.length,
      provider: this.provider.name,
      model: this.provider.model,
    });
    if (text.trim().length < 80) {
      logger.error("ai.generation.failed", {
        reason: "text_too_short",
        inputTextLength: text.trim().length,
      });
      throw new Error("Extracted text is too short for meaningful generation");
    }

    const prompt = [
      NOTEBOOK_SYSTEM_PROMPT,
      "",
      `SOURCE:\n${text.slice(0, env.maxExtractedChars)}`,
    ].join("\n");

    const object = await this.provider.generateObject({
      stage: "notebook",
      schema: notesOnlyPayloadSchema,
      prompt,
    });
    return object as NotesOnlyPayload;
  }

  public async generateFlashcardDecksFromNotebook(
    notebookText: string,
  ): Promise<FlashcardDecksPayload> {
    const prompt = [
      FLASHCARDS_SYSTEM_PROMPT,
      "",
      `NOTEBOOK:\n${notebookText.slice(0, env.maxExtractedChars)}`,
    ].join("\n");

    const object = await this.provider.generateObject({
      stage: "flashcards",
      schema: flashcardDecksPayloadSchema,
      prompt,
    });
    return object as FlashcardDecksPayload;
  }

  public async generateQuizzesFromNotebook(notebookText: string): Promise<QuizzesOnlyPayload> {
    const prompt = [
      QUIZZES_SYSTEM_PROMPT,
      "",
      `NOTEBOOK:\n${notebookText.slice(0, env.maxExtractedChars)}`,
    ].join("\n");

    const object = await this.provider.generateObject({
      stage: "quizzes",
      schema: quizzesOnlyPayloadSchema,
      prompt,
    });
    return object as QuizzesOnlyPayload;
  }
}
