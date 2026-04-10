# 7. Local Development and Deployment Readiness

## Quick Local Start

1. Start PostgreSQL:

```bash
docker compose up -d postgres
```

2. Install dependencies:

```bash
bun install
```

3. Configure `.env`:

```bash
cp .env.example .env
```

4. Generate Prisma client and apply migrations:

```bash
bun run prisma:generate
bun run prisma:migrate:dev --name init
```

5. Start API:

```bash
bun run dev
```

6. Verify:

```bash
curl -sS http://localhost:3000/health
```

## Local Database

`docker-compose.yml` runs a container with:

- image: `postgres:16-alpine`
- db: `dapter_local`
- user: `postgres`
- password: `password`
- port: `5432`

Recommended `DATABASE_URL`:

```dotenv
DATABASE_URL="postgresql://postgres:password@localhost:5432/dapter_local"
```
