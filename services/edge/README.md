# Frontbase Edge Engine

Hono-based SSR runtime and no-code execution platform for edge deployment.

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
| `DATABASE_URL` | `file:./data/edge.db` | SQLite/LibSQL connection string |
| `FASTAPI_URL` | `http://localhost:8000` | FastAPI backend URL |
| `PUBLIC_URL` | - | Public URL for generating preview links |
| `SUPABASE_JWT_SECRET` | - | Supabase JWT secret for user auth |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/docs` | OpenAPI documentation |
| POST | `/api/import` | Import published page from FastAPI |
| GET | `/:slug` | Render SSR page |
| GET | `/` | Render homepage or welcome page |

## Features

- **SSR Page Rendering**: Server-side renders published pages
- **Hydration Scripts**: Serves `/static/hydrate.js` for client interactivity  
- **Edge-native**: Designed for Cloudflare Workers, Deno Deploy, Vercel Edge
- **OpenAPI**: Full Zod-OpenAPI validation and Swagger UI

## Database Migrations

```bash
# Generate migrations
npm run db:generate

# Apply migrations
npm run db:migrate

# Open Drizzle Studio
npm run db:studio
```
