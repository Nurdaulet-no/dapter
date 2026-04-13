# 2. Architecture and Project Structure

## Technology Stack

- Runtime: **Bun**
- Language: **TypeScript (strict)**
- HTTP framework: **ElysiaJS**
- Data/Auth/Storage: **PocketBase**
- AI orchestration: **Vercel AI SDK**
- AI provider: **OpenAI**
- Auth: **PocketBase token verification**

## Layers

### Controllers (`src/controllers`)
- Accept HTTP requests
- Validate input/output
- Call the service layer
- Contain no business logic
- `document.controller.ts`: protected document endpoints and ownership checks

### Services (`src/services`)
- Orchestrate the processing pipeline
- Handle storage, extraction, and AI operations
- Do not depend on HTTP context
- `document.service.ts`: staged document pipeline orchestration, ownership checks, retry
- `ai.service.ts`: schema-first AI generation via provider abstraction
- `extraction.service.ts`: PDF/PPTX full-text extraction
- `storage.service.ts`: PocketBase upload/download/delete

### Repositories (`src/repositories`)
- Isolated data access behind repository interfaces
- Entity read/write methods
- `pocketbase-document.repository.ts`: document/notes/flashcards/quizzes via PocketBase

### Schemas (`src/schemas`)
- API response schemas (Elysia `t`)
- AI payload schemas (Zod)

### Config (`src/config`)
- `env.ts`: environment variables
- `pocketbase.ts`: PocketBase client
- `pocketbase-schema.ts`: schema contract mapping for PocketBase collections
- `logger.ts`: structured logging

## Project Tree (Current)

```text
dapter-backend/
├── docs/
├── prompts/
│   ├── notebook.system.ts
│   ├── flashcards.system.ts
│   └── quizzes.system.ts
├── src/
│   ├── config/
│   ├── controllers/
│   │   └── document.controller.ts
│   ├── errors/
│   ├── repositories/
│   │   ├── document.repository.ts
│   │   └── pocketbase-document.repository.ts
│   ├── schemas/
│   │   └── document.schema.ts
│   ├── services/
│   │   ├── document.service.ts
│   │   ├── extraction.service.ts
│   │   ├── providers/
│   │   ├── storage.service.ts
│   │   └── ai.service.ts
│   ├── types/
│   └── index.ts
├── scripts/
│   └── e2e-endpoints.ts
├── .env
├── .env.example
├── BACKEND_AI_INSTRUCTION.md
├── README.md
└── TESTING.md
```
