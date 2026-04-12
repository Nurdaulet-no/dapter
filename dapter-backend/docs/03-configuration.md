# 3. Configuration and Environment Variables

Primary config is loaded in `src/config/env.ts`.

## Required variables (startup fails if missing)

- `POCKETBASE_URL`
- `OPENAI_API_KEY`

## Optional variables and defaults

- `PORT` (default `3000`)
- `OPENAI_MODEL` (default `gpt-4.1-mini`)
- `MAX_UPLOAD_SIZE_BYTES` (default `20971520`)
- `MAX_EXTRACTED_CHARS` (default `30000`)
- `AI_PROVIDER_ATTEMPT_TIMEOUT_MS` (default `25000`)
- `AI_STAGE_TIMEOUT_MS` (default `120000`)
- `FRONTEND_BASE_URLS` (default `http://localhost:3001`; comma-separated CORS allowlist)

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

## Security-sensitive env guidance

1. Never commit real secrets into Git (OpenAI key, PocketBase admin credentials, user tokens).
2. Rotate all compromised keys immediately.
3. Use different keys per environment (`dev/staging/prod`).
4. In production, run over HTTPS (`Secure` cookie flag is enabled in production mode).

## Example `.env` for local development

```dotenv
PORT=3000
POCKETBASE_URL=http://127.0.0.1:8090
OPENAI_API_KEY=<openai-api-key>
OPENAI_MODEL=gpt-4.1-mini

MAX_UPLOAD_SIZE_BYTES=20971520
MAX_EXTRACTED_CHARS=30000
AI_PROVIDER_ATTEMPT_TIMEOUT_MS=25000
AI_STAGE_TIMEOUT_MS=120000

FRONTEND_BASE_URLS=http://localhost:3001
```
