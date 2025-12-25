import sqlite3
import os
from passlib.context import CryptContext

print('Reset FastAPI admin script starting')

db_path = 'unified.db'
print('DB path:', os.path.abspath(db_path))
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute('''CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT,
    is_active INTEGER DEFAULT 1
)''')
conn.commit()

pwd = 'admin123'
pwd_ctx = CryptContext(schemes=['bcrypt'], deprecated='auto')
h = pwd_ctx.hash(pwd)

cur.execute("SELECT id FROM users WHERE username=?", ('admin',))
row = cur.fetchone()
if row:
    cur.execute("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE username=?", (h, 'admin'))
    action = 'updated'
else:
    cur.execute("INSERT INTO users (id,username,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,datetime('now'),datetime('now'))", ('default-admin','admin','admin@frontbase.dev', h))
    action = 'inserted'
conn.commit()

cur.execute("SELECT username, length(password_hash) FROM users WHERE username='admin'")
print('ADMIN_ROW:', cur.fetchone())

# verify stored hash
cur.execute("SELECT password_hash FROM users WHERE username='admin'")
stored = cur.fetchone()[0]
try:
    ok = pwd_ctx.verify(pwd, stored)
    print('verify_result:', ok)
except Exception as e:
    print('verify_error:', e)

conn.close()
print('Reset script finished')
