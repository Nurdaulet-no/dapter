import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { llmPayloadSchema, type LlmPayload } from "../schemas/document.schema";

export interface IAIService {
  generateLearningArtifacts(text: string): Promise<LlmPayload>;
}

type ProviderName = "google" | "groq" | "openrouter";

interface ProviderTarget {
  provider: ProviderName;
  model: string;
}

export class AIService implements IAIService {
  public async generateLearningArtifacts(text: string): Promise<LlmPayload> {
    logger.info("ai.generation.started", {
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
      "Create concise notes, flashcards and quizzes from the source text.",
      "Keep output factual and aligned to source material only.",
      "For quizzes, correctOption must be valid zero-based index of options.",
      "",
      `SOURCE:\n${text.slice(0, 30_000)}`,
    ].join("\n");

    const targets = this.resolveTargetChain();
    const errors: Array<{ provider: ProviderName; model: string; message: string }> = [];

    for (const target of targets) {
      try {
        logger.info("ai.failover.attempt.started", {
          provider: target.provider,
          model: target.model,
        });
        const model = this.resolveModel(target);
        const { object } = await generateObject({
          model,
          schema: llmPayloadSchema,
          prompt,
          temperature: 0.2,
        });
        logger.info("ai.failover.attempt.completed", {
          provider: target.provider,
          model: target.model,
          notes: object.notes.length,
          flashcards: object.flashcards.length,
          quizzes: object.quizzes.length,
        });
        return object;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown provider error";
        errors.push({ provider: target.provider, model: target.model, message });
        logger.error("ai.failover.attempt.failed", {
          provider: target.provider,
          model: target.model,
          message,
          error,
        });
      }
    }

    throw new Error(
      `All AI providers failed: ${errors
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
