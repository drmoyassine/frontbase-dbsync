"""
Migration script to add foreign_keys column to table_schema_cache table.

Run this script once to migrate existing SQLite database.
Run from fastapi-backend directory: python -m app.services.sync.migrations.add_foreign_keys_column
"""

import asyncio
from sqlalchemy import text
from app.services.sync.database import engine


async def migrate():
    """Add foreign_keys column if it doesn't exist."""
    async with engine.begin() as conn:
        # Check if column exists
        result = await conn.execute(text("PRAGMA table_info(table_schema_cache)"))
        columns = [row[1] for row in result.fetchall()]
        
        if "foreign_keys" not in columns:
            print("Adding foreign_keys column to table_schema_cache...")
            await conn.execute(text(
                "ALTER TABLE table_schema_cache ADD COLUMN foreign_keys JSON DEFAULT '[]'"
            ))
            print("Migration complete!")
        else:
            print("foreign_keys column already exists. No migration needed.")


if __name__ == "__main__":
    asyncio.run(migrate())
