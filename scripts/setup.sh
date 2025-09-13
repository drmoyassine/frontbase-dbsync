#!/bin/bash

echo "🚀 Setting up Frontbase..."

# Create necessary directories with proper permissions
echo "📁 Creating directories..."
mkdir -p data/uploads data/exports server/data
chmod 755 data data/uploads data/exports

# Make scripts executable
chmod +x scripts/dev.sh scripts/fix-startup.sh scripts/debug-container.sh

# Check for port conflicts before building
echo "🔍 Checking system requirements..."
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port 3000 is already in use. You may need to stop the conflicting service."
    echo "   Run './scripts/fix-startup.sh' for automated resolution."
fi

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