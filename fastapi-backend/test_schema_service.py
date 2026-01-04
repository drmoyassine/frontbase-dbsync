import asyncio
import sys
sys.path.insert(0, '.')

from app.services.sync.database import async_session
from app.services.sync.services.schema_service import SchemaService

async def check():
    async with async_session() as db:
        # SupaDB Local ID
        datasource_id = "75bdfec7-71f6-4613-8854-a318cb3f0016"
        table = "activities"
        
        schema = await SchemaService.get_cached_schema(db, datasource_id, table)
        print(f"Cached schema for {table}:")
        print(f"  Columns: {len(schema.get('columns', []))}")
        print(f"  FKs: {schema.get('foreign_keys', [])}")

asyncio.run(check())
