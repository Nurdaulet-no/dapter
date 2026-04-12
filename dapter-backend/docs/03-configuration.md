# 3. Configuration and Environment Variables

Primary configuration is loaded from `.env` via `src/config/env.ts`.

## Required Variables

- `DATABASE_URL`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

## Optional / Recommended

- `PORT` (default: `3000`)
- `S3_ENDPOINT` (for R2/MinIO/Supabase Storage, etc.)
- `MAX_UPLOAD_SIZE_BYTES` (default: `20971520`)
- `MAX_SELECTED_PAGES` (default: `40`)
- `MAX_EXTRACTED_CHARS` (default: `30000`)
- `AI_PROVIDER_ATTEMPT_TIMEOUT_MS` (default: `25000`)
- `AI_STAGE_TIMEOUT_MS` (default: `120000`)
- `TRASH_RETENTION_DAYS` (default: `7`)
- `TRASH_CLEANUP_INTERVAL_MINUTES` (default: `10`)
- `TRASH_CLEANUP_BATCH_SIZE` (default: `50`)
- `FLASHCARD_IMAGE_QUEUE_INTERVAL_SECONDS` (default: `20`)
- `FLASHCARD_IMAGE_QUEUE_BATCH_SIZE` (default: `10`)

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
MAX_SELECTED_PAGES=40
MAX_EXTRACTED_CHARS=30000
AI_PROVIDER_ATTEMPT_TIMEOUT_MS=25000
AI_STAGE_TIMEOUT_MS=120000
TRASH_RETENTION_DAYS=7
TRASH_CLEANUP_INTERVAL_MINUTES=10
TRASH_CLEANUP_BATCH_SIZE=50
FLASHCARD_IMAGE_QUEUE_INTERVAL_SECONDS=20
FLASHCARD_IMAGE_QUEUE_BATCH_SIZE=10

JWT_SECRET=<strong-random-secret>
JWT_REFRESH_SECRET=<strong-random-secret>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```
