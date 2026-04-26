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

const frontendBaseUrls = parseOrigins(
  Bun.env.FRONTEND_BASE_URLS ?? "http://localhost:3001,http://localhost:5173",
);

export const env = {
  port: Number(Bun.env.PORT ?? 3000),
  pocketbaseUrl: requireEnv("POCKETBASE_URL"),
  pocketbaseSuperuserEmail: requireEnv("POCKETBASE_SUPERUSER_EMAIL"),
  pocketbaseSuperuserPassword: requireEnv("POCKETBASE_SUPERUSER_PASSWORD"),
  aiProvider: Bun.env.AI_PROVIDER ?? "xai",
  xaiApiKey: requireEnv("XAI_API_KEY"),
  xaiModel: Bun.env.XAI_MODEL ?? "grok-4.2",
  xaiImageModel: Bun.env.XAI_IMAGE_MODEL ?? "grok-2-image-1212",
  maxUploadSizeBytes: Number(Bun.env.MAX_UPLOAD_SIZE_BYTES ?? 20 * 1024 * 1024),
  maxExtractedChars: Number(Bun.env.MAX_EXTRACTED_CHARS ?? 200_000),
  aiProviderAttemptTimeoutMs: Number(Bun.env.AI_PROVIDER_ATTEMPT_TIMEOUT_MS ?? 600_000),
  aiStageTimeoutMs: Number(Bun.env.AI_STAGE_TIMEOUT_MS ?? 900_000),
  aiImageTimeoutMs: Number(Bun.env.AI_IMAGE_TIMEOUT_MS ?? 60_000),
  aiImageConcurrency: Number(Bun.env.AI_IMAGE_CONCURRENCY ?? 4),
  aiMaxOutputTokens: Number(Bun.env.AI_MAX_OUTPUT_TOKENS ?? 2_000_000),
  frontendBaseUrls,
};
