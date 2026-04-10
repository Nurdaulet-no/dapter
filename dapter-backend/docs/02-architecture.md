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
│   ├── types/
│   └── index.ts
├── scripts/
│   └── e2e-endpoints.ts
├── .env
├── .env.example
├── docker-compose.yml
├── README.md
└── TESTING.md
```
