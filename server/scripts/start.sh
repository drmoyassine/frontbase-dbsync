#!/bin/bash

# Simplified Frontbase startup script
set -e  # Exit on any error

echo "🚀 Starting Frontbase Server..."
echo "Timestamp: $(date)"
echo "Environment: ${NODE_ENV:-production}"
echo "Database Path: ${DB_PATH:-/app/data/frontbase.db}"
echo "Port: ${PORT:-3000}"
echo "Current Working Directory: $(pwd)"

# Ensure data directory exists with proper permissions
echo "📁 Ensuring data directory exists..."
DB_DIR="$(dirname "${DB_PATH:-/app/data/frontbase.db}")"
mkdir -p "$DB_DIR"
chmod 755 "$DB_DIR" 2>/dev/null || echo "⚠️  Could not set directory permissions (might be fine)"

# Create uploads and exports directories
mkdir -p "$DB_DIR/uploads" "$DB_DIR/exports" 2>/dev/null || true
chmod 755 "$DB_DIR/uploads" "$DB_DIR/exports" 2>/dev/null || echo "⚠️  Could not set upload/export permissions (might be fine)"

# Add signal handlers for graceful shutdown
trap 'echo "🛑 Received SIGTERM, shutting down..."; exit 0' TERM
trap 'echo "🛑 Received SIGINT, shutting down..."; exit 0' INT

# Start the Node.js server
echo "🚀 Starting Node.js server..."
echo "Process ID: $$"

# Use exec to replace the shell process with node
exec node index.js