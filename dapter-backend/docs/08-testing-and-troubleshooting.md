# 8. Testing and Troubleshooting

Detailed E2E guide: [`../TESTING.md`](../TESTING.md)

One-command automated endpoint test:

```bash
bun run test:e2e
```

## Minimal Smoke Test

1. `GET /health` -> `{"status":"ok"}`
2. Acquire PocketBase user token and call any protected `/documents/*` route with Bearer token
3. `POST /documents/upload` -> `{ documentId, status: "PROCESSING" }`
4. Polling:
   - `GET /documents/:id/status`
   - `GET /documents/:id/flashcards`
   - `GET /documents/:id/quizzes`
   - `GET /documents/:id/notes`
5. `DELETE /documents/:id/forever?target=notes` -> `{ "success": true }`

## Common Issues

- `400` on upload:
  - invalid MIME
  - oversized file
- `401` on `/documents/*`:
  - missing/invalid PocketBase Bearer token
- `403` on document read/delete:
  - document belongs to another user
- `FAILED` after upload:
  - PocketBase file storage/read issue
  - extraction failure (unsupported format or corrupted file)
  - OpenAI key/model/timeout failure
  - PocketBase collection schema mismatch
- long `PROCESSING`:
  - OpenAI latency
  - stuck stage (check stage-specific status/error fields)

## Recommended Debug Order

1. Backend logs
2. Incoming Bearer token validity in PocketBase
3. PocketBase availability + collection mappings
4. OpenAI key/model + timeout config
5. Stage status fields in `/documents/:id/status`
