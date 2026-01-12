
import sys
import os

# Add current directory to path so we can import app
sys.path.append(os.getcwd())

from app.schemas.publish import PageComponent, ComponentBinding, DataRequest

def test_packaging():
    print("Testing Pydantic Schema Packaging...")
    
    # simulate the dictionary created by pages_router.py
    binding_dict = {
        "componentId": "test-comp",
        "datasourceId": "test-ds",
        "tableName": "test_table",
        "filtering": {"searchEnabled": True},
        "frontendFilters": [{"id": "f1", "column": "col1"}],
        "dataRequest": {
            "url": "http://test",
            "method": "GET",
            "resultPath": "rows",
            "flattenRelations": True,
            "queryConfig": {
                "useRpc": True,
                "rpcUrl": "test_rpc"
            }
        }
    }
    
    comp_dict = {
        "id": "test-comp-id",
        "type": "DataTable",
        "binding": binding_dict
    }
    
    print(f"\n[1] Input Dict (subset): {binding_dict['dataRequest'].keys()}")
    
    # Instantiate PageComponent
    try:
        page_comp = PageComponent(**comp_dict)
        print("\n[2] Instantiation Success")
        
        # Check if fields are preserved in the model instance
        if page_comp.binding and page_comp.binding.data_request:
            dr = page_comp.binding.data_request
            print(f"[3] DataRequest keys in model: {dr.model_dump(by_alias=True).keys()}")
            
            if dr.query_config:
                print(f"[4] queryConfig FOUND: {dr.query_config}")
            else:
                print(f"[4] queryConfig MISSING in model instance")
                
            if page_comp.binding.filtering:
                print(f"[5] filtering FOUND: {page_comp.binding.filtering}")
            else:
                 print(f"[5] filtering MISSING in model instance")
        else:
            print("[3] Binding or DataRequest missing in model")
            
        # Check serialization (dump)
        dumped = page_comp.model_dump(by_alias=True)
        dumped_dr = dumped['binding']['dataRequest']
        print(f"\n[6] Dumped DataRequest keys: {dumped_dr.keys()}")
        
        if 'queryConfig' in dumped_dr:
             print(f"[7] queryConfig PRESENT in dump")
        else:
             print(f"[7] queryConfig ABSENT in dump")
             
    except Exception as e:
        print(f"\n[ERROR] Instantiation failed: {e}")

if __name__ == "__main__":
    test_packaging()
