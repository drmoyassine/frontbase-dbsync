#!/usr/bin/env python3
"""
Comprehensive diagnostic script for filter options issue.
Checks the entire data flow from FastAPI -> Hono -> Supabase.
"""

import sqlite3
import json
import requests
import os

def check_hono_page_config():
    """Check if published page has optionsDataRequest in filters"""
    print("=" * 60)
    print("STEP 1: Checking Hono Pages Database")
    print("=" * 60)
    
    db_path = os.path.join(os.getcwd(), 'services', 'actions', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject', 'pages.db')
    
    if not os.path.exists(db_path):
        print(f"❌ Hono pages.db not found at: {db_path}")
        return None
    
    conn = sqlite3.connect(db_path)
    cursor = conn.execute("SELECT slug, config FROM pages LIMIT 1")
    row = cursor.fetchone()
    
    if not row:
        print("❌ No pages found in Hono database")
        return None
    
    slug, config_str = row
    config = json.loads(config_str)
    
    print(f"✅ Found page: {slug}")
    
    # Find DataTable component
    layout = config.get('layout', {})
    components = layout.get('components', [])
    
    datatable = None
    for comp in components:
        if comp.get('type') == 'datatable':
            datatable = comp
            break
    
    if not datatable:
        print("❌ No DataTable component found")
        return None
    
    print("✅ Found DataTable component")
    
    # Check binding
    binding = datatable.get('binding') or datatable.get('props', {}).get('binding')
    if not binding:
        print("❌ No binding found in DataTable")
        return None
    
    # Check frontendFilters
    filters = binding.get('frontendFilters', [])
    print(f"\n📊 Frontend Filters: {len(filters)} found")
    
    has_options_request = False
    for i, f in enumerate(filters):
        print(f"\nFilter {i+1}: {f.get('label', f.get('column'))}")
        print(f"  - Type: {f.get('filterType')}")
        print(f"  - Column: {f.get('column')}")
        
        if 'optionsDataRequest' in f:
            print(f"  ✅ Has optionsDataRequest")
            req = f['optionsDataRequest']
            print(f"     URL: {req.get('url', 'N/A')[:60]}...")
            print(f"     Method: {req.get('method')}")
            print(f"     Body: {req.get('body')}")
            has_options_request = True
        else:
            print(f"  ❌ Missing optionsDataRequest")
    
    if not has_options_request:
        print("\n❌ PROBLEM: No filters have optionsDataRequest!")
        print("   → You need to REPUBLISH the page from the Builder")
        return None
    
    return filters

def test_rpc_directly():
    """Test the RPC function directly with real credentials"""
    print("\n" + "=" * 60)
    print("STEP 2: Testing RPC Function Directly")
    print("=" * 60)
    
    db_path = os.path.join(os.getcwd(), 'fastapi-backend', 'unified.db')
    conn = sqlite3.connect(db_path)
    cursor = conn.execute("SELECT api_url, anon_key_encrypted FROM datasources WHERE is_active = 1 LIMIT 1")
    row = cursor.fetchone()
    
    if not row:
        print("❌ No datasource found")
        return False
    
    api_url, anon_key = row
    rpc_url = f"{api_url}/rest/v1/rpc/frontbase_get_distinct_values"
    
    # Test with a known column
    test_cases = [
        {"target_table": "institutions", "target_col": "name", "label": "Primary Column"},
        {"target_table": "countries", "target_col": "country", "label": "Related Column"}
    ]
    
    for test in test_cases:
        print(f"\n🧪 Testing: {test['label']}")
        print(f"   Table: {test['target_table']}, Column: {test['target_col']}")
        
        headers = {
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json"
        }
        
        payload = {k: v for k, v in test.items() if k not in ['label']}
        
        try:
            response = requests.post(rpc_url, json=payload, headers=headers, timeout=10)
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Success! Got {len(data) if isinstance(data, list) else 'N/A'} values")
                if isinstance(data, list) and len(data) > 0:
                    print(f"   Sample: {data[:3]}")
            else:
                print(f"   ❌ Failed: {response.text[:200]}")
                return False
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return False
    
    return True

def check_hono_proxy():
    """Test Hono's /api/data/execute endpoint"""
    print("\n" + "=" * 60)
    print("STEP 3: Testing Hono Proxy Endpoint")
    print("=" * 60)
    
    # Get a real optionsDataRequest from the page config
    db_path = os.path.join(os.getcwd(), 'services', 'actions', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject', 'pages.db')
    conn = sqlite3.connect(db_path)
    cursor = conn.execute("SELECT config FROM pages LIMIT 1")
    row = cursor.fetchone()
    
    if not row:
        print("❌ No pages found")
        return False
    
    config = json.loads(row[0])
    layout = config.get('layout', {})
    components = layout.get('components', [])
    
    datatable = next((c for c in components if c.get('type') == 'datatable'), None)
    if not datatable:
        print("❌ No DataTable found")
        return False
    
    binding = datatable.get('binding') or datatable.get('props', {}).get('binding')
    filters = binding.get('frontendFilters', [])
    
    options_filter = next((f for f in filters if 'optionsDataRequest' in f), None)
    if not options_filter:
        print("❌ No filter with optionsDataRequest found")
        return False
    
    data_request = options_filter['optionsDataRequest']
    
    print(f"✅ Found optionsDataRequest")
    print(f"   Testing via Hono proxy...")
    
    # Assuming Hono is running on localhost:3000
    hono_url = "http://localhost:3000/api/data/execute"
    
    try:
        response = requests.post(
            hono_url,
            json={"dataRequest": data_request},
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"   ✅ Proxy Success!")
            print(f"   Response: {json.dumps(result, indent=2)[:300]}...")
            return True
        else:
            print(f"   ❌ Proxy Failed: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"   ❌ Error calling Hono: {e}")
        return False

def main():
    print("\n🔍 FILTER OPTIONS DIAGNOSTIC TOOL")
    print("=" * 60)
    
    # Step 1: Check Hono page config
    filters = check_hono_page_config()
    if filters is None:
        print("\n⚠️  DIAGNOSTIC FAILED AT STEP 1")
        print("   → Please REPUBLISH your page from the Builder")
        return
    
    # Step 2: Test RPC directly
    rpc_ok = test_rpc_directly()
    if not rpc_ok:
        print("\n⚠️  DIAGNOSTIC FAILED AT STEP 2")
        print("   → RPC function has issues. Check SQL function definition.")
        return
    
    # Step 3: Test Hono proxy
    proxy_ok = check_hono_proxy()
    if not proxy_ok:
        print("\n⚠️  DIAGNOSTIC FAILED AT STEP 3")
        print("   → Hono proxy endpoint has issues")
        return
    
    print("\n" + "=" * 60)
    print("✅ ALL CHECKS PASSED!")
    print("=" * 60)
    print("\nIf filters still don't work in the browser:")
    print("1. Open browser DevTools (F12)")
    print("2. Go to Network tab")
    print("3. Filter by 'execute'")
    print("4. Refresh the page")
    print("5. Check if /api/data/execute calls are being made")
    print("6. Check Console tab for JavaScript errors")

if __name__ == "__main__":
    main()
