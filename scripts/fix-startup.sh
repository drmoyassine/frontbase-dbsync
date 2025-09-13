#!/bin/bash

echo "🔧 Frontbase Startup Fix Tool"
echo "============================="

# Make debug script executable
chmod +x scripts/debug-container.sh

# Step 1: Clean up any existing containers
echo "🧹 Cleaning up existing containers..."
docker-compose down --volumes --remove-orphans

# Step 2: Create and setup data directory
echo "📁 Setting up data directory..."
mkdir -p ./data/uploads ./data/exports
chmod 755 ./data
chmod 755 ./data/uploads
chmod 755 ./data/exports
echo "✅ Data directories created with proper permissions"

# Step 3: Check port availability
echo "🔍 Checking port availability..."
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "❌ Port 3000 is in use. Processes using port 3000:"
    lsof -Pi :3000 -sTCP:LISTEN
    echo ""
    echo "🔧 To free the port, you can:"
    echo "   1. Stop the process using: kill \$(lsof -ti:3000)"
    echo "   2. Or change the port in docker-compose.yml"
    read -p "Should I kill the process using port 3000? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kill $(lsof -ti:3000) 2>/dev/null || echo "No process to kill"
        echo "✅ Port 3000 freed"
    fi
else
    echo "✅ Port 3000 is available"
fi

# Step 4: Build with no cache to ensure fresh build
echo "🔨 Building fresh container..."
docker-compose build --no-cache

# Step 5: Start with enhanced debugging
echo "🚀 Starting container with debug mode..."
docker-compose up -d

# Step 6: Monitor startup logs
echo "📜 Monitoring startup logs..."
timeout 30s docker-compose logs -f frontbase || {
    echo ""
    echo "⏰ Startup monitoring timed out. Checking container status..."
    docker-compose ps
    echo ""
    echo "📋 Recent logs:"
    docker-compose logs --tail=20 frontbase
}

# Step 7: Test health
echo ""
echo "🏥 Testing container health..."
sleep 5
curl -f http://localhost:3000/health 2>/dev/null && {
    echo "✅ Container is healthy and responding"
    echo "🌐 Available endpoints:"
    echo "   Builder: http://localhost:3000/builder"
    echo "   API: http://localhost:3000/api/project"
    echo "   Health: http://localhost:3000/health"
} || {
    echo "❌ Container health check failed"
    echo ""
    echo "🔍 Running diagnostic..."
    ./scripts/debug-container.sh logs
}

echo ""
echo "🎯 Startup fix completed!"
echo "   Use './scripts/debug-container.sh' for advanced debugging"