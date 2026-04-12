# 3. Configuration and Environment Variables

Primary config is loaded in `src/config/env.ts`.

## Required variables (startup fails if missing)

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

## Optional variables and defaults

- `PORT` (default `3000`)
- `S3_ENDPOINT` (optional; required for non-AWS S3-compatible providers)
- `GOOGLE_GENERATIVE_AI_API_KEY` (required only if Google is in provider chain)
- `GROQ_API_KEY` (required only if Groq is in provider chain)
- `OPENROUTER_API_KEY` (required only if OpenRouter is in provider chain)
- `AI_PROVIDER_ORDER` (default `google,groq,openrouter`)
- `AI_MODEL_GOOGLE` (default `gemini-2.0-flash`)
- `AI_MODEL_GROQ` (default `llama-3.3-70b-versatile`)
- `AI_MODEL_OPENROUTER` (default `meta-llama/llama-3.3-70b-instruct:free`)
- `MAX_UPLOAD_SIZE_BYTES` (default `20971520`)
- `MAX_SELECTED_PAGES` (default `40`)
- `MAX_EXTRACTED_CHARS` (default `30000`)
- `AI_PROVIDER_ATTEMPT_TIMEOUT_MS` (default `25000`)
- `AI_STAGE_TIMEOUT_MS` (default `120000`)
- `FLASHCARD_IMAGE_QUEUE_INTERVAL_SECONDS` (default `20`)
- `FLASHCARD_IMAGE_QUEUE_BATCH_SIZE` (default `10`)
- `FRONTEND_BASE_URLS` (default `http://localhost:3001`; comma-separated CORS allowlist)
- `TRASH_RETENTION_DAYS` (default `7`)
- `TRASH_CLEANUP_INTERVAL_MINUTES` (default `10`)
- `TRASH_CLEANUP_BATCH_SIZE` (default `50`)

## CORS configuration (single source of truth)

The backend now uses **only one** CORS env variable:

- `FRONTEND_BASE_URLS`

Format:

```dotenv
FRONTEND_BASE_URLS=http://localhost:3001,https://your-frontend.ngrok-free.app
```

How it is applied:

- Parsed as CSV into `env.frontendBaseUrls`
- Used by Elysia CORS plugin:
  - `origin: env.frontendBaseUrls`
  - `credentials: true`
  - methods: `GET, POST, PATCH, DELETE, OPTIONS`

OAuth redirect base URL:

- `auth.controller.ts` uses `env.frontendBaseUrl`, which is derived as the **first** value of `FRONTEND_BASE_URLS`.
- Put your canonical frontend domain first in `FRONTEND_BASE_URLS`.

## Security-sensitive env guidance

1. Never commit real secrets into Git (`JWT_*`, OAuth secrets, API keys, S3 secrets).
2. Rotate all compromised keys immediately.
3. Use different keys per environment (`dev/staging/prod`).
4. In production, run over HTTPS (`Secure` cookie flag is enabled in production mode).

## Example `.env` for local development

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
AI_MODEL_GOOGLE=gemini-2.5-flash
AI_MODEL_GROQ=llama-3.1-8b-instant
AI_MODEL_OPENROUTER=meta-llama/llama-3.3-70b-instruct:free

MAX_UPLOAD_SIZE_BYTES=20971520
MAX_SELECTED_PAGES=40
MAX_EXTRACTED_CHARS=30000
AI_PROVIDER_ATTEMPT_TIMEOUT_MS=25000
AI_STAGE_TIMEOUT_MS=120000
FLASHCARD_IMAGE_QUEUE_INTERVAL_SECONDS=20
FLASHCARD_IMAGE_QUEUE_BATCH_SIZE=10

JWT_SECRET=<strong-random-secret>
JWT_REFRESH_SECRET=<strong-random-secret>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
FRONTEND_BASE_URLS=http://localhost:3001

TRASH_RETENTION_DAYS=7
TRASH_CLEANUP_INTERVAL_MINUTES=10
TRASH_CLEANUP_BATCH_SIZE=50
```
