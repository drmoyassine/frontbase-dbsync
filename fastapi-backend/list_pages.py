import sys
import os
sys.path.append(os.getcwd())

from app.database.utils import get_db
from app.models.models import Page
from app.database.config import SessionLocal

db = SessionLocal()
pages = db.query(Page).all()
print(f"Found {len(pages)} pages:")
for p in pages:
    print(f"ID: {p.id}")
    print(f"Slug: {p.slug}")
    print(f"Name: {p.name}")
    print(f"Is Public: {p.is_public}")
    print("-" * 20)
