# 1. System Overview

## Purpose

**Dapter API** is a backend service that converts unstructured educational files (PDF/PPTX) into structured learning artifacts:

- Notes
- Flashcards
- Quizzes

## Key Goals

- Asynchronous and resilient document processing
- Strict layer isolation (Controllers / Services / Repositories)
- Source files stored only in S3-compatible storage
- Strict validation of AI output structure before persistence
- Built-in readiness for AI provider failover

## High-Level Flow

1. The client uploads a file.
2. The backend validates the file and uploads it to blob storage.
3. A `Document` record is created with `PROCESSING` status.
4. A background process downloads the file, extracts text, and calls AI.
5. Generated artifacts are validated and persisted.
6. Document status is updated to `COMPLETED` (or `FAILED`).
7. The client retrieves progress/results via polling endpoints.
