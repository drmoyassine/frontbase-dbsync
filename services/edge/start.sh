#!/bin/sh
# Edge Engine startup — embedded Redis + Node.js
# Redis runs as a background daemon, Node.js runs in the foreground.

set -e

echo "🔴 Starting embedded Redis..."
redis-server --daemonize yes --save "" --appendonly no --maxmemory 128mb --maxmemory-policy allkeys-lru

# Wait for Redis to be ready
for i in $(seq 1 10); do
    if redis-cli ping > /dev/null 2>&1; then
        echo "🔴 Redis ready (localhost:6379)"
        break
    fi
    sleep 0.2
done

echo "🚀 Starting Edge Engine..."
exec node dist/index.js
