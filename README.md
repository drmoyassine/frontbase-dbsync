# Frontbase

A visual database builder and admin panel for Supabase, built with React, TypeScript, and FastAPI.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: FastAPI (Python), SQLAlchemy
- **Database**: SQLite (local config), Supabase (user data)
- **State Management**: Zustand, TanStack Query

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- A Supabase project (for database features)

### Development Setup

```bash
# 1. Clone the repository
git clone <YOUR_GIT_URL>
cd frontbase

# 2. Install frontend dependencies
npm install

# 3. Setup FastAPI backend
cd fastapi-backend
python -m venv venv

# Windows
.\venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
cd ..

# 4. Copy environment template
cp .env.example .env
# Edit .env with your settings

# 5. Start both servers (2 terminals)
```

### Running the Application

**Terminal 1 - Backend (FastAPI):**
```bash
cd fastapi-backend
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 - Frontend (Vite):**
```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### Port Configuration

| Service | Port | Description |
|---------|------|-------------|
| Frontend (Vite) | 5173 | Development server with HMR |
| Backend (FastAPI) | 8000 | API server |

## Production Deployment

### Docker (Recommended)

```bash
# Build and run
docker-compose up -d

# Or build manually
docker build -t frontbase .
docker run -p 8000:8000 -v ./data:/app/data frontbase
```

### Manual Deployment

**Backend:**
```bash
cd fastapi-backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
npm run build
# Serve the dist/ folder with nginx or similar
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Backend port (default: 8000) |
| `NODE_ENV` | No | development/production |
| `ADMIN_USERNAME` | No | Admin username (default: admin) |
| `ADMIN_PASSWORD` | No | Admin password (default: admin) |

### Supabase Configuration

Supabase credentials are configured through the UI after login. For auto-configuration, you can set:

- `SUPABASE_PROJECT_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Anonymous key
- `SUPABASE_SERVICE_KEY` - Service role key (for admin features)

## Supabase Setup

For full foreign key detection and advanced features, run the SQL in `supabase_setup.sql` in your Supabase SQL Editor. This creates the `frontbase_get_schema_info` RPC function.

## Project Structure

```
frontbase/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # Custom hooks (React Query)
│   ├── stores/             # Zustand stores
│   └── services/           # API clients
├── fastapi-backend/        # Python backend
│   ├── app/
│   │   ├── routers/        # API routes
│   │   ├── models/         # Pydantic schemas
│   │   └── database/       # SQLAlchemy config
│   └── main.py             # FastAPI app
├── public/                 # Static assets
└── docs/                   # Documentation
```

## Troubleshooting

### "Backend service unavailable"
Ensure FastAPI is running on port 8000:
```bash
cd fastapi-backend && python -m uvicorn main:app --port 8000 --reload
```

### "Foreign key columns show dashes"
Run `supabase_setup.sql` in your Supabase project to enable FK detection.

### "Supabase connection lost"
Re-enter your Supabase credentials in the Settings modal.

## License

MIT
