# 1. System Overview

## Purpose

**Dapter API** converts unstructured educational files (PDF, PPTX, and TXT) into structured learning artifacts:

- Notes
- Flashcard decks/cards
- Quizzes/questions

## Key Goals

- Asynchronous and resilient document processing
- Strict layer isolation (Controllers / Services / Repositories)
- Source files and data stored in PocketBase
- Strict validation of AI output structure before persistence
- Provider-extensible AI runtime via adapter abstraction
- Secure multi-tenant access model (each user sees only own data)

## High-Level Flow

1. User authenticates in PocketBase.
2. Client sends PocketBase Bearer token to protected `/documents/*` endpoints.
3. User uploads file.
4. Backend validates MIME/size and uploads file to PocketBase storage.
5. `Document` record is created with `PROCESSING` and owner relation.
6. Background process extracts text and runs AI stages.
7. Artifacts are persisted; status becomes `COMPLETED` (or `FAILED`).
8. User retrieves progress and artifacts via polling endpoints.
