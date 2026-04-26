# 8. Testing and Troubleshooting

## E2E

```bash
bun run test:e2e
```

Runs `scripts/e2e-endpoints.ts` against a live backend.

## Minimal smoke test

1. `GET /health` → `{ "status": "ok" }`.
2. Obtain a PocketBase user token (login through the PocketBase SDK or directly against the `users` auth collection).
3. With `Authorization: Bearer <token>`:
   - `POST /flashcards/` with one PDF/PPTX/TXT/MD in the `files` field → `{ id, status: "PROCESSING" }`.
   - `GET /flashcards/:id/status` until `status` is `COMPLETED` or `FAILED`.
   - `GET /flashcards/:id` to inspect the deck.
4. Repeat with `/quizzes/` to exercise the parallel path.
5. `DELETE /flashcards/:id` → `{ "success": true }`.

## Common failures

| Symptom | Likely cause |
|---|---|
| `400 At least one file is required` | Field name is not `files`, or the form was empty. |
| `400 Maximum 5 files per upload` | Trying to send >5 files. |
| `400 Unsupported file type` | MIME outside the allowed set (PDF, PPTX, TXT, MD). The controller normalizes the MIME before checking. |
| `400 File "<name>" exceeds max size <bytes>` | Per-file size > `MAX_UPLOAD_SIZE_BYTES`. |
| `401 Unauthorized` | No bearer token, or `users.authRefresh` against PocketBase failed. |
| `403` on read/delete | Row exists but `owner` ≠ caller. |
| `404` on read/delete | Row doesn't exist (or doesn't exist *for this owner* — see ownership check in services). |
| `429 Too many uploads` | 8/min/user upload bucket exhausted. |
| Row stuck in `PROCESSING` | Inspect logs for `pipeline.stage.*`, `ai.provider.attempt.*`, `extraction.*`. The xAI call can run for many minutes against a large source, so timeouts default to 10–15 min. |
| Row in `FAILED`, `error="Extracted text is too short for meaningful generation"` | All sources combined produced <80 trimmed chars. Check that the file actually contains extractable text (scanned PDFs without OCR will produce nothing). |
| Row in `FAILED`, `error="xAI failed for <stage>: ..."` | Provider error / API key / timeout / schema validation. The included message comes straight from the SDK. |
| Card has no `imageUrls` after row went `COMPLETED` | The image worker for that card failed (see `flashcards.images.card.failed`) or is still in flight. The row stays `COMPLETED` regardless. |

## Debug order

1. Backend logs (JSON-line stdout via `console.log`). Filter by `requestId`, row `id`, or event name.
2. PocketBase availability and superuser auth (`server.started` log fires only after `ensureSuperuserAuth`).
3. Token validity in PocketBase (e.g. `pb.collection('users').authRefresh()`).
4. xAI key / model / quota.
5. The row itself: `GET /:resource/:id` to see what got persisted.
