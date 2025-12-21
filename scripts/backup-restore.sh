#!/bin/bash

BACKUP_DIR="./backups"
DATA_DIR="./data"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup
backup() {
    echo "💾 Creating Frontbase backup..."
    
    mkdir -p "$BACKUP_DIR"
    
    if [ ! -d "$DATA_DIR" ]; then
        echo "❌ Data directory not found: $DATA_DIR"
        exit 1
    fi
    
    backup_file="$BACKUP_DIR/frontbase_backup_$TIMESTAMP.tar.gz"
    
    echo "📦 Compressing data directory..."
    tar -czf "$backup_file" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")" || {
        echo "❌ Backup failed"
        exit 1
    }
    
    echo "✅ Backup created: $backup_file"
    echo "📊 Backup size: $(du -h "$backup_file" | cut -f1)"
}

# Restore from backup
restore() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        echo "❌ Backup file path required"
        echo "Available backups:"
        ls -la "$BACKUP_DIR"/*.tar.gz 2>/dev/null || echo "No backups found"
        exit 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        echo "❌ Backup file not found: $backup_file"
        exit 1
    fi
    
    echo "🔄 Restoring from backup: $backup_file"
    
    # Stop container if running
    docker-compose down 2>/dev/null || true
    
    # Backup current data if it exists
    if [ -d "$DATA_DIR" ]; then
        echo "📁 Backing up current data..."
        mv "$DATA_DIR" "${DATA_DIR}_backup_$TIMESTAMP" || {
            echo "❌ Failed to backup current data"
            exit 1
        }
    fi
    
    # Extract backup
    echo "📦 Extracting backup..."
    tar -xzf "$backup_file" -C "$(dirname "$DATA_DIR")" || {
        echo "❌ Failed to extract backup"
        # Restore original data if extraction failed
        if [ -d "${DATA_DIR}_backup_$TIMESTAMP" ]; then
            mv "${DATA_DIR}_backup_$TIMESTAMP" "$DATA_DIR"
        fi
        exit 1
    }
    
    echo "✅ Restore completed!"
    echo "🚀 Start your container with: docker-compose up"
}

# List backups
list_backups() {
    echo "📋 Available backups:"
    if [ -d "$BACKUP_DIR" ]; then
        ls -la "$BACKUP_DIR"/*.tar.gz 2>/dev/null || echo "No backups found"
    else
        echo "No backup directory found"
    fi
}

case "$1" in
    "backup")
        backup
        ;;
    "restore")
        restore "$2"
        ;;
    "list")
        list_backups
        ;;
    *)
        echo "🔧 Frontbase Backup & Restore Tool"
        echo "=================================="
        echo ""
        echo "Usage:"
        echo "  $0 backup                    # Create a backup"
        echo "  $0 restore <backup_file>     # Restore from backup"
        echo "  $0 list                      # List available backups"
        echo ""
        echo "Examples:"
        echo "  $0 backup"
        echo "  $0 restore ./backups/frontbase_backup_20241215_143022.tar.gz"
        ;;
esac