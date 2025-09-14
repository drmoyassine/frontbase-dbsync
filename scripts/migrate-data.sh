#!/bin/bash

echo "🔄 Frontbase Data Migration Tool"
echo "================================"

# Function to find existing named volumes
find_frontbase_volumes() {
    echo "🔍 Looking for existing Frontbase volumes..."
    docker volume ls | grep -E "(frontbase|Frontbase)" | head -10
}

# Function to migrate data from named volume to host directory
migrate_from_volume() {
    local volume_name="$1"
    
    if [ -z "$volume_name" ]; then
        echo "❌ Volume name required"
        return 1
    fi
    
    echo "📦 Migrating data from volume: $volume_name"
    
    # Create local data directory
    mkdir -p ./data
    
    # Copy data from volume to host directory
    echo "📁 Copying data from volume to ./data directory..."
    docker run --rm \
        -v "$volume_name":/source:ro \
        -v "$(pwd)/data":/dest \
        alpine:latest \
        sh -c "cp -a /source/. /dest/ && echo '✅ Data copied successfully'" || {
        echo "❌ Failed to copy data from volume"
        return 1
    }
    
    echo "✅ Migration completed!"
    echo "📊 Verifying migration..."
    
    if [ -f "./data/frontbase.db" ]; then
        echo "✅ Database file found in ./data/"
        echo "📋 Database size: $(du -h ./data/frontbase.db 2>/dev/null || echo 'Unknown')"
    else
        echo "⚠️  No database file found in migrated data"
    fi
    
    echo ""
    echo "🚀 You can now start your container with: docker-compose up"
}

# Interactive migration
if [ "$1" = "auto" ]; then
    # Try to find and migrate automatically
    volumes=$(docker volume ls --format "{{.Name}}" | grep -E "(frontbase|Frontbase)" | head -1)
    if [ -n "$volumes" ]; then
        migrate_from_volume "$volumes"
    else
        echo "❌ No Frontbase volumes found"
        exit 1
    fi
elif [ -n "$1" ]; then
    # Migrate specific volume
    migrate_from_volume "$1"
else
    # Show available volumes and ask user
    echo "Available Docker volumes:"
    find_frontbase_volumes
    echo ""
    echo "Usage:"
    echo "  $0 <volume_name>  # Migrate specific volume"
    echo "  $0 auto           # Auto-detect and migrate first found volume"
    echo ""
    echo "Example:"
    echo "  $0 studygram_frontbase_frontbase_data"
fi