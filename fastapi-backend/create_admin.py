"""
Safe admin user creation/update script for FastAPI backend.
Fixes applied:
- Uses bcrypt directly (avoids passlib backend version warning)
- Ensures correct DB path (relative to script)
- Creates users table if missing
- Inserts or updates admin user with full bcrypt hash
- Verifies password after write
- Robust error handling and clear prints for CI/terminal
"""

import os
import sys
import sqlite3
import bcrypt
from pathlib import Path

DB_FILENAME = 'app.db'
ADMIN_USERNAME = 'admin'
ADMIN_EMAIL = 'admin@frontbase.dev'
ADMIN_PASSWORD = 'admin123'


def db_path() -> str:
    # Resolve DB path relative to this script
    base = Path(__file__).resolve().parent
    return str(base / DB_FILENAME)


def ensure_users_table(conn: sqlite3.Connection):
    conn.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT,
        is_active INTEGER DEFAULT 1
    )
    ''')
    conn.commit()


def hash_password(password: str) -> str:
    # bcrypt.gensalt default cost is fine; produces $2b$... compatible with bcryptjs
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def main():
    path = db_path()
    print(f"Using DB: {path}")

    try:
        conn = sqlite3.connect(path)
    except Exception as e:
        print(f"❌ Could not open DB: {e}")
        sys.exit(1)

    try:
        ensure_users_table(conn)

        cur = conn.cursor()
        # Upsert admin user
        cur.execute('SELECT id FROM users WHERE username = ?', (ADMIN_USERNAME,))
        row = cur.fetchone()

        hashed = hash_password(ADMIN_PASSWORD)

        if row:
            print('Updating existing admin password...')
            cur.execute('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE username = ?', (hashed, ADMIN_USERNAME))
        else:
            print('Inserting new admin user...')
            cur.execute('INSERT INTO users (id, username, email, password_hash, created_at, updated_at, is_active) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"), ?)',
                        ('default-admin', ADMIN_USERNAME, ADMIN_EMAIL, hashed, 1))

        conn.commit()

        # Verification
        cur.execute('SELECT password_hash FROM users WHERE username = ?', (ADMIN_USERNAME,))
        stored = cur.fetchone()
        if not stored:
            print('❌ Failed to read back admin user')
            sys.exit(1)

        stored_hash = stored[0]
        ok = verify_password(ADMIN_PASSWORD, stored_hash)
        print(f"Password verification: {'PASS' if ok else 'FAIL'}")

        if not ok:
            print('❌ Stored hash did not verify. Aborting.')
            sys.exit(1)

        print('✅ Admin user created/updated successfully')

    except Exception as e:
        print(f"❌ Error while setting up admin user: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
