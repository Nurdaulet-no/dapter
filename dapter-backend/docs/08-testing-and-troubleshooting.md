# 8. Testing and Troubleshooting

Detailed E2E guide: [`../TESTING.md`](../TESTING.md)

One-command automated endpoint test:

```bash
bun run test:e2e
```

## Minimal Smoke Test

1. `GET /health` -> `{"status":"ok"}`
2. `POST /auth/register` / `POST /auth/login` -> JWT tokens
3. `POST /documents/upload` -> `{ documentId, status: "PROCESSING" }`
4. Polling:
   - `GET /documents/:id/status`
   - `GET /documents/:id/flashcards`
   - `GET /documents/:id/quizzes`
   - `GET /documents/:id/notes`
5. `DELETE /documents/:id` -> `{ "success": true }`

## Common Issues

- `400` on upload:
  - invalid MIME
  - oversized file
- `401` on `/documents/*`:
  - missing/invalid Bearer token
- `403` on document read/delete:
  - document belongs to another user
- `FAILED` after upload:
  - S3 credentials/endpoint issues
  - extraction failure
  - AI provider/key/model failure
  - DB or migration issue
- long `PROCESSING`:
  - external API latency
  - AI provider instability

## Recommended Debug Order

1. Backend logs
2. Auth config (`JWT_*`, OAuth env vars)
3. S3 availability
4. PostgreSQL availability and migration history
5. AI keys + models + failover order
