import sqlite3

# Check unified.db for project table
c = sqlite3.connect('unified.db')

# List all tables
tables = c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print("Tables in unified.db:", [t[0] for t in tables])

# Check for 'project' table
if any(t[0] == 'project' for t in tables):
    cols = c.execute("PRAGMA table_info(project)").fetchall()
    print("\nproject table columns:")
    for col in cols:
        print(f"  {col}")
    
    print("\nData:")
    rows = c.execute("SELECT * FROM project").fetchall()
    for row in rows:
        print(f"  {row}")
    
    # Clear supabase fields if they exist
    supabase_cols = [col[1] for col in cols if 'supabase' in col[1].lower()]
    if supabase_cols:
        print(f"\nClearing columns: {supabase_cols}")
        for col_name in supabase_cols:
            c.execute(f"UPDATE project SET {col_name} = NULL")
        c.commit()
        print("DONE - Credentials cleared!")
    else:
        print("No supabase columns found")
else:
    print("No 'project' table found")

c.close()
