import requests
import json
import sys

BASE_URL = "http://localhost:8000/api/sync"

def trace():
    print("--- Tracing Data Flow ---")
    
    # 1. Get Datasources
    print("\n1. Fetching Datasources...")
    try:
        r = requests.get(f"{BASE_URL}/datasources")
        datasources = r.json()
    except Exception as e:
        print(f"Failed to fetch datasources: {e}")
        return

    if not datasources:
        print("No datasources found.")
        return

    datasources_to_test = [ds for ds in datasources if ds['type'] in ['supabase', 'postgres', 'mysql']]
    if not datasources_to_test:
        print("No compatible datasources found.")
        return

    for target_ds in datasources_to_test:
        print(f"\n=== Testing Datasource: {target_ds['name']} (Type: {target_ds['type']}, ID: {target_ds['id']}) ===")
        ds_id = target_ds['id']

        # 2. Get Tables & find one with potential FKs
        print(f"2. Fetching Tables...")
        try:
            r = requests.get(f"{BASE_URL}/datasources/{ds_id}/tables")
            if r.status_code != 200:
                print(f"  Failed to fetch tables: {r.status_code}")
                continue
            tables = r.json()
        except Exception as e:
            print(f"  Failed to fetch tables: {e}")
            continue

        target_table = None
        # Priority list
        for t in ['programs', 'applications', 'comments', 'posts', 'invoices']:
            if t in tables:
                target_table = t
                break
                
        if not target_table:
            target_table = tables[0] if tables else None
            
        if not target_table:
            print("  No tables found.")
            continue
            
        print(f"Target Table: {target_table}")

        # 3. Fetch Schema to find FKs
        print(f"3. Fetching Schema for {target_table}...")
        try:
            r = requests.get(f"{BASE_URL}/datasources/{ds_id}/tables/{target_table}/schema")
            schema = r.json()
        except Exception as e:
            print(f"  Failed to fetch schema: {e}")
            continue

        fks = schema.get('foreign_keys', [])
        print(f"Found {len(fks)} Foreign Keys:")
        for fk in fks:
            print(f"  - {fk.get('constrained_columns')} -> {fk['referred_table']}.{fk['referred_columns']}")

        if not fks:
            print("  No FKs found on this table. Checking relationships endpoint...")
            try:
                r_rel = requests.get(f"{BASE_URL}/datasources/{ds_id}/relationships")
                rels = r_rel.json()
                print(f"  Found {len(rels)} global relationships.")
            except:
                pass
            continue
        
        # Construct select param
        # select=*,related_table(col)
        select_parts = ["*"]
        expected_keys = []
        
        for fk in fks[:2]: # Limit to first 2 FKs
            ref_table = fk['referred_table']
            try:
                r_ref = requests.get(f"{BASE_URL}/datasources/{ds_id}/tables/{ref_table}/schema")
                ref_schema = r_ref.json()
                ref_cols = [c['name'] for c in ref_schema['columns']]
                target_col = next((c for c in ref_cols if c in ['name', 'title', 'email', 'label', 'description']), ref_cols[0] if ref_cols else 'id')
                
                select_parts.append(f"{ref_table}({target_col})")
                expected_keys.append(f"{ref_table}.{target_col}")
                print(f"  -> Will request related: {ref_table}({target_col})")
            except:
                print(f"  -> Could not fetch schema for {ref_table}, skipping.")

        select_param = ",".join(select_parts)
        print(f"4. Fetching Data with select='{select_param}'...")
        
        url = f"{BASE_URL}/datasources/{ds_id}/tables/{target_table}/data?select={select_param}&limit=1"
        try:
            r = requests.get(url)
            if r.status_code != 200:
                print(f"  Error: {r.status_code} - {r.text}")
                continue
                
            data = r.json()
            records = data.get('records', [])
            print(f"  Fetched {len(records)} records.")
            
            if records:
                rec = records[0]
                print("  --- RECORD KEYS (First Record) ---")
                keys = list(rec.keys())
                keys.sort()
                found_any_related = False
                for k in keys:
                    if "." in k:
                        print(f"    [RELATED] {k}: {rec[k]}")
                        found_any_related = True
                    elif isinstance(rec[k], dict): # Check for nested objects
                        print(f"    [NESTED] {k}: {rec[k]}")
                        
                if not found_any_related:
                    print("    NO RELATED (flattened) keys found!")
                    
                # Check for missing keys
                print("  --- MISSING EXPECTED KEYS ---")
                for ek in expected_keys:
                    if ek not in rec:
                        # Check if nested?
                        parts = ek.split('.')
                        if parts[0] in rec and isinstance(rec[parts[0]], dict) and parts[1] in rec[parts[0]]:
                            print(f"    {ek} found as NESTED object (Backend flattening FAILED)")
                        else:
                            print(f"    {ek} is MISSING from response!")
                    else:
                        print(f"    {ek} is PRESENT (Flattened)")

        except Exception as e:
            print(f"  Failed to fetch data: {e}")

if __name__ == "__main__":
    trace()
