
import asyncio
import logging
from app.services.sync.adapters.postgres_adapter import PostgresAdapter
from app.services.sync.models.datasource import Datasource

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("debug_simulation")

async def run_debug():
    print("--- Starting Debug Simulation ---")
    
    # Mock Datasource
    datasource = Datasource(
        id="debug_ds",
        name="Debug DS",
        type="postgres",
        host="127.0.0.1", # Assuming local
        port=5432,
        database="postgres", # Default? Or 'frontbase'? User uses default connection string usually.
        # Actually user connection string might be needed. 
        # But we can try to mock the adapter without connection ONLY if we test logic?
        # No, read_records_with_relations connects.
        username="postgres",
        password_encrypted="postgres" # Dummy
    )
    
    # We can't easily connect without real creds.
    # BUT we can instantiate the adapter and call methods if we mock the connection logic?
    # Or valid creds?
    # The user request succeeded for 200 OK before.
    # I don't have creds.
    
    # ALTERNATIVE:
    # I can just paste the logic (the method body) here and test it with dummy inputs?
    # Yes, unit test style.
    
    print("Testing read_records_with_relations logic locally...")
    
    # Mock helper method
    class MockAdapter(PostgresAdapter):
        def __init__(self):
            self.datasource = datasource
            self.logger = logger
            self._pool = None
            
        async def _read_records_via_api(self, *args, **kwargs):
            return []
            
        def _build_where_clause(self, where, use_index=False, column_prefix=""):
            # Simple mock of base class method
            if not where: return "", []
            conds = []
            for f in where:
                conds.append(f"{f['field']} == {f['value']}")
            return " WHERE " + " AND ".join(conds), []

        # Override connect to do nothing
        async def connect(self):
            pass
            
        # Override acquire to return a dummy context
        def acquire(self):
            class DummyConn:
                async def fetch(self, query, *args):
                    print(f"\n[QUERY EXECUTED]: {query}\n")
                    return []
                async def fetchrow(self, query, *args):
                    return None
            
            class DummyContext:
                async def __aenter__(self):
                    return DummyConn()
                async def __aexit__(self, *args):
                    pass
            return DummyContext()
            
    # Instantiate
    adapter = MockAdapter()
    adapter._pool = adapter # Hack: acquire() is called on _pool
    
    # Test Data
    table = "institutions"
    related_specs = [
        {"table": "providers", "columns": ["provider_name"], "fk_col": "provider_id", "ref_col": "id"}
    ]
    where = [{"field": "providers.provider_name", "operator": "==", "value": "Applyboard"}]
    select = "*,providers(provider_name)"
    
    print(f"Test Inputs:\nTable: {table}\nSpecs: {related_specs}\nWhere: {where}")
    
    try:
        await adapter.read_records_with_relations(
            table,
            related_specs=related_specs,
            where=where,
            search=None
        )
        print("Success!")
    except Exception as e:
        print(f"Crashed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run_debug())
