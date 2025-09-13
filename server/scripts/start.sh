#!/bin/bash

echo "🚀 Starting Frontbase Server..."
echo "Environment: $NODE_ENV"
echo "Database Path: $DB_PATH"
echo "Port: $PORT"

# Create data directories if they don't exist
echo "📁 Ensuring data directories exist..."
mkdir -p /app/data/uploads
mkdir -p /app/data/exports

# Check if database path is writable
if [ ! -w "/app/data" ]; then
    echo "❌ Error: /app/data directory is not writable"
    ls -la /app/data
    exit 1
fi

echo "✅ Data directories ready"
echo "📂 Directory structure:"
ls -la /app/data/

# Check if required files exist
if [ ! -f "/app/index.js" ]; then
    echo "❌ Error: index.js not found"
    ls -la /app/
    exit 1
fi

echo "✅ Server files ready"

# Start the Node.js server
echo "🚀 Starting Node.js server..."
exec node index.js