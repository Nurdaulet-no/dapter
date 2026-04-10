const requireEnv = (key: string): string => {
  const value = Bun.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const env = {
  port: Number(Bun.env.PORT ?? 3000),
  databaseUrl: requireEnv("DATABASE_URL"),
  s3Region: requireEnv("S3_REGION"),
  s3Bucket: requireEnv("S3_BUCKET"),
  s3Endpoint: Bun.env.S3_ENDPOINT,
  s3AccessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
  s3SecretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
  googleGenerativeAiApiKey: Bun.env.GOOGLE_GENERATIVE_AI_API_KEY,
  groqApiKey: Bun.env.GROQ_API_KEY,
  openRouterApiKey: Bun.env.OPENROUTER_API_KEY,
  aiProviderOrder: (Bun.env.AI_PROVIDER_ORDER ?? "google,groq,openrouter")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  aiGoogleModel: Bun.env.AI_MODEL_GOOGLE ?? "gemini-2.0-flash",
  aiGroqModel: Bun.env.AI_MODEL_GROQ ?? "llama-3.3-70b-versatile",
  aiOpenRouterModel: Bun.env.AI_MODEL_OPENROUTER ?? "meta-llama/llama-3.3-70b-instruct:free",
  maxUploadSizeBytes: Number(Bun.env.MAX_UPLOAD_SIZE_BYTES ?? 20 * 1024 * 1024),
};
