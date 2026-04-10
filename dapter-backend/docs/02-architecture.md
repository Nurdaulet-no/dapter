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

## Layers

### Controllers (`src/controllers`)
- Accept HTTP requests
- Validate input/output
- Call the service layer
- Contain no business logic

### Services (`src/services`)
- Orchestrate the processing pipeline
- Handle storage, extraction, and AI operations
- Do not depend on HTTP context

### Repositories (`src/repositories`)
- Isolated database access via Prisma
- Entity read/write methods

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
│   └── schema.prisma
├── src/
│   ├── config/
│   ├── controllers/
│   ├── repositories/
│   ├── schemas/
│   ├── services/
│   ├── types/
│   └── index.ts
├── .env
├── .env.example
├── docker-compose.yml
├── README.md
└── TESTING.md
```
