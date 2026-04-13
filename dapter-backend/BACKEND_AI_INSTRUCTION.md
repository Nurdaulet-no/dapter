# Dapter Backend AI Instruction (PocketBase + Provider Abstraction)

## 1. Current backend focus

Backend is optimized for AI document processing:

1. User auth is handled by PocketBase.
2. API accepts PDF/PPTX uploads.
3. Backend runs staged generation pipeline (notebook -> flashcards -> quizzes).
4. Entities and files are stored in PocketBase.

## 2. Runtime stack

- Bun + TypeScript + Elysia
- PocketBase (users, documents, notes, flashcard_decks, flashcards, quizzes, quiz_questions, storage_files)
- Vercel AI SDK + provider abstraction (`AI_PROVIDER`, current adapter: OpenAI)

## 3. Core architecture

- `src/controllers/*`: HTTP contracts and status mapping.
- `src/services/*`: business flow orchestration.
- `src/repositories/*`: repository interfaces + PocketBase adapters.
- `src/services/providers/*`: AI provider interface + concrete adapters + factory.
- `src/config/pocketbase.ts`: PocketBase client.
- `prompts/*.system.ts`: system prompts for each AI stage.

## 4. AI pipeline behavior

1. Upload creates `PROCESSING` document and stores source file in `storage_files`.
2. Text extraction runs from stored file bytes.
3. Notebook is generated first and persisted.
4. Flashcards core is generated and persisted.
5. Card images are generated and written before flashcards are exposed.
6. Quizzes are generated and persisted.
7. Document becomes `COMPLETED` when core stages succeed.

## 5. Auth behavior

- Backend does not expose custom auth endpoints.
- User authentication is done directly in PocketBase.
- Protected document endpoints require:
  - `Authorization: Bearer <pocketbase-user-token>`.

## 6. Environment contract (active)

Required:
- `POCKETBASE_URL`
- `AI_PROVIDER` (`openai`)
- `OPENAI_API_KEY`

Optional:
- `OPENAI_MODEL`
- upload and timeout limits from `.env.example`

## 7. Logging contract highlights

- HTTP lifecycle: `http.request.*`
- Pipeline: `pipeline.upload_and_queue.*`, `pipeline.process_document.*`, `pipeline.stage.*`
- AI attempts: `ai.provider.attempt.*`

## 8. Deletion contract

- Trash/restore/soft-delete flow is removed.
- Only selective permanent artifact deletion is exposed:
  - `DELETE /documents/:id/forever?target=notes|flashcards|quizzes`
