#!/usr/bin/env python3
"""
Initialize the Unified Database
Creates a unified database that combines Frontbase and DB-Synchronizer schemas
"""

import os
import sqlite3
from pathlib import Path

def init_unified_database():
    """Initialize the unified database with combined schemas"""
    
    # Database path
    db_path = Path("unified.db")
    
    # Remove existing database if it exists
    if db_path.exists():
        print(f"🗑️ Removing existing database: {db_path}")
        db_path.unlink()
    
    # Create new database
    print(f"🗄️ Creating unified database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Read and execute the unified schema
    schema_file = Path("app/database/unified_schema.sql")
    if schema_file.exists():
        print(f"📖 Reading schema from: {schema_file}")
        schema_sql = schema_file.read_text(encoding='utf-8')
        
        # Execute schema
        print("🏗️ Creating database schema...")
        cursor.executescript(schema_sql)
        conn.commit()
        print("✅ Database schema created successfully")
    else:
        print(f"❌ Schema file not found: {schema_file}")
        return False
    
    # Verify tables were created
    print("\n🔍 Verifying tables...")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = cursor.fetchall()
    
    print(f"📋 Created {len(tables)} tables:")
    for table in tables:
        print(f"  ✅ {table[0]}")
    
    # Check if initial data was inserted
    print("\n📊 Checking initial data...")
    
    # Check project
    cursor.execute("SELECT COUNT(*) FROM project")
    project_count = cursor.fetchone()[0]
    print(f"  📁 Projects: {project_count}")
    
    # Check users
    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]
    print(f"  👤 Users: {user_count}")
    
    # Check pages
    cursor.execute("SELECT COUNT(*) FROM pages")
    page_count = cursor.fetchone()[0]
    print(f"  📄 Pages: {page_count}")
    
    # Check DB-Synchronizer tables
    cursor.execute("SELECT COUNT(*) FROM sync_configs")
    sync_config_count = cursor.fetchone()[0]
    print(f"  🔄 Sync Configs: {sync_config_count}")
    
    # Show project details
    if project_count > 0:
        cursor.execute("SELECT id, name, description FROM project WHERE id = 'default'")
        project = cursor.fetchone()
        print(f"\n🎯 Default Project: {project}")
    
    conn.close()
    print(f"\n🎉 Unified database initialized successfully: {db_path}")
    return True

if __name__ == "__main__":
    print("🚀 Starting Unified Database Initialization")
    print("=" * 50)
    
    success = init_unified_database()
    
    if success:
        print("\n✅ Database initialization completed successfully!")
        print("\nNext steps:")
        print("1. Start FastAPI server: python -m uvicorn main:app --reload")
        print("2. Test API endpoints")
        print("3. The unified database is ready for both Frontbase and DB-Synchronizer features")
    else:
        print("\n❌ Database initialization failed!")
        exit(1)