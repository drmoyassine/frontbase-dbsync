
import asyncio
import aiomysql
import json

async def debug_schema():
    host = "31.187.76.205"
    port = 3306
    user = "site_19315"
    password = "VSpaCbVcNtcMJh5S"
    db = "site_19315"
    table = "wp_mylisting_locations"
    
    print(f"Connecting to {host}:{port} / {db}...")
    
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
                print(f"Inspecting table {table}...")
                
                # Check FKs
                print("Querying KEY_COLUMN_USAGE...")
                await cur.execute("""
                    SELECT 
                        COLUMN_NAME,
                        REFERENCED_TABLE_NAME,
                        REFERENCED_COLUMN_NAME
                    FROM information_schema.KEY_COLUMN_USAGE
                    WHERE TABLE_SCHEMA = %s
                    AND TABLE_NAME = %s
                    AND REFERENCED_TABLE_NAME IS NOT NULL
                """, (db, table))
                
                rows = await cur.fetchall()
                print(f"Found {len(rows)} FKs:")
                for r in rows:
                    print(r)
                    
                # Check tables
                await cur.execute("SHOW TABLES")
                tables = await cur.fetchall()
                t_list = [list(r.values())[0] for r in tables] if isinstance(tables[0], dict) else [r[0] for r in tables]
                print(f"Tables found: {len(t_list)}")
                if "wp_posts" in t_list:
                     print("wp_posts FOUND.")
                     await cur.execute("DESCRIBE `wp_posts`")
                     post_cols = await cur.fetchall()
                     print("wp_posts Columns:")
                     for c in post_cols:
                         print(f"{c[0]}")
                else:
                     print("wp_posts NOT FOUND!")

        pool.close()
        await pool.wait_closed()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(debug_schema())
