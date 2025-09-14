#!/bin/bash

echo "🚀 Frontbase Portable Setup"
echo "============================"

# Make all scripts executable
chmod +x scripts/*.sh

# Check if data directory exists
if [ ! -d "./data" ]; then
    echo "📁 Creating data directory..."
    mkdir -p ./data/uploads ./data/exports
    chmod 755 ./data ./data/uploads ./data/exports
    echo "✅ Data directory created"
else
    echo "✅ Data directory already exists"
fi

# Check for existing named volumes that need migration
echo "🔍 Checking for existing Docker volumes to migrate..."
existing_volumes=$(docker volume ls --format "{{.Name}}" | grep -E "(frontbase|Frontbase)" | head -5)

if [ -n "$existing_volumes" ]; then
    echo "📦 Found existing Frontbase volumes:"
    echo "$existing_volumes"
    echo ""
    echo "🔄 Do you want to migrate data from an existing volume? (y/N)"
    read -r migrate_choice
    
    if [[ $migrate_choice =~ ^[Yy]$ ]]; then
        echo "Available volumes:"
        echo "$existing_volumes"
        echo ""
        echo "Enter volume name to migrate from:"
        read -r volume_name
        
        if [ -n "$volume_name" ]; then
            ./scripts/migrate-data.sh "$volume_name"
        fi
    fi
fi

# Check port availability
echo "🔍 Checking port 3000..."
if command -v lsof >/dev/null 2>&1 && lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port 3000 is in use"
    echo "🔧 Kill the process? (y/N)"
    read -r kill_choice
    
    if [[ $kill_choice =~ ^[Yy]$ ]]; then
        kill $(lsof -ti:3000) 2>/dev/null || echo "No process to kill"
        echo "✅ Port 3000 freed"
    fi
else
    echo "✅ Port 3000 is available"
fi

# Clean up any existing containers
echo "🧹 Cleaning up existing containers..."
docker-compose down --remove-orphans 2>/dev/null || true

# Build and start
echo "🔨 Building container..."
docker-compose build

echo "🚀 Starting Frontbase..."
docker-compose up -d

# Wait for startup and check health
echo "⏳ Waiting for startup..."
sleep 10

if curl -f http://localhost:3000/health >/dev/null 2>&1; then
    echo "✅ Frontbase is running!"
    echo ""
    echo "🌐 Access your Frontbase:"
    echo "   Builder: http://localhost:3000/builder"
    echo "   Login: http://localhost:3000/auth/login"
    echo ""
    echo "📊 Useful commands:"
    echo "   View logs: docker-compose logs -f"
    echo "   Stop: docker-compose down"
    echo "   Backup: ./scripts/backup-restore.sh backup"
    echo "   Restart: docker-compose restart"
else
    echo "❌ Frontbase failed to start properly"
    echo "📜 Check logs: docker-compose logs frontbase"
fi

echo ""
echo "💾 Your data is now stored in ./data/ directory"
echo "📦 This entire folder is now portable - zip it up and deploy anywhere!"