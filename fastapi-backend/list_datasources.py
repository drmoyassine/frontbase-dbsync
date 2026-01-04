
import asyncio
import sys
import os
sys.path.append(os.getcwd())

from app.services.sync.service import DatasourceService
from app.api.deps import get_db

async def list_sources():
    service = DatasourceService()
    sources = await service.list_datasources()
    for s in sources:
        print(f"ID: {s.id} | Name: {s.name} | Type: {s.type}")

if __name__ == "__main__":
    asyncio.run(list_sources())
