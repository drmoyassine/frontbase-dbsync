from pydantic import BaseModel, Field, ConfigDict
from typing import Dict, Any, Optional
import sys

# Replicate the DataRequest Class EXACTLY as it is in app/schemas/publish.py
# (Lines 65-79 of app/schemas/publish.py)
class DataRequest(BaseModel):
    """
    Pre-computed HTTP request spec for data fetching.
    Computed at publish time so Hono doesn't need adapter logic.
    """
    url: str  # Full URL with query params (may contain {{ENV_VAR}} placeholders)
    method: str = "GET"  # HTTP method
    headers: Dict[str, str] = {}  # Headers (may contain {{ENV_VAR}} placeholders)
    body: Optional[Dict[str, Any]] = None  # For POST requests (SQL queries)
    result_path: str = Field("", alias="resultPath")  # JSON path to extract data (e.g., "rows", "data")
    flatten_relations: bool = Field(True, alias="flattenRelations")  # Flatten nested objects to "table.column"
    query_config: Optional[Dict[str, Any]] = Field(None, alias="queryConfig")  # Added for DataTable RPC config
    
    class Config:
        populate_by_name = True

def verify_extra_behavior():
    print("--- Pydantic Extra Fields Verification ---")
    
    # 1. Simulate the data Dictionary coming from backend logic
    # This matches what pages_router.py generates in _compute_supabase_request
    input_data = {
        "url": "http://localhost:3002/api/rpc/invoke",
        "method": "POST",
        "headers": {"Content-Type": "application/json"},
        "resultPath": "data",
        "flattenRelations": True,
        # THIS IS THE FIELD THAT IS MISSING IN SCHEMA
        "queryConfig": {
            "useRpc": True,
            "frontendFilters": ["status", "category"], 
            "sorting": {"column": "created_at"}
        }
    }
    
    print(f"\n1. Input Data Keys: {list(input_data.keys())}")
    print(f"   Contains 'queryConfig'? {'queryConfig' in input_data}")

    # 2. Instantiate the Model
    try:
        model = DataRequest(**input_data)
        print("\n2. Model Instantiation Successful")
    except Exception as e:
        print(f"\n2. Model Instantiation Failed: {e}")
        sys.exit(1)

    # 3. Check what happened to queryConfig
    # In Pydantic V2, model.model_dump() (or dict() in V1) only returns defined fields by default
    # unless extra='allow' is set in Config.
    
    dumped_data = model.model_dump(by_alias=True)
    print(f"\n3. Dumped Data Keys: {list(dumped_data.keys())}")
    
    if "queryConfig" not in dumped_data:
        print("\n--- CONCLUSION ---")
        print("Confirmed: 'queryConfig' was STRIPPED.")
        print("Reason: It is not defined in the class schema, and Pydantic default behavior is extra='ignore'.")
    else:
        print("\n--- CONCLUSION ---")
        print("Unexpected: 'queryConfig' WAS PRESERVED.")

if __name__ == "__main__":
    verify_extra_behavior()
