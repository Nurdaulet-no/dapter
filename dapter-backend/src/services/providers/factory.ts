import { env } from "../../config/env";
import type { ILLMProvider } from "./provider.interface";
import { OpenAIProvider } from "./openai.provider";

export const createLLMProvider = (): ILLMProvider => {
  const provider = env.aiProvider;

  if (provider === "openai") {
    return new OpenAIProvider({
      apiKey: env.openaiApiKey,
      model: env.openaiModel,
    });
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
};
