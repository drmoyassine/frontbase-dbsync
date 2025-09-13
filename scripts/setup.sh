#!/bin/bash

echo "🚀 Setting up Frontbase..."

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p data/uploads data/exports server/data

# Make sure the script is executable
chmod +x scripts/dev.sh

# Build and start with Docker Compose
echo "🐳 Building and starting with Docker..."
docker-compose up --build -d

echo "✅ Frontbase setup complete!"
echo ""
echo "🌐 Your Frontbase instance is running:"
echo "   Builder: http://localhost:3000/builder"
echo "   Public pages: http://localhost:3000/"
echo "   API: http://localhost:3000/api"
echo ""
echo "📊 To view logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 To stop:"
echo "   docker-compose down"
echo ""
echo "🔄 To restart:"
echo "   ./scripts/dev.sh"