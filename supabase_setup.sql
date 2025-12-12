-- Enable the exec_sql function to allow the builder to query schema metadata
-- Run this in your Supabase SQL Editor

-- 1. Generic SQL Execution (Use with caution)
CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;
  RETURN result;
END;
$$;

-- 2. Advanced Rows Fetching (Sorting, Pagination, Joins)
-- Usage example:
-- select frontbase_get_rows(
--   'users', 
--   'users.*, profiles.full_name', 
--   '[{"table": "profiles", "on": "users.id = profiles.user_id", "type": "left"}]'::jsonb, 
--   'profiles.full_name', 
--   'asc', 
--   1, 
--   10
-- );
CREATE OR REPLACE FUNCTION frontbase_get_rows(
  table_name text,
  columns text DEFAULT '*',
  joins jsonb DEFAULT '[]'::jsonb,
  sort_col text DEFAULT NULL,
  sort_dir text DEFAULT 'asc',
  page int DEFAULT 1,
  page_size int DEFAULT 10,
  filters jsonb DEFAULT '[]'::jsonb  -- NEW: Array of filter objects
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  query text;
  count_query text;
  result json;
  total_count bigint;
  offset_val int;
  join_item jsonb;
  join_clause text := '';
  order_clause text := '';
  where_clause text := '';
  filter_item jsonb;
  filter_col text;
  filter_type text;
  filter_value jsonb;
  condition text;
  quoted_col text;
BEGIN
  -- Build JOIN clause
  FOR join_item IN SELECT * FROM jsonb_array_elements(joins)
  LOOP
    join_clause := join_clause || ' ' || (join_item->>'type') || ' JOIN ' || (join_item->>'table') || ' ON ' || (join_item->>'on');
  END LOOP;
  
  -- Build WHERE clause from filters
  FOR filter_item IN SELECT * FROM jsonb_array_elements(filters)
  LOOP
    filter_col := filter_item->>'column';
    filter_type := filter_item->>'filterType';
    filter_value := filter_item->'value';
    
    -- Skip if no column or value
    IF filter_col IS NULL OR filter_col = '' OR filter_value IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Handle schema/table qualification for column (e.g. "auth.users.email" or "table.col")
    DECLARE
        parts text[];
    BEGIN
        IF filter_col LIKE '%.%' THEN
            parts := string_to_array(filter_col, '.');
            -- Format as "part1"."part2" (supports unlimited depth effectively, but usually 2)
            -- For simplicity in common case of table.col:
            quoted_col := format('%I.%I', parts[1], parts[2]);
            -- If 3 parts (schema.table.col): quoted_col := format('%I.%I.%I', parts[1], parts[2], parts[3]);
        ELSE
            quoted_col := format('%I', filter_col);
        END IF;
    END;

    -- Build condition based on filter type
    condition := NULL;
    
    CASE filter_type
      WHEN 'text' THEN
        -- Text search with ILIKE
        IF filter_value::text != 'null' AND filter_value::text != '""' THEN
          condition := format('%s ILIKE %L', quoted_col, '%' || (filter_value#>>'{}') || '%');
        END IF;
        
      WHEN 'dropdown' THEN
        -- Exact match
        IF filter_value::text != 'null' AND filter_value::text != '""' THEN
          condition := format('%s = %L', quoted_col, filter_value#>>'{}');
        END IF;
        
      WHEN 'multiselect' THEN
        -- IN clause for array of values
        IF jsonb_array_length(filter_value) > 0 THEN
          condition := format('%s IN (SELECT jsonb_array_elements_text(%L::jsonb))', quoted_col, filter_value::text);
        END IF;
        
      WHEN 'number' THEN
        -- Number range: expects {min: X, max: Y}
        IF filter_value->>'min' IS NOT NULL THEN
          condition := format('%s >= %s', quoted_col, (filter_value->>'min')::numeric);
        END IF;
        IF filter_value->>'max' IS NOT NULL THEN
          IF condition IS NOT NULL THEN
            condition := condition || ' AND ';
          END IF;
          condition := COALESCE(condition, '') || format('%s <= %s', quoted_col, (filter_value->>'max')::numeric);
        END IF;
        
      WHEN 'dateRange' THEN
        -- Date range: expects {start: 'YYYY-MM-DD', end: 'YYYY-MM-DD'} or {lastDays: N}
        IF filter_value->>'lastDays' IS NOT NULL THEN
          condition := format('%s >= NOW() - INTERVAL %L', quoted_col, (filter_value->>'lastDays')::int || ' days');
        ELSE
          IF filter_value->>'start' IS NOT NULL THEN
            condition := format('%s >= %L', quoted_col, filter_value->>'start');
          END IF;
          IF filter_value->>'end' IS NOT NULL THEN
            IF condition IS NOT NULL THEN
              condition := condition || ' AND ';
            END IF;
            condition := COALESCE(condition, '') || format('%s <= %L', quoted_col, filter_value->>'end');
          END IF;
        END IF;
        
      WHEN 'boolean' THEN
        -- Boolean comparison
        IF filter_value::text = 'true' OR filter_value::text = 'false' THEN
          condition := format('%s = %s', quoted_col, filter_value::boolean);
        END IF;
        
      ELSE
        -- Unknown filter type, skip
        condition := NULL;
    END CASE;
    
    -- Append condition to WHERE clause
    IF condition IS NOT NULL AND condition != '' THEN
      IF where_clause = '' THEN
        where_clause := 'WHERE ' || condition;
      ELSE
        where_clause := where_clause || ' AND ' || condition;
      END IF;
    END IF;
  END LOOP;
  
  -- Build ORDER BY clause
  IF sort_col IS NOT NULL AND sort_col != '' THEN
    DECLARE
        sort_table text;
        clean_sort_col text;
        col_type text;
    BEGIN
        -- Attempt to detect table and column name
        -- Handle "table"."column" format
        IF sort_col LIKE '%.%' THEN
           sort_table := split_part(sort_col, '.', 1);
           clean_sort_col := split_part(sort_col, '.', 2);
        ELSE
           sort_table := table_name;
           clean_sort_col := sort_col;
        END IF;

        -- Clean quotes
        sort_table := replace(sort_table, '"', '');
        clean_sort_col := replace(clean_sort_col, '"', '');

        -- Lookup Type
        SELECT data_type INTO col_type
        FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND information_schema.columns.table_name = sort_table 
          AND column_name = clean_sort_col;
        
        -- Build quoted column reference for ORDER BY
        DECLARE
            quoted_sort_col text;
        BEGIN
            IF sort_col LIKE '%.%' THEN
                -- Quote both parts: table.column -> "table"."column"
                quoted_sort_col := format('%I.%I', sort_table, clean_sort_col);
            ELSE
                quoted_sort_col := format('%I', clean_sort_col);
            END IF;

            -- Apply LOWER if Text
            IF col_type IN ('text', 'character varying', 'varchar', 'char', 'citext') THEN
                 order_clause := 'ORDER BY LOWER(' || quoted_sort_col || '::text) ' || COALESCE(sort_dir, 'asc');
            ELSE
                 order_clause := 'ORDER BY ' || quoted_sort_col || ' ' || COALESCE(sort_dir, 'asc');
            END IF;
        END;
    EXCEPTION WHEN OTHERS THEN
        -- Fallback if something goes wrong (e.g. strict permissions or weird identifiers)
        order_clause := 'ORDER BY ' || sort_col || ' ' || COALESCE(sort_dir, 'asc');
    END;
  ELSE
    order_clause := ''; 
  END IF;

  offset_val := (page - 1) * page_size;

  -- Construct Main Query (now with WHERE clause)
  query := format(
    'SELECT %s FROM %I %s %s %s LIMIT %s OFFSET %s',
    columns,
    table_name,
    join_clause,
    where_clause,
    order_clause,
    page_size,
    offset_val
  );

  -- Execute Main Query
  EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;

  -- Construct Count Query (for pagination - also needs WHERE clause)
  count_query := format(
    'SELECT COUNT(*) FROM %I %s %s',
    table_name,
    join_clause,
    where_clause
  );
  
  EXECUTE count_query INTO total_count;

  -- Return combined result
  RETURN json_build_object(
    'rows', COALESCE(result, '[]'::json),
    'total', total_count,
    'page', page,
    'page_size', page_size,
    '_debug_order', order_clause,
    '_debug_where', where_clause
  );
END;
$$;

-- 3. Universal Search
-- Usage: search across specific columns with joins
CREATE OR REPLACE FUNCTION frontbase_search_rows(
  table_name text,
  columns text,
  joins jsonb,
  search_query text,
  search_cols text[], -- e.g. ARRAY['users.email', 'profiles.name']
  page int DEFAULT 1,
  page_size int DEFAULT 10
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  query text;
  count_query text;
  result json;
  total_count bigint;
  offset_val int;
  join_item jsonb;
  join_clause text := '';
  where_clause text := '';
  col text;
  first_col boolean := true;
BEGIN
  -- Build JOIN clause
  FOR join_item IN SELECT * FROM jsonb_array_elements(joins)
  LOOP
    join_clause := join_clause || ' ' || (join_item->>'type') || ' JOIN ' || (join_item->>'table') || ' ON ' || (join_item->>'on');
  END LOOP;

  -- Build WHERE clause for Search
  IF array_length(search_cols, 1) > 0 THEN
    where_clause := 'WHERE ';
    FOREACH col IN ARRAY search_cols
    LOOP
      IF NOT first_col THEN
        where_clause := where_clause || ' OR ';
      END IF;
      -- ILIKE for case-insensitive search
      where_clause := where_clause || col || '::text ILIKE ' || quote_literal('%' || search_query || '%');
      first_col := false;
    END LOOP;
  END IF;

  offset_val := (page - 1) * page_size;

  -- Main Query
  query := format(
    'SELECT %s FROM %I %s %s LIMIT %s OFFSET %s',
    columns,
    table_name,
    join_clause,
    where_clause,
    page_size,
    offset_val
  );

  EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;

  -- Count Query
  count_query := format(
    'SELECT COUNT(*) FROM %I %s %s',
    table_name,
    join_clause,
    where_clause
  );

  EXECUTE count_query INTO total_count;

  RETURN json_build_object(
    'rows', COALESCE(result, '[]'::json),
    'total', total_count,
    'page', page
  );
END;
$$;

-- 4. Distinct Values
CREATE OR REPLACE FUNCTION frontbase_get_distinct(
  table_name text,
  column_name text,
  joins jsonb DEFAULT '[]'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  query text;
  result json;
  join_item jsonb;
  join_clause text := '';
BEGIN
  FOR join_item IN SELECT * FROM jsonb_array_elements(joins)
  LOOP
    join_clause := join_clause || ' ' || (join_item->>'type') || ' JOIN ' || (join_item->>'table') || ' ON ' || (join_item->>'on');
  END LOOP;

  query := format(
    'SELECT DISTINCT %s FROM %I %s ORDER BY %s ASC',
    column_name,
    table_name,
    join_clause,
    column_name
  );

  EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- 5. Schema Introspection (Clean & Fast)
CREATE OR REPLACE FUNCTION frontbase_get_schema_info()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Returns a structured object of Tables -> Columns, and Relations
  SELECT json_build_object(
    'tables', (
      SELECT json_agg(t) FROM (
        SELECT 
          table_name,
          (
            SELECT json_agg(c) FROM (
              SELECT column_name, data_type, is_nullable
              FROM information_schema.columns 
              WHERE table_schema = 'public' AND table_name = t_main.table_name
            ) c
          ) as columns
        FROM information_schema.tables t_main
        WHERE table_schema = 'public'
      ) t
    ),
    'foreign_keys', (
      SELECT json_agg(fk) FROM (
        SELECT
            tc.table_name, 
            kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name 
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ) fk
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- 6. Auth Stats (Direct from Supabase Auth)
-- Usage: Returns total users and new users from auth.users
CREATE OR REPLACE FUNCTION frontbase_get_auth_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_count bigint;
  new_count bigint;
BEGIN
  -- Count all users in auth schema
  SELECT count(*) INTO total_count FROM auth.users;
  
  -- Count users created in the last 7 days
  SELECT count(*) INTO new_count 
  FROM auth.users 
  WHERE created_at >= NOW() - INTERVAL '7 days';
  
  RETURN json_build_object(
    'total_users', total_count,
    'new_users', new_count,
    'source', 'auth.users'
  );
END;
$$;

-- 7. Get Users List (Auth + Contacts Join)
-- Usage: Returns paginated list of users with their contact details
CREATE OR REPLACE FUNCTION frontbase_get_users_list(
  table_name text,
  auth_id_col text,
  page int DEFAULT 1,
  page_size int DEFAULT 10,
  search_query text DEFAULT '',
  sort_col text DEFAULT 'created_at',
  sort_dir text DEFAULT 'desc',
  filters json DEFAULT '[]'::json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  query text;
  count_query text;
  result json;
  total_count bigint;
  offset_val int;
  order_clause text;
  where_clause text;
BEGIN
  offset_val := (page - 1) * page_size;

  -- Base Where Clause
  where_clause := 'WHERE 1=1';
  
  -- Search (Simple search on email or contact id for now)
  IF search_query IS NOT NULL AND search_query != '' THEN
    where_clause := where_clause || format(' AND (au.email ILIKE %L OR c.id::text ILIKE %L)', '%' || search_query || '%', '%' || search_query || '%');
  END IF;

  -- Sorting
  -- explicit mapping for auth columns
  IF sort_col = 'created_at' OR sort_col = 'auth_created_at' THEN
    order_clause := 'ORDER BY au.created_at ' || sort_dir;
  ELSIF sort_col = 'email' THEN
    order_clause := 'ORDER BY au.email ' || sort_dir;
  ELSIF sort_col = 'last_sign_in_at' THEN
    order_clause := 'ORDER BY au.last_sign_in_at ' || sort_dir;
  ELSE
    -- Default to contact column for anything else
    -- Use quote_ident to prevent SQL injection on column names
    order_clause := format('ORDER BY c.%I %s', sort_col, sort_dir); 
  END IF;

  -- Dynamic Query
  query := format(
    'SELECT 
       au.id as auth_id,
       au.email as auth_email,
       au.created_at as auth_created_at,
       au.last_sign_in_at,
       c.*
     FROM auth.users au
     INNER JOIN %I c ON au.id = c.%I
     %s
     %s
     LIMIT %s OFFSET %s',
    table_name,
    auth_id_col,
    where_clause,
    order_clause,
    page_size,
    offset_val
  );

  -- Execute Main Query
  EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;

  -- Count Query
  count_query := format(
    'SELECT COUNT(*) 
     FROM auth.users au
     INNER JOIN %I c ON au.id = c.%I
     %s',
    table_name,
    auth_id_col,
    where_clause
  );

  EXECUTE count_query INTO total_count;

  RETURN json_build_object(
    'rows', COALESCE(result, '[]'::json),
    'total', total_count,
    'page', page
  );
END;
$$;

-- 8. Get Distinct Values (Generic with Optional Join)
-- Usage: fetch unique values for a column, optionally filtering by an INNER JOIN to another table
CREATE OR REPLACE FUNCTION frontbase_get_distinct_values(
  target_table text,
  target_col text,
  join_table text DEFAULT NULL,
  target_join_col text DEFAULT NULL,
  join_table_col text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  query text;
  result json;
  target_table_ident text;
  join_table_ident text;
BEGIN
  -- Basic Validation
  IF target_table IS NULL OR target_col IS NULL THEN
     RAISE EXCEPTION 'target_table and target_col are required';
  END IF;

  -- Handle Schema Qualification for Target Table
  IF target_table LIKE '%.%' THEN
    target_table_ident := format('%I.%I', split_part(target_table, '.', 1), split_part(target_table, '.', 2));
  ELSE
    target_table_ident := format('%I', target_table);
  END IF;

  -- Handle Schema Qualification for Join Table
  IF join_table IS NOT NULL THEN
    IF join_table LIKE '%.%' THEN
      join_table_ident := format('%I.%I', split_part(join_table, '.', 1), split_part(join_table, '.', 2));
    ELSE
      join_table_ident := format('%I', join_table);
    END IF;
  END IF;

  -- Construct Query
  -- Note: We use %s for table identifiers because they are already safely formatted above using %I
  query := format('SELECT DISTINCT t.%I FROM %s t', target_col, target_table_ident);

  -- Optional Inner Join
  IF join_table IS NOT NULL AND target_join_col IS NOT NULL AND join_table_col IS NOT NULL THEN
     query := query || format(
       ' INNER JOIN %s j ON t.%I = j.%I', 
       join_table_ident, target_join_col, join_table_col
     );
  END IF;

  -- Order
  query := query || format(' ORDER BY t.%I ASC', target_col);

  -- Execute
  EXECUTE 'SELECT json_agg(val) FROM (' || query || ') v(val)' INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
