#!/bin/bash

# Frontbase VPS Deployment Script
# Usage: ./deploy.sh

set -e # Exit on error

echo "🚀 Starting Deployment..."

# 1. Pull latest code
echo "📦 Pulling latest changes..."
git pull

# 2. Rebuild and restart containers
# --build forces a rebuild of images (essential for frontend/edge changes)
# -d runs in detached mode
# --remove-orphans cleans up old containers
echo "🏗️  Rebuilding and restarting services..."
docker-compose up -d --build --remove-orphans

# 3. Clean up unused images (optional, saves space)
echo "🧹 Cleaning up old images..."
docker image prune -f

echo "✅ Deployment Complete!"
echo "   Frontend: http://localhost:8080 (or your domain)"
echo "   Edge:     http://localhost:3002"
