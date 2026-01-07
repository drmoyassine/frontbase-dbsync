# Frontbase Actions Engine

Hono-based workflow execution runtime with Zod-OpenAPI validation.

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
npm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3002` | Server port |
| `DB_TYPE` | `sqlite` | Database type (`sqlite` or `postgres`) |
| `SQLITE_PATH` | `./data/actions.db` | SQLite file path (when DB_TYPE=sqlite) |
| `DATABASE_URL` | - | PostgreSQL connection string (when DB_TYPE=postgres) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |
| POST | `/deploy` | Deploy workflow (from FastAPI) |
| POST | `/execute/:id` | Execute workflow |
| POST | `/webhook/:id` | Webhook trigger |
| GET | `/executions/:id` | Get execution status |
| GET | `/executions/workflow/:id` | List workflow executions |

## Database Migrations

```bash
# Generate migrations
npm run db:generate

# Apply migrations
npm run db:migrate

# Open Drizzle Studio
npm run db:studio
```
