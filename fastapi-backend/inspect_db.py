#!/usr/bin/env python3
"""Inspect the unified database to debug connection issues"""

import sqlite3
import json

def inspect_database():
    conn = sqlite3.connect('unified.db')
    cursor = conn.cursor()
    
    print("🔍 Database Inspection Report")
    print("=" * 50)
    
    # Check project table
    print("\n📁 Project Table:")
    cursor.execute("SELECT * FROM project WHERE id = 'default'")
    project = cursor.fetchone()
    
    if project:
        columns = [description[0] for description in cursor.description]
        print("  Columns:", columns)
        print("  Values:")
        for col, val in zip(columns, project):
            if col in ['supabase_url', 'supabase_anon_key', 'supabase_service_key_encrypted']:
                status = "✅ SET" if val else "❌ NULL"
                print(f"    {col}: {status}")
                if val and len(str(val)) > 50:
                    print(f"      Length: {len(str(val))} chars")
                    print(f"      Preview: {str(val)[:50]}...")
                elif val:
                    print(f"      Value: {val}")
            else:
                print(f"    {col}: {val}")
    else:
        print("  ❌ No default project found!")
    
    # Check all records
    print(f"\n📊 All Project Records:")
    cursor.execute("SELECT * FROM project")
    all_records = cursor.fetchall()
    
    if all_records:
        columns = [description[0] for description in cursor.description]
        print(f"  Found {len(all_records)} records:")
        for i, record in enumerate(all_records):
            print(f"    Record {i+1}:")
            for col, val in zip(columns, record):
                if val:
                    print(f"      {col}: {str(val)[:50]}..." if len(str(val)) > 50 else f"      {col}: {val}")
                else:
                    print(f"      {col}: NULL")
    else:
        print("  ❌ No records found!")
    
    # Check table schema
    print(f"\n🏗️ Project Table Schema:")
    cursor.execute("PRAGMA table_info(project)")
    schema = cursor.fetchall()
    print("  Columns:")
    for col in schema:
        print(f"    {col[1]} ({col[2]}) - {'NOT NULL' if col[3] else 'NULL'}")
    
    conn.close()
    print(f"\n✅ Database inspection complete!")

if __name__ == "__main__":
    inspect_database()