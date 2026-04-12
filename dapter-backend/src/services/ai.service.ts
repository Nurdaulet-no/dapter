import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import type { ZodTypeAny } from "zod";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  flashcardsCorePayloadSchema,
  flashcardsEnrichmentPayloadSchema,
  notesOnlyPayloadSchema,
  quizzesOnlyPayloadSchema,
  type FlashcardsCorePayload,
  type FlashcardsEnrichmentPayload,
  type NotesOnlyPayload,
  type QuizzesOnlyPayload,
} from "../schemas/document.schema";

export interface IAIService {
  generateNotebook(text: string): Promise<NotesOnlyPayload>;
  generateFlashcardsCoreFromNotebook(notebookText: string): Promise<FlashcardsCorePayload>;
  enrichFlashcardsMetadata(
    notebookText: string,
    flashcards: Array<{ question: string; answer: string }>,
  ): Promise<FlashcardsEnrichmentPayload>;
  generateQuizzesFromNotebook(notebookText: string): Promise<QuizzesOnlyPayload>;
}

type ProviderName = "google" | "groq" | "openrouter";

interface ProviderTarget {
  provider: ProviderName;
  model: string;
}

export class AIService implements IAIService {
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
      failoverChain: env.aiProviderOrder,
    });
    if (text.trim().length < 80) {
      logger.error("ai.generation.failed", {
        reason: "text_too_short",
        inputTextLength: text.trim().length,
      });
      throw new Error("Extracted text is too short for meaningful generation");
    }

    const prompt = [
      "You are an educational content structurer.",
      "Create concise but complete structured notes from the source text.",
      "Remove filler and redundancy, keep only meaningful material.",
      "Keep output factual and aligned to source material only.",
      "",
      `SOURCE:\n${text.slice(0, env.maxExtractedChars)}`,
    ].join("\n");

    return this.generateWithFailover({
      stage: "notebook",
      prompt,
      schema: notesOnlyPayloadSchema,
      successMapper: (object) => ({ notes: object.notes.length }),
    });
  }

  public async generateFlashcardsCoreFromNotebook(
    notebookText: string,
  ): Promise<FlashcardsCorePayload> {
    const prompt = [
      "You are an educational flashcard creator.",
      "Generate high-quality flashcards from notebook text.",
      "Keep cards clear, concise, and factual.",
      "Return only question and answer for each flashcard.",
      "",
      `NOTEBOOK:\n${notebookText.slice(0, env.maxExtractedChars)}`,
    ].join("\n");

    return this.generateWithFailover({
      stage: "flashcards",
      prompt,
      schema: flashcardsCorePayloadSchema,
      successMapper: (object) => ({ flashcards: object.flashcards.length }),
    });
  }

  public async enrichFlashcardsMetadata(
    notebookText: string,
    flashcards: Array<{ question: string; answer: string }>,
  ): Promise<FlashcardsEnrichmentPayload> {
    const cardsBlock = flashcards
      .map(
        (card, index) =>
          `#${index}\nQ: ${card.question}\nA: ${card.answer}`,
      )
      .join("\n\n");
    const prompt = [
      "You are enriching flashcards metadata for UX.",
      "For each card, return optional metadata using the card index.",
      "Use iconKey only from this exact list: book-open, brain, code, landmark, mountain, users, credit-card, shield-check, chart-bar, database, target, workflow, qrcode, calendar-clock.",
      "Fields: topic, iconKey, visualNeedScore (0..1), imagePrompt, requiresPointer, pointerX, pointerY.",
      "Assign visualNeedScore >= 0.6 only when a visual materially improves understanding (diagram/process/layout/flow/spatial mapping).",
      "For simple factual or definition cards, keep visualNeedScore below 0.6.",
      "If visualNeedScore < 0.6, omit imagePrompt and pointer fields.",
      "If requiresPointer is true, pointerX and pointerY must be percentages 0..100.",
      "",
      `NOTEBOOK:\n${notebookText.slice(0, env.maxExtractedChars)}`,
      "",
      `FLASHCARDS:\n${cardsBlock}`,
    ].join("\n");

    return this.generateWithFailover({
      stage: "flashcards",
      prompt,
      schema: flashcardsEnrichmentPayloadSchema,
      successMapper: (object) => ({ enrichment: object.enrichment.length }),
    });
  }

  public async generateQuizzesFromNotebook(notebookText: string): Promise<QuizzesOnlyPayload> {
    const prompt = [
      "You are an educational quiz generator.",
      "Create multiple-choice quizzes from notebook text.",
      "Each question should test understanding of the notebook content.",
      "correctOption must be a valid zero-based index of options.",
      "",
      `NOTEBOOK:\n${notebookText.slice(0, env.maxExtractedChars)}`,
    ].join("\n");

    return this.generateWithFailover({
      stage: "quizzes",
      prompt,
      schema: quizzesOnlyPayloadSchema,
      successMapper: (object) => ({ quizzes: object.quizzes.length }),
    });
  }

  private async generateWithFailover<T>({
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
    const targets = this.resolveTargetChain();
    const errors: Array<{ provider: ProviderName; model: string; message: string }> = [];

    for (const target of targets) {
      try {
        logger.info("ai.failover.attempt.started", {
          stage,
          provider: target.provider,
          model: target.model,
          attemptTimeoutMs: env.aiProviderAttemptTimeoutMs,
        });
        const model = this.resolveModel(target);
        const { object } = await this.withTimeout(
          generateObject({
            model,
            schema,
            prompt,
            temperature: 0.2,
          }),
          env.aiProviderAttemptTimeoutMs,
          `Provider attempt timed out after ${env.aiProviderAttemptTimeoutMs}ms`,
        );
        logger.info("ai.failover.attempt.completed", {
          stage,
          provider: target.provider,
          model: target.model,
          ...successMapper(object as T),
        });
        return object as T;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown provider error";
        errors.push({ provider: target.provider, model: target.model, message });
        logger.error("ai.failover.attempt.failed", {
          stage,
          provider: target.provider,
          model: target.model,
          message,
          error,
        });
      }
    }

    throw new Error(
      `All AI providers failed for ${stage}: ${errors
        .map((entry) => `${entry.provider}:${entry.model} -> ${entry.message}`)
        .join("; ")}`,
    );
  }

  private resolveTargetChain(): ProviderTarget[] {
    return env.aiProviderOrder.map((provider) => this.resolveTargetByProvider(provider));
  }

  private resolveTargetByProvider(providerRaw: string): ProviderTarget {
    const provider = providerRaw as ProviderName;
    if (!["google", "groq", "openrouter"].includes(provider)) {
      throw new Error(`Invalid AI_PROVIDER_ORDER item: "${providerRaw}".`);
    }
    if (provider === "google") {
      return { provider, model: env.aiGoogleModel };
    }
    if (provider === "groq") {
      return { provider, model: env.aiGroqModel };
    }
    return { provider, model: env.aiOpenRouterModel };
  }

  private resolveModel(target: ProviderTarget) {
    if (target.provider === "google") {
      if (!env.googleGenerativeAiApiKey) {
        throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required for google models");
      }
      const google = createGoogleGenerativeAI({
        apiKey: env.googleGenerativeAiApiKey,
      });
      logger.debug("ai.model.resolve.completed", {
        provider: "google",
        model: target.model,
      });
      return google(target.model);
    }

    if (target.provider === "groq") {
      if (!env.groqApiKey) {
        throw new Error("GROQ_API_KEY is required for groq models");
      }
      const groq = createGroq({ apiKey: env.groqApiKey });
      logger.debug("ai.model.resolve.completed", {
        provider: "groq",
        model: target.model,
      });
      return groq(target.model);
    }

    if (!env.openRouterApiKey) {
      throw new Error("OPENROUTER_API_KEY is required for openrouter models");
    }
    const openrouter = createOpenAICompatible({
      name: "openrouter",
      apiKey: env.openRouterApiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    logger.debug("ai.model.resolve.completed", {
      provider: "openrouter",
      model: target.model,
    });
    return openrouter(target.model);
  }
}
