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
  order_clause text := '';
BEGIN
  -- Build JOIN clause
  FOR join_item IN SELECT * FROM jsonb_array_elements(joins)
  LOOP
    join_clause := join_clause || ' ' || (join_item->>'type') || ' JOIN ' || (join_item->>'table') || ' ON ' || (join_item->>'on');
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
          AND table_name = sort_table 
          AND column_name = clean_sort_col;
        
        -- Apply LOWER if Text
        IF col_type IN ('text', 'character varying', 'varchar', 'char', 'citext') THEN
             order_clause := 'ORDER BY LOWER(' || sort_col || '::text) ' || COALESCE(sort_dir, 'asc');
        ELSE
             order_clause := 'ORDER BY ' || sort_col || ' ' || COALESCE(sort_dir, 'asc');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Fallback if something goes wrong (e.g. strict permissions or weird identifiers)
        order_clause := 'ORDER BY ' || sort_col || ' ' || COALESCE(sort_dir, 'asc');
    END;
  ELSE
    order_clause := ''; 
  END IF;

  offset_val := (page - 1) * page_size;

  -- Construct Main Query
  query := format(
    'SELECT %s FROM %I %s %s LIMIT %s OFFSET %s',
    columns,
    table_name,
    join_clause,
    order_clause,
    page_size,
    offset_val
  );

  -- Execute Main Query
  EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;

  -- Construct Count Query (for pagination)
  count_query := format(
    'SELECT COUNT(*) FROM %I %s',
    table_name,
    join_clause
  );
  
  EXECUTE count_query INTO total_count;

  -- Return combined result
  RETURN json_build_object(
    'rows', COALESCE(result, '[]'::json),
    'total', total_count,
    'page', page,
    'page_size', page_size,
    '_debug_order', order_clause
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
