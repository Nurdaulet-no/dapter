import { createOpenAI } from "@ai-sdk/openai";
import { Output, experimental_generateImage as generateImage, generateText } from "ai";
import type { ZodType } from "zod";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import type { GeneratedImage, ILLMProvider, LLMStage } from "./provider.interface";

export class OpenAIProvider implements ILLMProvider {
  public readonly name = "openai";
  public readonly model: string;
  public readonly imageModel: string;
  private readonly openai;

  public constructor(input: { apiKey: string; model: string; imageModel: string }) {
    this.model = input.model;
    this.imageModel = input.imageModel;
    this.openai = createOpenAI({ apiKey: input.apiKey });
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
      });

      const { output } = await this.withTimeout(
        generateText({
          model: this.openai(this.model),
          output: Output.object({ schema: input.schema }),
          prompt: input.prompt,
          temperature: 0.2,
        }),
        env.aiProviderAttemptTimeoutMs,
        `OpenAI attempt timed out after ${env.aiProviderAttemptTimeoutMs}ms`,
      );

      logger.info("ai.provider.attempt.completed", {
        stage: input.stage,
        provider: this.name,
        model: this.model,
      });

      if (output === undefined) {
        throw new Error("OpenAI returned no structured output");
      }
      return output as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown OpenAI error";
      logger.error("ai.provider.attempt.failed", {
        stage: input.stage,
        provider: this.name,
        model: this.model,
        message,
        error,
      });
      throw new Error(`OpenAI failed for ${input.stage}: ${message}`);
    }
  }

  public async generateImage(input: { prompt: string }): Promise<GeneratedImage> {
    const startedAt = Date.now();
    try {
      const result = await this.withTimeout(
        generateImage({
          model: this.openai.image(this.imageModel),
          prompt: input.prompt,
          size: "1024x1024",
          providerOptions: { openai: { quality: "low" } },
        }),
        env.aiImageTimeoutMs,
        `OpenAI image generation timed out after ${env.aiImageTimeoutMs}ms`,
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
