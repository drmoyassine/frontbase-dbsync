#!/bin/bash

# Frontbase VPS Deployment Script
# Usage: ./deploy.sh

set -e # Exit on error

# Detect docker compose (v2 plugin) or docker-compose (v1 standalone).
# Prefer v2 — it's the modern default and what most VPS images ship.
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "❌ Neither 'docker compose' nor 'docker-compose' found. Install Docker and retry."
  exit 1
fi
echo "Using Docker Compose: $DC"

echo "🚀 Starting Deployment..."

# 1. Pull latest code
echo "📦 Pulling latest changes..."
git pull

# 2. Build the backend image first.
#    Required so step 3 can run a one-off container against it. Cached layers
#    make this near-instant on subsequent deploys.
echo "🏗️  Building backend image..."
$DC build backend

# 3. Self-heal the persisted data volume ownership.
#    The backend runs as non-root UID 1000 (security hardening, commit b84d905).
#    Volumes created BEFORE that change are root-owned, so the non-root process
#    can read frontbase.db but cannot write →
#    "sqlite3.OperationalError: attempt to write a readonly database" the moment
#    create_all() tries to add a new table (e.g. edge_vectors). This chowns the
#    volume as root before the stack comes up.
#    - No-op on fresh / already-correctly-owned volumes (Docker initializes a new
#      volume from the image, which is already owned by UID 1000).
#    - Verbose + logged so a failure is visible (not silently swallowed).
#    - `-T` disables the pseudo-TTY for non-interactive (SSH/cron) runs.
echo "🔧 Ensuring data volume is writable by non-root user (UID 1000)..."
if ! $DC run --rm -T --user root --no-deps --entrypoint sh \
    backend -c "chown -R 1000:1000 /app/data && chmod -R u+rwX /app/data"; then
  echo "⚠️  Volume ownership fix failed (non-fatal). If the backend crashes with"
  echo "    'attempt to write a readonly database', run this manually as root on the volume:"
  echo "      $DC run --rm -T --user root --no-deps --entrypoint sh backend -c 'chown -R 1000:1000 /app/data'"
fi

# 4. Rebuild and restart containers
# --build forces a rebuild of images (essential for frontend/edge changes)
# -d runs in detached mode
# --remove-orphans cleans up old containers
echo "🏗️  Rebuilding and restarting services..."
$DC up -d --build --remove-orphans

# 5. Clean up unused images (optional, saves space)
echo "🧹 Cleaning up old images..."
docker image prune -f

echo "✅ Deployment Complete!"
echo "   Frontend: http://localhost:8080 (or your domain)"
echo "   Edge:     http://localhost:3002"
