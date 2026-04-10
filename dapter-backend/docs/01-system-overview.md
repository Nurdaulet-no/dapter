# 1. System Overview

## Purpose

**Dapter API** is a backend service that converts unstructured educational files (PDF/PPTX) into structured learning artifacts:

- Notes
- Flashcards
- Quizzes

The service now includes full authentication and user-level isolation:

- JWT auth (register/login/refresh/logout)
- Google OAuth2 login flow
- Protected document routes
- Ownership checks per document

## Key Goals

- Asynchronous and resilient document processing
- Strict layer isolation (Controllers / Services / Repositories)
- Source files stored only in S3-compatible storage
- Strict validation of AI output structure before persistence
- Built-in readiness for AI provider failover
- Secure multi-tenant access model (each user sees only own data)

## High-Level Flow

1. User authenticates with email/password or Google OAuth.
2. Client sends Bearer token to protected `/documents/*` endpoints.
3. User uploads file.
4. Backend validates MIME/size and uploads file to blob storage.
5. `Document` record is created with `PROCESSING` and `userId`.
6. Background process extracts text and generates artifacts with AI failover.
7. Artifacts are persisted; status becomes `COMPLETED` (or `FAILED`).
8. User retrieves own progress and artifacts via polling endpoints.
