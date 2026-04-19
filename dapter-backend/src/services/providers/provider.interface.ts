import type { ZodType } from "zod";

export type LLMStage = "notebook" | "flashcards" | "quizzes";

export interface GeneratedImage {
  bytes: Uint8Array;
  mediaType: string;
}

export interface ILLMProvider {
  readonly name: string;
  readonly model: string;
  generateObject<T>(input: {
    stage: LLMStage;
    schema: ZodType;
    prompt: string;
  }): Promise<T>;
  generateImage(input: { prompt: string }): Promise<GeneratedImage>;
}
