#!/bin/bash

echo "🔄 Starting Frontbase in development mode..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start services
docker-compose up

echo "✅ Frontbase started successfully!"