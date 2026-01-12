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
  page_size int DEFAULT 10,
  filters jsonb DEFAULT '[]'::jsonb  -- NEW: Support for simultaneous filtering
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
  search_where text := '';
  filter_where text := '';
  col text;
  first_col boolean := true;
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

  -- 1. Build Search Conditions
  IF array_length(search_cols, 1) > 0 AND search_query IS NOT NULL AND search_query != '' THEN
    search_where := '(';
    FOREACH col IN ARRAY search_cols
    LOOP
      IF NOT first_col THEN
        search_where := search_where || ' OR ';
      END IF;
      -- ILIKE for case-insensitive search
      search_where := search_where || col || '::text ILIKE ' || quote_literal('%' || search_query || '%');
      first_col := false;
    END LOOP;
    search_where := search_where || ')';
  END IF;

  -- 2. Build Filter Conditions (Reuse logic from frontbase_get_rows)
  FOR filter_item IN SELECT * FROM jsonb_array_elements(filters)
  LOOP
    filter_col := filter_item->>'column';
    filter_type := filter_item->>'filterType';
    filter_value := filter_item->'value';
    
    -- Skip if no column or value
    IF filter_col IS NULL OR filter_col = '' OR filter_value IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Handle schema/table qualification
    DECLARE
        parts text[];
    BEGIN
        IF filter_col LIKE '%.%' THEN
            parts := string_to_array(filter_col, '.');
            quoted_col := format('%I.%I', parts[1], parts[2]);
        ELSE
            quoted_col := format('%I', filter_col);
        END IF;
    END;

    -- Build condition based on filter type
    condition := NULL;
    
    CASE filter_type
      WHEN 'text' THEN
        IF filter_value::text != 'null' AND filter_value::text != '""' THEN
          condition := format('%s ILIKE %L', quoted_col, '%' || (filter_value#>>'{}') || '%');
        END IF;
      WHEN 'equal', 'dropdown', 'select' THEN
        IF filter_value::text != 'null' AND filter_value::text != '""' THEN
           condition := format('%s::text = %L', quoted_col, filter_value#>>'{}');
        END IF;
      WHEN 'boolean' THEN
        IF filter_value::text != 'null' THEN
          condition := format('%s IS %s', quoted_col, (filter_value#>>'{}')::boolean);
        END IF;
    END CASE;
    
    -- Append condition to filter_where
    IF condition IS NOT NULL AND condition != '' THEN
      IF filter_where = '' THEN
        filter_where := condition;
      ELSE
        filter_where := filter_where || ' AND ' || condition;
      END IF;
    END IF;
  END LOOP;

  -- 3. Combine clauses
  IF search_where != '' OR filter_where != '' THEN
      where_clause := 'WHERE ';
      IF search_where != '' AND filter_where != '' THEN
          where_clause := where_clause || search_where || ' AND ' || filter_where;
      ELSIF search_where != '' THEN
          where_clause := where_clause || search_where;
      ELSE
          where_clause := where_clause || filter_where;
      END IF;
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
-- ============================================================
-- LEGACY/DEPRECATED: This function is superseded by frontbase_get_distinct_values (Section 8)
-- which supports cascading filters and search query context.
-- TODO: Confirm no usage and remove in future cleanup.
-- ============================================================
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

-- 8. Get Distinct Values (Generic with Optional Join + Cascading Filters + Search)
-- Usage: fetch unique values for a column, optionally filtering by other active filters AND current search query
-- Example 1: Get cities only where country = 'USA'
--   SELECT frontbase_get_distinct_values('cities', 'city_name', NULL, NULL, NULL, '[{"column": "country", "filterType": "dropdown", "value": "USA"}]'::jsonb)
-- Example 2: Get countries that match search "University" across name column
--   SELECT frontbase_get_distinct_values('universities', 'country', NULL, NULL, NULL, '[]'::jsonb, 'University', ARRAY['name'])
CREATE OR REPLACE FUNCTION frontbase_get_distinct_values(
  target_table text,
  target_col text,
  join_table text DEFAULT NULL,
  target_join_col text DEFAULT NULL,
  join_table_col text DEFAULT NULL,
  filters jsonb DEFAULT '[]'::jsonb,       -- Cascading filter context
  search_query text DEFAULT NULL,          -- NEW: Current search query
  search_cols text[] DEFAULT '{}'::text[]  -- NEW: Columns to search across
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
  where_clause text := '';
  filter_where text := '';
  search_where text := '';
  filter_item jsonb;
  filter_col text;
  filter_type text;
  filter_value jsonb;
  condition text;
  quoted_col text;
  col text;
  first_col boolean := true;
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

  -- 1. Build Search Conditions (if search_query provided)
  IF search_query IS NOT NULL AND search_query != '' AND array_length(search_cols, 1) > 0 THEN
    search_where := '(';
    first_col := true;
    FOREACH col IN ARRAY search_cols
    LOOP
      IF NOT first_col THEN
        search_where := search_where || ' OR ';
      END IF;
      -- Handle table.column notation for search columns
      IF col LIKE '%.%' THEN
        search_where := search_where || format('t.%I::text ILIKE %L', split_part(col, '.', 2), '%' || search_query || '%');
      ELSE
        search_where := search_where || format('t.%I::text ILIKE %L', col, '%' || search_query || '%');
      END IF;
      first_col := false;
    END LOOP;
    search_where := search_where || ')';
  END IF;

  -- 2. Build Filter Conditions (cascading filter support)
  FOR filter_item IN SELECT * FROM jsonb_array_elements(filters)
  LOOP
    filter_col := filter_item->>'column';
    filter_type := filter_item->>'filterType';
    filter_value := filter_item->'value';
    
    -- Skip if no column or value
    IF filter_col IS NULL OR filter_col = '' OR filter_value IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Handle table.column notation
    DECLARE
        parts text[];
    BEGIN
        IF filter_col LIKE '%.%' THEN
            parts := string_to_array(filter_col, '.');
            quoted_col := format('t.%I', parts[2]);  -- Use table alias 't'
        ELSE
            quoted_col := format('t.%I', filter_col);
        END IF;
    END;

    -- Build condition based on filter type
    condition := NULL;
    
    CASE filter_type
      WHEN 'text' THEN
        IF filter_value::text != 'null' AND filter_value::text != '""' THEN
          condition := format('%s ILIKE %L', quoted_col, '%' || (filter_value#>>'{}') || '%');
        END IF;
        
      WHEN 'dropdown', 'select' THEN
        IF filter_value::text != 'null' AND filter_value::text != '""' THEN
          condition := format('%s::text = %L', quoted_col, filter_value#>>'{}');
        END IF;
        
      WHEN 'multiselect' THEN
        IF jsonb_typeof(filter_value) = 'array' AND jsonb_array_length(filter_value) > 0 THEN
          condition := format('%s IN (SELECT jsonb_array_elements_text(%L::jsonb))', quoted_col, filter_value::text);
        END IF;
        
      WHEN 'boolean' THEN
        IF filter_value::text = 'true' OR filter_value::text = 'false' THEN
          condition := format('%s = %s', quoted_col, filter_value::boolean);
        END IF;
        
      ELSE
        -- Default: exact match
        IF filter_value::text != 'null' AND filter_value::text != '""' THEN
          condition := format('%s::text = %L', quoted_col, filter_value#>>'{}');
        END IF;
    END CASE;
    
    -- Append condition to filter_where
    IF condition IS NOT NULL AND condition != '' THEN
      IF filter_where = '' THEN
        filter_where := condition;
      ELSE
        filter_where := filter_where || ' AND ' || condition;
      END IF;
    END IF;
  END LOOP;

  -- 3. Combine search and filter clauses
  -- Logic: (search_conditions) AND (filter_conditions)
  IF search_where != '' OR filter_where != '' THEN
    where_clause := 'WHERE ';
    IF search_where != '' AND filter_where != '' THEN
      where_clause := where_clause || search_where || ' AND ' || filter_where;
    ELSIF search_where != '' THEN
      where_clause := where_clause || search_where;
    ELSE
      where_clause := where_clause || filter_where;
    END IF;
  END IF;

  -- Construct Query
  -- Note: We use %I for column names to ensure they are quoted
  -- target_table_ident is already quoted above via format
  query := format('SELECT DISTINCT t.%I FROM %s t', target_col, target_table_ident);

  -- Optional Inner Join
  IF join_table IS NOT NULL AND target_join_col IS NOT NULL AND join_table_col IS NOT NULL THEN
     query := query || format(
       ' INNER JOIN %s j ON t.%I = j.%I', 
       join_table_ident, target_join_col, join_table_col
     );
  END IF;

  -- Apply WHERE clause (search + filters)
  IF where_clause != '' THEN
    query := query || ' ' || where_clause;
  END IF;

  -- Order
  query := format('%s ORDER BY t.%I ASC', query, target_col);

  -- Execute
  EXECUTE 'SELECT json_agg(val) FROM (' || query || ') v(val)' INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- ============================================================
-- RLS POLICY MANAGEMENT FUNCTIONS
-- ============================================================

-- 9. List All RLS Policies
-- Returns all RLS policies from pg_policies view
CREATE OR REPLACE FUNCTION frontbase_list_rls_policies(
  p_schema_name text DEFAULT 'public'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(policy_data) INTO result
  FROM (
    SELECT
      policyname as policy_name,
      schemaname as schema_name,
      tablename as table_name,
      CASE 
        WHEN cmd = 'r' THEN 'SELECT'
        WHEN cmd = 'a' THEN 'INSERT'
        WHEN cmd = 'w' THEN 'UPDATE'
        WHEN cmd = 'd' THEN 'DELETE'
        WHEN cmd = '*' THEN 'ALL'
        ELSE cmd::text
      END as operation,
      permissive as is_permissive,
      roles,
      qual as using_expression,
      with_check as check_expression
    FROM pg_policies
    WHERE schemaname = p_schema_name
    ORDER BY tablename, policyname
  ) policy_data;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- 10. Get RLS Status for Tables
-- Returns which tables have RLS enabled
CREATE OR REPLACE FUNCTION frontbase_get_rls_status(
  p_schema_name text DEFAULT 'public'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(table_data) INTO result
  FROM (
    SELECT
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as rls_forced,
      (SELECT count(*) FROM pg_policies WHERE tablename = c.relname AND schemaname = p_schema_name) as policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = p_schema_name
      AND c.relkind = 'r'  -- regular tables only
    ORDER BY c.relname
  ) table_data;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- 11. Create RLS Policy
-- Creates a new RLS policy on a table
CREATE OR REPLACE FUNCTION frontbase_create_rls_policy(
  p_table_name text,
  p_policy_name text,
  p_operation text,        -- 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL'
  p_using_expr text,       -- USING clause expression
  p_check_expr text DEFAULT NULL,  -- WITH CHECK clause (optional)
  p_roles text[] DEFAULT ARRAY['authenticated'],
  p_permissive boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sql_stmt text;
  cmd_type text;
  policy_type text;
  roles_str text;
BEGIN
  -- Validate operation
  IF p_operation NOT IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid operation. Must be SELECT, INSERT, UPDATE, DELETE, or ALL');
  END IF;

  -- Build command type
  cmd_type := CASE p_operation
    WHEN 'SELECT' THEN 'SELECT'
    WHEN 'INSERT' THEN 'INSERT'
    WHEN 'UPDATE' THEN 'UPDATE'
    WHEN 'DELETE' THEN 'DELETE'
    WHEN 'ALL' THEN 'ALL'
  END;

  -- Build policy type
  policy_type := CASE WHEN p_permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END;

  -- Build roles string
  roles_str := array_to_string(p_roles, ', ');

  -- Build the CREATE POLICY statement
  sql_stmt := format(
    'CREATE POLICY %I ON %I AS %s FOR %s TO %s',
    p_policy_name,
    p_table_name,
    policy_type,
    cmd_type,
    roles_str
  );

  -- Add USING clause
  IF p_using_expr IS NOT NULL AND p_using_expr != '' THEN
    sql_stmt := sql_stmt || format(' USING (%s)', p_using_expr);
  END IF;

  -- Add WITH CHECK clause (only valid for INSERT, UPDATE, ALL)
  IF p_check_expr IS NOT NULL AND p_check_expr != '' AND p_operation IN ('INSERT', 'UPDATE', 'ALL') THEN
    sql_stmt := sql_stmt || format(' WITH CHECK (%s)', p_check_expr);
  END IF;

  -- Execute
  BEGIN
    EXECUTE sql_stmt;
    RETURN json_build_object(
      'success', true,
      'message', format('Policy "%s" created on table "%s"', p_policy_name, p_table_name),
      'sql', sql_stmt
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'sql', sql_stmt
    );
  END;
END;
$$;

-- 12. Drop RLS Policy
CREATE OR REPLACE FUNCTION frontbase_drop_rls_policy(
  p_table_name text,
  p_policy_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sql_stmt text;
BEGIN
  sql_stmt := format('DROP POLICY IF EXISTS %I ON %I', p_policy_name, p_table_name);

  BEGIN
    EXECUTE sql_stmt;
    RETURN json_build_object(
      'success', true,
      'message', format('Policy "%s" dropped from table "%s"', p_policy_name, p_table_name),
      'sql', sql_stmt
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'sql', sql_stmt
    );
  END;
END;
$$;

-- 13. Toggle RLS on Table
CREATE OR REPLACE FUNCTION frontbase_toggle_table_rls(
  p_table_name text,
  p_enable boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sql_stmt text;
BEGIN
  IF p_enable THEN
    sql_stmt := format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table_name);
  ELSE
    sql_stmt := format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', p_table_name);
  END IF;

  BEGIN
    EXECUTE sql_stmt;
    RETURN json_build_object(
      'success', true,
      'message', format('RLS %s on table "%s"', CASE WHEN p_enable THEN 'enabled' ELSE 'disabled' END, p_table_name),
      'sql', sql_stmt
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'sql', sql_stmt
    );
  END;
END;
$$;

-- 14. Update RLS Policy (Drop + Create)
-- PostgreSQL doesn't support ALTER POLICY for expression changes, so we drop and recreate
CREATE OR REPLACE FUNCTION frontbase_update_rls_policy(
  p_table_name text,
  p_old_policy_name text,
  p_new_policy_name text,
  p_operation text,
  p_using_expr text,
  p_check_expr text DEFAULT NULL,
  p_roles text[] DEFAULT ARRAY['authenticated'],
  p_permissive boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  drop_result json;
  create_result json;
BEGIN
  -- First drop the old policy
  SELECT frontbase_drop_rls_policy(p_table_name, p_old_policy_name) INTO drop_result;
  
  IF NOT (drop_result->>'success')::boolean THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Failed to drop old policy: ' || (drop_result->>'error'),
      'step', 'drop'
    );
  END IF;

  -- Then create the new policy
  SELECT frontbase_create_rls_policy(
    p_table_name,
    p_new_policy_name,
    p_operation,
    p_using_expr,
    p_check_expr,
    p_roles,
    p_permissive
  ) INTO create_result;

  IF NOT (create_result->>'success')::boolean THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Failed to create new policy: ' || (create_result->>'error'),
      'step', 'create'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', format('Policy updated: "%s" -> "%s" on table "%s"', p_old_policy_name, p_new_policy_name, p_table_name)
  );
END;
$$;

-- 15. Batch Create RLS Policies
-- Creates multiple RLS policies in a single transaction (optimal for batch operations)
-- Accepts a JSONB array of policy definitions
CREATE OR REPLACE FUNCTION frontbase_create_rls_policies_batch(
  p_policies jsonb  -- Array of {table_name, policy_name, operation, using_expr, check_expr, roles, permissive}
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  policy_item jsonb;
  sql_stmt text;
  cmd_type text;
  policy_type text;
  roles_str text;
  v_table_name text;
  v_policy_name text;
  v_operation text;
  v_using_expr text;
  v_check_expr text;
  v_roles text[];
  v_permissive boolean;
  results jsonb := '[]'::jsonb;
  success_count int := 0;
  error_count int := 0;
  policy_result jsonb;
BEGIN
  -- Loop through each policy definition
  FOR policy_item IN SELECT * FROM jsonb_array_elements(p_policies)
  LOOP
    -- Extract fields from policy item
    v_table_name := policy_item->>'table_name';
    v_policy_name := policy_item->>'policy_name';
    v_operation := UPPER(COALESCE(policy_item->>'operation', 'ALL'));
    v_using_expr := policy_item->>'using_expr';
    v_check_expr := policy_item->>'check_expr';
    v_roles := COALESCE(
      (SELECT array_agg(elem::text) FROM jsonb_array_elements_text(policy_item->'roles') elem),
      ARRAY['authenticated']
    );
    v_permissive := COALESCE((policy_item->>'permissive')::boolean, true);

    -- Validate operation
    IF v_operation NOT IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL') THEN
      policy_result := jsonb_build_object(
        'table_name', v_table_name,
        'policy_name', v_policy_name,
        'success', false,
        'error', 'Invalid operation: ' || v_operation
      );
      results := results || policy_result;
      error_count := error_count + 1;
      CONTINUE;
    END IF;

    -- Build policy type
    policy_type := CASE WHEN v_permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END;

    -- Build roles string
    roles_str := array_to_string(v_roles, ', ');

    -- Build the CREATE POLICY statement
    sql_stmt := format(
      'CREATE POLICY %I ON %I AS %s FOR %s TO %s',
      v_policy_name,
      v_table_name,
      policy_type,
      v_operation,
      roles_str
    );

    -- Add USING clause
    IF v_using_expr IS NOT NULL AND v_using_expr != '' THEN
      sql_stmt := sql_stmt || format(' USING (%s)', v_using_expr);
    END IF;

    -- Add WITH CHECK clause (only valid for INSERT, UPDATE, ALL)
    IF v_check_expr IS NOT NULL AND v_check_expr != '' AND v_operation IN ('INSERT', 'UPDATE', 'ALL') THEN
      sql_stmt := sql_stmt || format(' WITH CHECK (%s)', v_check_expr);
    END IF;

    -- Execute
    BEGIN
      EXECUTE sql_stmt;
      policy_result := jsonb_build_object(
        'table_name', v_table_name,
        'policy_name', v_policy_name,
        'success', true,
        'sql', sql_stmt
      );
      success_count := success_count + 1;
    EXCEPTION WHEN OTHERS THEN
      policy_result := jsonb_build_object(
        'table_name', v_table_name,
        'policy_name', v_policy_name,
        'success', false,
        'error', SQLERRM,
        'sql', sql_stmt
      );
      error_count := error_count + 1;
    END;

    results := results || policy_result;
  END LOOP;

  RETURN json_build_object(
    'success', error_count = 0,
    'message', format('Created %s policies, %s failed', success_count, error_count),
    'policies', results,
    'success_count', success_count,
    'error_count', error_count
  );
END;
$$;
