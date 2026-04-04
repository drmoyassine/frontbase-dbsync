import sqlite3, json, os, sys

sys.path.insert(0, './fastapi-backend')
from app.database.config import SYNC_DATABASE_URL
db_path = SYNC_DATABASE_URL.replace('sqlite:///', '')

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT css_bundle FROM pages WHERE slug='form-testing'")
    row = cursor.fetchone()
    if row:
        css = row[0]
        # Just tell me if layout has Tailwind classes
        print("CSS Bundle length:", len(css) if css else 0)
        if css:
            print("Contains flex:", ".flex" in css)
            print("Contains border:", ".border" in css)
    else:
        print("Page not found")
except Exception as e:
    print("Error:", e)
