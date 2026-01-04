
import asyncio
import aiomysql
import json

async def verify_schema():
    host = "31.187.76.205"
    port = 3306
    user = "site_19315"
    password = "VSpaCbVcNtcMJh5S"
    db = "site_19315"
    related_table = "wp_posts"
    
    print(f"Connecting to {host}:{port} / {db} to verify {related_table} access...")
    
    try:
        pool = await aiomysql.create_pool(
            host=host,
            port=port,
            user=user,
            password=password,
            db=db,
            autocommit=True
        )
        
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                print(f"Inspecting table {related_table}...")
                
                await cur.execute(f"DESCRIBE `{related_table}`")
                cols = await cur.fetchall()
                
                print(f"\n--- Schema Verification for {related_table} ---")
                print(f"Column count: {len(cols)}")
                
                # Check for useful columns often used in display
                target_cols = ['post_title', 'post_content', 'post_date', 'ID']
                found_cols = []
                for c in cols:
                    if c[0] in target_cols:
                        found_cols.append(c[0])
                        
                print(f"Found target columns: {found_cols}")
                if len(found_cols) == 4:
                     print("SUCCESS: Essential columns present.")
                else:
                     print("WARNING: Some target columns missing.")

        pool.close()
        await pool.wait_closed()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(verify_schema())
