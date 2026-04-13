import type { ZodTypeAny } from "zod";

export type LLMStage = "notebook" | "flashcards" | "quizzes";

export interface ILLMProvider {
  readonly name: string;
  readonly model: string;
  generateObject<T>(input: {
    stage: LLMStage;
    schema: ZodTypeAny;
    prompt: string;
  }): Promise<T>;
}
