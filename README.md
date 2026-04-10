# Dapter Project

## Project Description

Dapter is an automated backend system that transforms unstructured educational materials (PDF documents and PPTX presentations) into structured micro-learning content: notes, flashcards, and quizzes.

The platform is built around an asynchronous data pipeline designed for reliability and clean architecture boundaries. Uploaded files are stored in S3-compatible object storage, processed in background steps, and enriched with LLM-generated learning artifacts validated by strict schemas before persistence.

## Core Workflow

1. Upload a PDF/PPTX document via API.
2. Validate file type/size and upload directly to object storage.
3. Register the document in PostgreSQL with `PROCESSING` status.
4. Extract text from the stored file.
5. Generate notes, flashcards, and quizzes using AI with provider failover.
6. Persist generated artifacts in the database and mark the document as `COMPLETED`.
7. Retrieve status and final content via polling endpoint.

## Technologies Used

- **Runtime:** Bun
- **Language:** TypeScript (strict mode)
- **Web Framework:** ElysiaJS
- **Validation:** Elysia `t` schemas + Zod (for structured AI outputs)
- **Database:** PostgreSQL
- **ORM:** Prisma
- **File Storage:** S3-compatible storage
- **AI SDK:** Vercel AI SDK
- **AI Providers (failover chain):**
  - Google AI Studio (Gemini)
  - Groq (Llama models)
  - OpenRouter (free model routes)
- **API Documentation:** Swagger (`@elysiajs/swagger`)
- **Containerization:** Docker / Docker Compose (local PostgreSQL)

## Architecture

The backend follows a layered architecture:

- **Controllers:** HTTP handling and request/response validation.
- **Services:** Business logic (pipeline orchestration, extraction, AI generation).
- **Repositories:** Isolated database access via Prisma.
- **Schemas:** Input/output contracts and LLM output validation.
