# 2. Architecture and Project Structure

## Technology Stack

- Runtime: **Bun**
- Language: **TypeScript (strict)**
- HTTP framework: **ElysiaJS**
- ORM: **Prisma**
- DB: **PostgreSQL**
- Storage: **S3-compatible**
- AI orchestration: **Vercel AI SDK**
- AI providers: **Google / Groq / OpenRouter** (failover chain)
- Auth: **JWT + Refresh tokens + Google OAuth (Arctic)**

## Layers

### Controllers (`src/controllers`)
- Accept HTTP requests
- Validate input/output
- Call the service layer
- Contain no business logic
- `auth.controller.ts`: register/login/refresh/logout/google flows
- `document.controller.ts`: protected document endpoints and ownership checks

### Services (`src/services`)
- Orchestrate the processing pipeline
- Handle storage, extraction, and AI operations
- Do not depend on HTTP context
- `auth.service.ts`: password auth, refresh rotation, revoke, OAuth callback
- `document.service.ts`: staged document pipeline orchestration, ownership checks, retry, trash cleanup helpers
- `ai.service.ts`: schema-first AI generation with provider failover
- `extraction.service.ts`: PDF/PPTX extraction with selected pages handling
- `storage.service.ts`: S3-compatible upload/download/delete

### Jobs (`src/jobs`)
- `trash-retention.job.ts`: periodic permanent cleanup for expired trash
- `flashcard-image-queue.job.ts`: periodic queued flashcard image processing scaffold

### Repositories (`src/repositories`)
- Isolated database access via Prisma
- Entity read/write methods
- `auth.repository.ts`: user/session storage
- `document.repository.ts`: user-scoped document queries

### Schemas (`src/schemas`)
- API response schemas (Elysia `t`)
- AI payload schemas (Zod)

### Config (`src/config`)
- `env.ts`: environment variables
- `prisma.ts`: Prisma client
- `s3.ts`: S3 client
- `logger.ts`: structured logging

## Project Tree (Current)

```text
dapter-backend/
├── docs/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── config/
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   └── document.controller.ts
│   ├── errors/
│   ├── repositories/
│   │   ├── auth.repository.ts
│   │   └── document.repository.ts
│   ├── schemas/
│   │   ├── auth.schema.ts
│   │   └── document.schema.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── document.service.ts
│   │   ├── extraction.service.ts
│   │   ├── storage.service.ts
│   │   └── ai.service.ts
│   ├── jobs/
│   │   ├── trash-retention.job.ts
│   │   └── flashcard-image-queue.job.ts
│   ├── types/
│   └── index.ts
├── scripts/
│   ├── e2e-endpoints.ts
│   └── test-selected-pages-extract.ts
├── .env
├── .env.example
├── docker-compose.yml
├── BACKEND_AI_INSTRUCTION.md
├── README.md
└── TESTING.md
```
