# 3. Configuration and Environment Variables

All env access goes through `src/config/env.ts`. Anything marked **required** throws at startup if missing.

## Required

- `POCKETBASE_URL` — base URL of the PocketBase instance, e.g. `http://127.0.0.1:8090`.
- `POCKETBASE_SUPERUSER_EMAIL`, `POCKETBASE_SUPERUSER_PASSWORD` — superuser credentials. The backend re-authenticates the superuser at boot (`ensureSuperuserAuth`) so the SDK can read/write all collections regardless of per-collection rules.
- `XAI_API_KEY` — xAI Grok API key.

## Optional (with defaults from `env.ts` and `.env.example`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP listen port. |
| `AI_PROVIDER` | `xai` | Reserved for multi-provider extension. Only `xai` is implemented. |
| `XAI_MODEL` | `grok-4.2` | Text/structured-object model. |
| `XAI_IMAGE_MODEL` | `grok-2-image-1212` | Image model used by the flashcards image sub-pipeline. |
| `MAX_UPLOAD_SIZE_BYTES` | `20971520` (20 MB) | Per-file upload cap. |
| `MAX_EXTRACTED_CHARS` | `200000` | Truncation cap for both per-file extracted text and the joined source string sent to the LLM. |
| `AI_PROVIDER_ATTEMPT_TIMEOUT_MS` | `600000` (10 min) | Hard ceiling on a single `generateText` call inside `XaiProvider`. |
| `AI_STAGE_TIMEOUT_MS` | `900000` (15 min) | Outer timeout around the whole text-generation stage (`runWithStageTimeout`). |
| `AI_IMAGE_TIMEOUT_MS` | `60000` | Per-image generation timeout. |
| `AI_IMAGE_CONCURRENCY` | `4` | Parallel image workers when generating card illustrations. |
| `AI_MAX_OUTPUT_TOKENS` | `2000000` | `maxOutputTokens` passed to the AI SDK. |
| `FRONTEND_BASE_URLS` | `http://localhost:3001,http://localhost:5173` | Comma-separated CORS allowlist. |

## CORS

Single source of truth: `FRONTEND_BASE_URLS`. Parsed CSV → `env.frontendBaseUrls`. Applied as:

```
origin: env.frontendBaseUrls
methods: GET, POST, PATCH, DELETE, OPTIONS
credentials: true
```

## Example `.env`

```dotenv
PORT=3000
POCKETBASE_URL=http://127.0.0.1:8090
POCKETBASE_SUPERUSER_EMAIL=admin@example.com
POCKETBASE_SUPERUSER_PASSWORD=changeme

AI_PROVIDER=xai
XAI_API_KEY=xai-...
XAI_MODEL=grok-4.2
XAI_IMAGE_MODEL=grok-2-image-1212

MAX_UPLOAD_SIZE_BYTES=20971520
MAX_EXTRACTED_CHARS=200000
AI_PROVIDER_ATTEMPT_TIMEOUT_MS=600000
AI_STAGE_TIMEOUT_MS=900000
AI_IMAGE_TIMEOUT_MS=60000
AI_IMAGE_CONCURRENCY=4
AI_MAX_OUTPUT_TOKENS=2000000

FRONTEND_BASE_URLS=http://localhost:3001
```

## Operational notes

- Never commit real keys. The superuser credentials in particular grant unrestricted DB access.
- The upload rate limit (8/min per user) lives in-process inside `src/controllers/auth.ts`; running multiple backend replicas means each enforces its own bucket.
- The xAI defaults assume a long-running, large-output use case (≥40 cards or ≥30 questions per call). If you reduce `AI_MAX_OUTPUT_TOKENS` aggressively the LLM will truncate and the stage will fail validation.
