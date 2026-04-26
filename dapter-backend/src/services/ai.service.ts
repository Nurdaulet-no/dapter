import { FLASHCARDS_SYSTEM_PROMPT } from "../../prompts/flashcards.system";
import { NOTES_SYSTEM_PROMPT } from "../../prompts/notes.system";
import { QUIZZES_SYSTEM_PROMPT } from "../../prompts/quizzes.system";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  flashcardPayloadSchema,
  type FlashcardPayload,
} from "../schemas/flashcards.schema";
import {
  notesPayloadSchema,
  type NotesPayload,
} from "../schemas/notes.schema";
import {
  quizPayloadSchema,
  type QuizPayload,
} from "../schemas/quizzes.schema";
import { createLLMProvider } from "./providers/factory";
import type { ILLMProvider } from "./providers/provider.interface";

export interface IAIService {
  generateFlashcardDeck(text: string): Promise<FlashcardPayload>;
  generateQuiz(text: string): Promise<QuizPayload>;
  generateNotes(text: string): Promise<NotesPayload>;
}

export class AIService implements IAIService {
  private readonly provider: ILLMProvider;

  public constructor(provider: ILLMProvider = createLLMProvider()) {
    this.provider = provider;
  }

  public async generateFlashcardDeck(text: string): Promise<FlashcardPayload> {
    this.assertSourceLength(text);
    logger.info("ai.flashcards.generation.started", {
      provider: this.provider.name,
      model: this.provider.model,
      inputLength: text.length,
    });
    const prompt = [
      FLASHCARDS_SYSTEM_PROMPT,
      "",
      `SOURCE:\n${text.slice(0, env.maxExtractedChars)}`,
    ].join("\n");
    const object = await this.provider.generateObject({
      stage: "flashcards",
      schema: flashcardPayloadSchema,
      prompt,
    });
    return object as FlashcardPayload;
  }

  public async generateQuiz(text: string): Promise<QuizPayload> {
    this.assertSourceLength(text);
    logger.info("ai.quizzes.generation.started", {
      provider: this.provider.name,
      model: this.provider.model,
      inputLength: text.length,
    });
    const prompt = [
      QUIZZES_SYSTEM_PROMPT,
      "",
      `SOURCE:\n${text.slice(0, env.maxExtractedChars)}`,
    ].join("\n");
    const object = await this.provider.generateObject({
      stage: "quizzes",
      schema: quizPayloadSchema,
      prompt,
    });
    return object as QuizPayload;
  }

  public async generateNotes(text: string): Promise<NotesPayload> {
    this.assertSourceLength(text);
    logger.info("ai.notes.generation.started", {
      provider: this.provider.name,
      model: this.provider.model,
      inputLength: text.length,
    });
    const prompt = [
      NOTES_SYSTEM_PROMPT,
      "",
      `SOURCE:\n${text.slice(0, env.maxExtractedChars)}`,
    ].join("\n");
    const object = await this.provider.generateObject({
      stage: "notes",
      schema: notesPayloadSchema,
      prompt,
    });
    return object as NotesPayload;
  }

  private assertSourceLength(text: string): void {
    if (text.trim().length < 80) {
      throw new Error("Extracted text is too short for meaningful generation");
    }
  }
}
