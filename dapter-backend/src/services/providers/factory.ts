import { env } from "../../config/env";
import type { ILLMProvider } from "./provider.interface";
import { OpenAIProvider } from "./openai.provider";

export const createLLMProvider = (): ILLMProvider => {
  return new OpenAIProvider({
    apiKey: env.openaiApiKey,
    model: env.openaiModel,
    imageModel: env.openaiImageModel,
  });
};
