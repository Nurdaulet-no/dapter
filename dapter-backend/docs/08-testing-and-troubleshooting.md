# 8. Testing and Troubleshooting

Detailed E2E guide: [`../TESTING.md`](../TESTING.md)

## Minimal Smoke Test

1. `GET /health` -> `{"status":"ok"}`
2. `POST /documents/upload` -> `{ documentId, status: "PROCESSING" }`
3. Polling:
   - `GET /documents/:id/status`
   - `GET /documents/:id/flashcards`
   - `GET /documents/:id/quizzes`
   - `GET /documents/:id/notes`

## Common Issues

- `400` on upload:
  - invalid MIME
  - oversized file
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
2. S3 availability
3. PostgreSQL availability
4. AI keys + models + failover order
