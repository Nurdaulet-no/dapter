# 3. Configuration and Environment Variables

Primary configuration is loaded from `.env` via `src/config/env.ts`.

## Required Variables

- `DATABASE_URL`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

## Optional / Recommended

- `PORT` (default: `3000`)
- `S3_ENDPOINT` (for R2/MinIO/Supabase Storage, etc.)
- `MAX_UPLOAD_SIZE_BYTES` (default: `20971520`)

## AI Providers

Keys:

- `GOOGLE_GENERATIVE_AI_API_KEY`
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`

Failover order:

- `AI_PROVIDER_ORDER=google,groq,openrouter`

Per-provider models:

- `AI_MODEL_GOOGLE`
- `AI_MODEL_GROQ`
- `AI_MODEL_OPENROUTER`

## Local `.env` Example

```dotenv
PORT=3000
DATABASE_URL="postgresql://postgres:password@localhost:5432/dapter_local"

S3_REGION=auto
S3_BUCKET=dapter-documents
S3_ENDPOINT=https://<your-r2-endpoint>
S3_ACCESS_KEY_ID=<your-access-key-id>
S3_SECRET_ACCESS_KEY=<your-secret-access-key>

GOOGLE_GENERATIVE_AI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
AI_PROVIDER_ORDER=google,groq,openrouter
AI_MODEL_GOOGLE=gemini-2.0-flash
AI_MODEL_GROQ=llama-3.3-70b-versatile
AI_MODEL_OPENROUTER=meta-llama/llama-3.3-70b-instruct:free

MAX_UPLOAD_SIZE_BYTES=20971520
```
