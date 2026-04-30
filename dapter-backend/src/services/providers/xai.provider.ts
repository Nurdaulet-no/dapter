import { createXai } from "@ai-sdk/xai";
import { Output, experimental_generateImage as generateImage, generateText } from "ai";
import type { ZodType } from "zod";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import type { GeneratedImage, ILLMProvider, LLMStage } from "./provider.interface";

export class XaiProvider implements ILLMProvider {
  public readonly name = "xai";
  public readonly model: string;
  public readonly imageModel: string;
  private readonly xai;

  public constructor(input: { apiKey: string; model: string; imageModel: string }) {
    this.model = input.model;
    this.imageModel = input.imageModel;
    this.xai = createXai({ apiKey: input.apiKey });
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
    });
  }

  public async generateObject<T>(input: {
    stage: LLMStage;
    schema: ZodType;
    prompt: string;
  }): Promise<T> {
    try {
      logger.info("ai.provider.attempt.started", {
        stage: input.stage,
        provider: this.name,
        model: this.model,
        attemptTimeoutMs: env.aiProviderAttemptTimeoutMs,
        maxOutputTokens: env.aiMaxOutputTokens,
      });

      const { output } = await this.withTimeout(
        generateText({
          model: this.xai(this.model),
          output: Output.object({ schema: input.schema }),
          prompt: input.prompt,
          temperature: 0.3,
          maxOutputTokens: env.aiMaxOutputTokens,
        }),
        env.aiProviderAttemptTimeoutMs,
        `xAI attempt timed out after ${env.aiProviderAttemptTimeoutMs}ms`,
      );

      logger.info("ai.provider.attempt.completed", {
        stage: input.stage,
        provider: this.name,
        model: this.model,
      });

      if (output === undefined) {
        throw new Error("xAI returned no structured output");
      }
      return output as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown xAI error";
      logger.error("ai.provider.attempt.failed", {
        stage: input.stage,
        provider: this.name,
        model: this.model,
        message,
        error,
      });
      throw new Error(`xAI failed for ${input.stage}: ${message}`);
    }
  }

  public async generateText(input: { stage: LLMStage; prompt: string }): Promise<string> {
    try {
      logger.info("ai.provider.text.attempt.started", {
        stage: input.stage,
        provider: this.name,
        model: this.model,
        attemptTimeoutMs: env.aiProviderAttemptTimeoutMs,
        maxOutputTokens: env.aiMaxOutputTokens,
      });

      const { text } = await this.withTimeout(
        generateText({
          model: this.xai(this.model),
          prompt: input.prompt,
          temperature: 0.3,
          maxOutputTokens: env.aiMaxOutputTokens,
        }),
        env.aiProviderAttemptTimeoutMs,
        `xAI text attempt timed out after ${env.aiProviderAttemptTimeoutMs}ms`,
      );

      logger.info("ai.provider.text.attempt.completed", {
        stage: input.stage,
        provider: this.name,
        model: this.model,
        length: text?.length ?? 0,
      });

      if (!text || text.trim().length === 0) {
        throw new Error("xAI returned empty text");
      }
      return text;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown xAI error";
      logger.error("ai.provider.text.attempt.failed", {
        stage: input.stage,
        provider: this.name,
        model: this.model,
        message,
        error,
      });
      throw new Error(`xAI text failed for ${input.stage}: ${message}`);
    }
  }

  public async generateImage(input: { prompt: string }): Promise<GeneratedImage> {
    const startedAt = Date.now();
    try {
      const result = await this.withTimeout(
        generateImage({
          model: this.xai.image(this.imageModel),
          prompt: input.prompt,
        }),
        env.aiImageTimeoutMs,
        `xAI image generation timed out after ${env.aiImageTimeoutMs}ms`,
      );
      logger.info("ai.image.generated", {
        provider: this.name,
        model: this.imageModel,
        durationMs: Date.now() - startedAt,
        bytes: result.image.uint8Array.byteLength,
      });
      return {
        bytes: result.image.uint8Array,
        mediaType: result.image.mediaType ?? "image/png",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown image error";
      logger.error("ai.image.failed", {
        provider: this.name,
        model: this.imageModel,
        durationMs: Date.now() - startedAt,
        message,
      });
      throw error instanceof Error ? error : new Error(message);
    }
  }
}
