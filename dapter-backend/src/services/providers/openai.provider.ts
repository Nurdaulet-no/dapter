import { createOpenAI } from "@ai-sdk/openai";
import { Output, generateText } from "ai";
import type { ZodTypeAny } from "zod";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import type { ILLMProvider, LLMStage } from "./provider.interface";

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
    schema: ZodTypeAny;
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

  public async generateImageUrls(input: { prompt: string }): Promise<string[]> {
    const encoded = encodeURIComponent(input.prompt.slice(0, 200));
    return [`https://images.example.local/generated/${encoded}`];
  }
}
