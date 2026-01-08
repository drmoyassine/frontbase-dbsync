import sqlite3
import os
import sys
from pathlib import Path

def get_connection():
    """Get database connection"""
    db_path = Path(__file__).parent.parent / "unified.db"
    return sqlite3.connect(db_path)

def run_migration():
    """Run the database migration"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Read the unified schema file
        schema_path = Path(__file__).parent / "unified_schema.sql"
        
        if not schema_path.exists():
            print(f"Error: Schema file not found at {schema_path}")
            return False
        
        with open(schema_path, 'r') as f:
            schema_sql = f.read()
        
        # Execute the schema SQL
        cursor.executescript(schema_sql)
        conn.commit()
        
        print("Database migration completed successfully")
        return True
        
    except Exception as e:
        print(f"Error running migration: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def rollback_migration():
    """Rollback the database migration"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Get list of all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        
        # Drop all tables except sqlite_sequence
        for table in tables:
            table_name = table[0]
            if table_name != 'sqlite_sequence':
                cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
        
        conn.commit()
        print("Database rollback completed successfully")
        return True
        
    except Exception as e:
        print(f"Error rolling back migration: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "down":
        success = rollback_migration()
    else:
        success = run_migration()
    
    sys.exit(0 if success else 1)