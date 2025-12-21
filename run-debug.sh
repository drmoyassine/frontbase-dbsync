#!/bin/bash

# Make this script executable
chmod +x scripts/*.sh

echo "🔧 Creating data directory structure..."
mkdir -p ./data/uploads ./data/exports
chmod 755 ./data ./data/uploads ./data/exports

echo "🔍 Checking port availability..."
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "❌ Port 3000 is in use. Killing processes..."
    kill $(lsof -ti:3000) 2>/dev/null || echo "No process to kill"
fi

echo "🧹 Cleaning containers..."
docker-compose down --volumes --remove-orphans

echo "🔨 Building fresh container..."
docker-compose build --no-cache

echo "🚀 Starting container with debug logging..."
docker-compose up -d

echo "📜 Monitoring startup (30s)..."
timeout 30s docker-compose logs -f frontbase

echo "🏥 Health check..."
sleep 5
curl -f http://localhost:3000/health || echo "Health check failed"

echo "📊 Container status:"
docker-compose ps