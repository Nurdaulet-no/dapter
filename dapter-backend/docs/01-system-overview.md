# 1. System Overview

## Purpose

**Dapter API** is a backend service that converts unstructured educational files (PDF/PPTX) into structured learning artifacts:

- Notes
- Flashcards
- Quizzes

## Key Goals

- Asynchronous and resilient document processing
- Strict layer isolation (Controllers / Services / Repositories)
- Source files stored in PocketBase file storage
- Strict validation of AI output structure before persistence
- OpenAI-only AI runtime
- Secure multi-tenant access model (each user sees only own data)

## High-Level Flow

1. User authenticates in PocketBase.
2. Client sends PocketBase Bearer token to protected `/documents/*` endpoints.
3. User uploads file.
4. Backend validates MIME/size/page limits and uploads file to PocketBase storage collection.
5. `Document` record is created with `PROCESSING` and `userId`.
6. Background process extracts text and generates artifacts with OpenAI.
7. Artifacts are persisted; status becomes `COMPLETED` (or `FAILED`).
8. User retrieves own progress and artifacts via polling endpoints.
