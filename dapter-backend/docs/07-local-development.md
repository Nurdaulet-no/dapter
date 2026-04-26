# 7. Local Development and Deployment Readiness

## Quick Local Start

1. Install dependencies:

```bash
bun install
```

2. Configure `.env`:

```bash
cp .env.example .env
```

3. Start PocketBase locally (separate process, default URL `http://127.0.0.1:8090`) and create required collections.

4. Start API:

```bash
bun run dev
```

5. Verify:

```bash
curl -sS http://localhost:3000/health
```

## Supported Document Types

- **PDF** (.pdf) — Portable Document Format
- **PPTX** (.pptx) — PowerPoint presentations  
- **TXT** (.txt) — Plain text files

Maximum file size: 20 MB (configurable via `MAX_UPLOAD_SIZE_BYTES`)
