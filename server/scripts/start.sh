#!/bin/bash

# Enhanced startup script with comprehensive debugging
set -e  # Exit on any error

echo "🚀 Starting Frontbase Server..."
echo "Timestamp: $(date)"
echo "Environment: $NODE_ENV"
echo "Database Path: $DB_PATH"
echo "Port: $PORT"
echo "Debug Mode: $DEBUG"
echo "Startup Debug: $STARTUP_DEBUG"
echo "Current User: $(whoami)"
echo "Current Working Directory: $(pwd)"

# Function for logging with timestamps
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to test network connectivity
test_network() {
    log "🌐 Testing network connectivity..."
    
    # Test if we can bind to the port
    if command_exists netstat; then
        netstat -tuln | grep ":${PORT:-3000}" && {
            log "❌ Port ${PORT:-3000} is already in use"
            netstat -tuln | grep ":${PORT:-3000}"
            return 1
        }
    fi
    
    log "✅ Port ${PORT:-3000} is available"
    return 0
}

# Function to test database connectivity
test_database() {
    log "🗄️  Testing database connectivity..."
    
    # Test if we can create a test database connection
    node -e "
        try {
            const Database = require('better-sqlite3');
            const testDb = new Database(':memory:');
            testDb.close();
            console.log('✅ Database library working');
            process.exit(0);
        } catch (error) {
            console.error('❌ Database test failed:', error.message);
            process.exit(1);
        }
    " || {
        log "❌ Database connectivity test failed"
        return 1
    }
    
    log "✅ Database connectivity test passed"
    return 0
}

# Comprehensive system check
echo "🔍 System Information:"
echo "Node.js version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Memory: $(free -h | grep Mem | awk '{print $2}' 2>/dev/null || echo 'N/A')"
echo "Disk space: $(df -h / | tail -1 | awk '{print $4}' 2>/dev/null || echo 'N/A')"

# Check environment variables
echo "📊 Environment Variables:"
echo "NODE_ENV: ${NODE_ENV:-'not set'}"
echo "DB_PATH: ${DB_PATH:-'not set'}"
echo "PORT: ${PORT:-'not set'}"
echo "DEBUG: ${DEBUG:-'not set'}"

# Directory structure inspection
echo "📂 Current directory contents:"
ls -la /app/ | head -20

echo "📂 Data directory check:"
if [ -d "/app/data" ]; then
    echo "✅ /app/data exists"
    ls -la /app/data/
else
    echo "❌ /app/data does not exist"
fi

# Create data directories if they don't exist
echo "📁 Ensuring data directories exist..."
mkdir -p /app/data/uploads
mkdir -p /app/data/exports

# Check directory permissions in detail
echo "🔐 Permission checks:"
if [ -w "/app/data" ]; then
    echo "✅ /app/data is writable"
else
    echo "❌ /app/data is not writable"
    echo "Directory permissions:"
    ls -la /app/data/
    echo "Parent directory permissions:"
    ls -la /app/
    exit 1
fi

# Test write operation
echo "✏️  Testing write operation..."
echo "test" > /app/data/.write-test 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ Write test successful"
    rm -f /app/data/.write-test
else
    echo "❌ Write test failed"
    exit 1
fi

echo "✅ Data directories ready"
echo "📂 Final directory structure:"
ls -la /app/data/

# Check if required files exist
echo "📋 Checking required files..."
if [ ! -f "/app/index.js" ]; then
    echo "❌ Error: index.js not found"
    echo "Available files in /app:"
    ls -la /app/
    exit 1
fi
echo "✅ index.js found"

if [ ! -f "/app/package.json" ]; then
    echo "❌ Error: package.json not found"
    ls -la /app/
    exit 1
fi
echo "✅ package.json found"

# Check node_modules
if [ ! -d "/app/node_modules" ]; then
    echo "❌ Error: node_modules not found"
    echo "Available directories:"
    ls -la /app/
    exit 1
fi
echo "✅ node_modules found"

# Check critical dependencies
echo "📦 Checking critical dependencies..."
node -e "require('better-sqlite3')" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ better-sqlite3 available"
else
    echo "❌ better-sqlite3 not available"
    exit 1
fi

node -e "require('express')" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ express available"
else
    echo "❌ express not available"
    exit 1
fi

# Check if server files exist
echo "🔍 Checking server file structure..."
for file in "/app/database/init.js" "/app/database/schema.sql" "/app/utils/db.js" "/app/ssr/renderer.js"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
        exit 1
    fi
done

echo "✅ All server files ready"

# Pre-startup validation
log "🔍 Running pre-startup validation..."

# Test network connectivity
test_network || {
    log "❌ Network connectivity test failed"
    if [ "$STARTUP_DEBUG" = "1" ]; then
        log "🔍 Debug mode: Continuing despite network test failure"
    else
        exit 1
    fi
}

# Test database connectivity
test_database || {
    log "❌ Database connectivity test failed"
    if [ "$STARTUP_DEBUG" = "1" ]; then
        log "🔍 Debug mode: Continuing despite database test failure"
    else
        exit 1
    fi
}

log "✅ Pre-startup validation completed successfully"

# Add signal handlers for graceful shutdown
trap 'log "🛑 Received SIGTERM, shutting down..."; exit 0' TERM
trap 'log "🛑 Received SIGINT, shutting down..."; exit 0' INT

# Start the Node.js server with enhanced error handling
log "🚀 Starting Node.js server..."
log "Command: node index.js"
log "Process ID: $$"

# Use exec to replace the shell process with node
if [ "$STARTUP_DEBUG" = "1" ]; then
    log "🔍 Debug mode: Starting with verbose logging"
    exec node --trace-warnings index.js
else
    exec node index.js
fi