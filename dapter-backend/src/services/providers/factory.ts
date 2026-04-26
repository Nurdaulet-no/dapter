import { env } from "../../config/env";
import type { ILLMProvider } from "./provider.interface";
import { XaiProvider } from "./xai.provider";

export const createLLMProvider = (): ILLMProvider => {
  return new XaiProvider({
    apiKey: env.xaiApiKey,
    model: env.xaiModel,
    imageModel: env.xaiImageModel,
  });
};
