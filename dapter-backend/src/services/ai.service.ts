import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { ZodTypeAny } from "zod";
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

export interface IAIService {
  generateNotebook(text: string): Promise<NotesOnlyPayload>;
  generateFlashcardDecksFromNotebook(notebookText: string): Promise<FlashcardDecksPayload>;
  generateQuizzesFromNotebook(notebookText: string): Promise<QuizzesOnlyPayload>;
}

export class AIService implements IAIService {
  private readonly openai = createOpenAI({ apiKey: env.openaiApiKey });

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
    });
  }

  public async generateNotebook(text: string): Promise<NotesOnlyPayload> {
    logger.info("ai.generation.started", {
      stage: "notebook",
      inputTextLength: text.length,
      provider: "openai",
      model: env.openaiModel,
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

    return this.generateWithOpenAI({
      stage: "notebook",
      prompt,
      schema: notesOnlyPayloadSchema,
      successMapper: (object) => ({ notes: object.notes.length }),
    });
  }

  public async generateFlashcardDecksFromNotebook(
    notebookText: string,
  ): Promise<FlashcardDecksPayload> {
    const prompt = [
      FLASHCARDS_SYSTEM_PROMPT,
      "",
      `NOTEBOOK:\n${notebookText.slice(0, env.maxExtractedChars)}`,
    ].join("\n");

    return this.generateWithOpenAI({
      stage: "flashcards",
      prompt,
      schema: flashcardDecksPayloadSchema,
      successMapper: (object) => ({
        flashcardDecks: object.flashcardDecks.length,
        flashcardsTotal: object.flashcardDecks.reduce((acc, deck) => acc + deck.cards.length, 0),
      }),
    });
  }

  public async generateQuizzesFromNotebook(notebookText: string): Promise<QuizzesOnlyPayload> {
    const prompt = [
      QUIZZES_SYSTEM_PROMPT,
      "",
      `NOTEBOOK:\n${notebookText.slice(0, env.maxExtractedChars)}`,
    ].join("\n");

    return this.generateWithOpenAI({
      stage: "quizzes",
      prompt,
      schema: quizzesOnlyPayloadSchema,
      successMapper: (object) => ({ quizzes: object.quizzes.length }),
    });
  }

  private async generateWithOpenAI<T>({
    stage,
    prompt,
    schema,
    successMapper,
  }: {
    stage: "notebook" | "flashcards" | "quizzes";
    prompt: string;
    schema: ZodTypeAny;
    successMapper: (object: T) => Record<string, number>;
  }): Promise<T> {
    try {
      logger.info("ai.openai.attempt.started", {
        stage,
        provider: "openai",
        model: env.openaiModel,
        attemptTimeoutMs: env.aiProviderAttemptTimeoutMs,
      });
      const { object } = await this.withTimeout(
        generateObject({
          model: this.openai(env.openaiModel),
          schema,
          prompt,
          temperature: 0.2,
        }),
        env.aiProviderAttemptTimeoutMs,
        `OpenAI attempt timed out after ${env.aiProviderAttemptTimeoutMs}ms`,
      );
      logger.info("ai.openai.attempt.completed", {
        stage,
        provider: "openai",
        model: env.openaiModel,
        ...successMapper(object as T),
      });
      return object as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown OpenAI error";
      logger.error("ai.openai.attempt.failed", {
        stage,
        provider: "openai",
        model: env.openaiModel,
        message,
        error,
      });
      throw new Error(`OpenAI failed for ${stage}: ${message}`);
    }
  }
}
