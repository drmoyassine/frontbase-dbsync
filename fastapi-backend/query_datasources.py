
import sqlite3

def list_from_db(db_path):
    print(f"Checking {db_path}...")
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        # Assuming columns: id, name, type, host, port, username, password_encrypted, database
        # Verify columns first? "PRAGMA table_info(datasources)"?
        # Let's just select *
        cur.execute("SELECT * FROM datasources WHERE id = 'ea1908bf-1aae-4acf-bbfe-aa99917eebfd'")
        row = cur.fetchone()
        print(row)
        
        # Get column names
        names = [description[0] for description in cur.description]
        print(names)
        
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_from_db("app.db")
    list_from_db("unified.db")
