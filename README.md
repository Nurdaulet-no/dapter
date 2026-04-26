# Dapter Project

> Transform documents into interactive learning experiences with AI-powered content generation.

Dapter is an end-to-end platform for converting documents (PDF, PPTX, TXT) into structured learning content: notes, flashcards, and quizzes with AI-generated images.

<div align="center">

**[Backend](dapter-backend)** • **[Frontend](https://github.com/Kipachu-1/dapter-client)** • **[Docs](dapter-backend/docs)**

</div>

---

## ✨ Features

- 📄 **Multi-Format Support** — Process PDF, PPTX, and TXT files
- 📝 **Smart Content Generation** — AI-powered notes, flashcards, and quizzes
- 🖼️ **AI-Generated Images** — Automatic visual enhancements for flashcards
- ⚡ **Real-time Status** — Poll document processing progress
- 🔐 **Secure Authentication** — PocketBase superuser integration for reliable processing
- 🔄 **Failover & Retry** — Retry failed processing stages

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│         Frontend (React + Vite)             │
│  https://github.com/Kipachu-1/dapter-client│
└──────────────────┬──────────────────────────┘
                   │
           HTTP/Bearer Token
                   │
┌──────────────────▼──────────────────────────┐
│      Backend (Bun + TypeScript)             │
│  ElysiaJS • PocketBase • Vercel AI SDK      │
└──────────────────┬──────────────────────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
    ┌────▼───┐         ┌────▼─────┐
    │PocketBase  │         │OpenAI  │
    │(Auth/Storage) │      │(AI)    │
    └─────────┘      └──────────┘
```

## 🚀 Quick Start

### Backend Setup

```bash
cd dapter-backend
bun install
cp .env.example .env
bun run dev
```

**Required `.env` values:**

```env
POCKETBASE_URL=http://localhost:8090
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
```

### Frontend Setup

```bash
git clone https://github.com/Kipachu-1/dapter-client.git
cd dapter-client
npm install
npm run dev
```

## 📋 How It Works

1. **Authentication** — User logs in via PocketBase and receives a Bearer token
2. **Upload** — Client uploads a document (PDF/PPTX/TXT) to the backend
3. **Extract** — Backend extracts text from the document
4. **Generate** — AI creates learning content:
   - 📝 Notes (comprehensive summaries)
   - 🎴 Flashcards (with AI-generated images)
   - ❓ Quizzes (interactive questions)
5. **Enhance** — AI generates visual images for flashcards
6. **Polling** — Client monitors progress via status endpoint
7. **Delivery** — Completed artifacts retrieved once processing finishes

## 🔌 API Endpoints

### Health & Status

- `GET /health` — Service health check
- `GET /documents/:id/status` — Document processing status

### Document Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/documents` | List user documents |
| `POST` | `/documents/upload` | Upload new document |
| `POST` | `/documents/:id/retry/:stage` | Retry failed stage |
| `DELETE` | `/documents/:id/forever` | Delete document & artifacts |

### Content Retrieval

- `GET /documents/:id/notes` — Retrieve notes
- `GET /documents/:id/flashcards` — Retrieve flashcards
- `GET /documents/:id/quizzes` — Retrieve quizzes

**All protected routes require:**

```http
Authorization: Bearer <pocketbase-user-token>
```

## 📚 Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React, Vite, TypeScript |
| **Backend** | Bun, TypeScript, ElysiaJS |
| **Database** | PocketBase |
| **AI** | Vercel AI SDK, OpenAI |
| **Auth** | PocketBase |

## 📖 Documentation

- [System Overview](dapter-backend/docs/01-system-overview.md)
- [Architecture](dapter-backend/docs/02-architecture.md)
- [Configuration](dapter-backend/docs/03-configuration.md)
- [API Reference](dapter-backend/docs/04-api-reference.md)
- [Data Model](dapter-backend/docs/05-data-model.md)
- [Pipeline & Failover](dapter-backend/docs/06-pipeline-and-failover.md)
- [Local Development](dapter-backend/docs/07-local-development.md)
- [Testing & Troubleshooting](dapter-backend/docs/08-testing-and-troubleshooting.md)
- [Logging](dapter-backend/docs/09-logging.md)

## ✅ Testing

```bash
cd dapter-backend
bun run test:e2e
```

## 📦 Supported File Types

- **PDF** (.pdf) — Portable Document Format
- **PPTX** (.pptx) — PowerPoint presentations
- **TXT** (.txt) — Plain text files

## �📝 License

See [LICENSE](LICENSE) file for details.
