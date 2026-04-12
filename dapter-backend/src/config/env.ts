const requireEnv = (key: string): string => {
  const value = Bun.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const parseOrigins = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const frontendBaseUrls = parseOrigins(Bun.env.FRONTEND_BASE_URLS ?? "http://localhost:3001");

export const env = {
  port: Number(Bun.env.PORT ?? 3000),
  pocketbaseUrl: requireEnv("POCKETBASE_URL"),
  openaiApiKey: requireEnv("OPENAI_API_KEY"),
  openaiModel: Bun.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  maxUploadSizeBytes: Number(Bun.env.MAX_UPLOAD_SIZE_BYTES ?? 20 * 1024 * 1024),
  maxExtractedChars: Number(Bun.env.MAX_EXTRACTED_CHARS ?? 30_000),
  aiProviderAttemptTimeoutMs: Number(Bun.env.AI_PROVIDER_ATTEMPT_TIMEOUT_MS ?? 25_000),
  aiStageTimeoutMs: Number(Bun.env.AI_STAGE_TIMEOUT_MS ?? 120_000),
  frontendBaseUrls,
};
