-- =============================================================================
-- Frontbase — Portable Query Functions (Phase 2 / Route A)
--
-- The portable subset of supabase_setup.sql for provisioning onto **plain
-- Postgres / Neon** datasources (the `proxy-rpc` fulfillment mode). These four
-- functions are auth-free and reference only `information_schema`, so they run
-- on any Postgres — unlike the full supabase_setup.sql whose Auth-Stats /
-- users-list functions reference `auth.users` and error on non-Supabase DBs.
--
-- Apply this script to a Neon/Postgres datasource (e.g. via the datasource
-- migration flow / SQL editor) to enable edge-built `frontbase_get_rows` /
-- `frontbase_aggregate` calls over the `/sql` HTTP endpoint.
--
//  Functions: frontbase__build_where, frontbase_get_rows, frontbase_search_rows,
//             frontbase_aggregate (new — not in supabase_setup.sql).
-- =============================================================================

-- 1. Shared Filter Builder
CREATE OR REPLACE FUNCTION frontbase__build_where(filters jsonb)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  where_conditions text := '';
  parts text[];
  filter_item jsonb;
  filter_col text;
  filter_type text;
  filter_op text;
  filter_value jsonb;
  quoted_col text;
  condition text;
BEGIN
  IF filters IS NULL OR jsonb_array_length(filters) = 0 THEN
    RETURN '';
  END IF;

  FOR filter_item IN SELECT * FROM jsonb_array_elements(filters)
  LOOP
    filter_col := filter_item->>'column';
    filter_type := filter_item->>'filterType';
    filter_op := filter_item->>'op';
    filter_value := filter_item->'value';

    IF filter_col IS NULL OR filter_col = '' OR (filter_value IS NULL AND COALESCE(filter_op, '') NOT IN ('is_null', 'not_null')) THEN
      CONTINUE;
    END IF;

    IF filter_col LIKE '%.%' THEN
        parts := string_to_array(filter_col, '.');
        quoted_col := format('%I.%I', parts[1], parts[2]);
    ELSE
        quoted_col := format('%I', filter_col);
    END IF;

    condition := NULL;

    IF filter_op IS NOT NULL AND filter_op <> '' THEN
      CASE filter_op
        WHEN 'eq'        THEN condition := format('%s = %L',  quoted_col, filter_value#>>'{}');
        WHEN 'neq'       THEN condition := format('%s IS DISTINCT FROM %L', quoted_col, filter_value#>>'{}');
        WHEN 'gt'        THEN condition := format('%s > %L',  quoted_col, filter_value#>>'{}');
        WHEN 'gte'       THEN condition := format('%s >= %L', quoted_col, filter_value#>>'{}');
        WHEN 'lt'        THEN condition := format('%s < %L',  quoted_col, filter_value#>>'{}');
        WHEN 'lte'       THEN condition := format('%s <= %L', quoted_col, filter_value#>>'{}');
        WHEN 'contains'  THEN condition := format('%s ILIKE %L', quoted_col, '%' || (filter_value#>>'{}') || '%');
        WHEN 'in'        THEN
          IF jsonb_typeof(filter_value) = 'array' AND jsonb_array_length(filter_value) > 0 THEN
            condition := format('%s IN (SELECT jsonb_array_elements_text(%L::jsonb))', quoted_col, filter_value::text);
          END IF;
        WHEN 'is_null'   THEN condition := format('%s IS NULL', quoted_col);
        WHEN 'not_null'  THEN condition := format('%s IS NOT NULL', quoted_col);
        ELSE condition := NULL;
      END CASE;
    ELSE
      CASE filter_type
      WHEN 'text' THEN
        IF filter_value::text != 'null' AND filter_value::text != '""' THEN
          condition := format('%s ILIKE %L', quoted_col, '%' || (filter_value#>>'{}'::text[]) || '%');
        END IF;
      WHEN 'equal', 'dropdown', 'select' THEN
        IF filter_value::text != 'null' AND filter_value::text != '""' THEN
          condition := format('%s::text = %L', quoted_col, filter_value#>>'{}'::text[]);
        END IF;
      WHEN 'multiselect' THEN
        IF jsonb_typeof(filter_value) = 'array' AND jsonb_array_length(filter_value) > 0 THEN
          condition := format('%s IN (SELECT jsonb_array_elements_text(%L::jsonb))', quoted_col, filter_value::text);
        END IF;
      WHEN 'number' THEN
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
        IF filter_value::text = 'true' OR filter_value::text = 'false' THEN
          condition := format('%s = %s', quoted_col, filter_value::boolean);
        END IF;
      ELSE
        condition := NULL;
      END CASE;
    END IF;

    IF condition IS NOT NULL AND condition != '' THEN
      IF where_conditions = '' THEN
        where_conditions := condition;
      ELSE
        where_conditions := where_conditions || ' AND ' || condition;
      END IF;
    END IF;
  END LOOP;

  RETURN where_conditions;
END;
$$;

-- 2. Advanced Rows Fetching (Sorting, Pagination, Joins)
CREATE OR REPLACE FUNCTION frontbase_get_rows(
  table_name text,
  columns text DEFAULT '*',
  joins jsonb DEFAULT '[]'::jsonb,
  sort_col text DEFAULT NULL,
  sort_dir text DEFAULT 'asc',
  page int DEFAULT 1,
  page_size int DEFAULT 10,
  filters jsonb DEFAULT '[]'::jsonb
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
  joined_tables text[] := ARRAY[]::text[];
  ref_table text;
  fk_col text;
  fk_ref_col text;
BEGIN
  FOR join_item IN SELECT * FROM jsonb_array_elements(joins)
  LOOP
    joined_tables := array_append(joined_tables, (join_item->>'table'));
    join_clause := join_clause || ' ' || (join_item->>'type') || ' JOIN ' ||
                   format('%I', (join_item->>'table')) || ' ON ' || (join_item->>'on');
  END LOOP;

  DECLARE
    match_record record;
  BEGIN
    FOR match_record IN
      SELECT (regexp_matches(columns, '"([a-zA-Z_][a-zA-Z0-9_]*)"\.', 'g'))[1] AS tbl
    LOOP
      ref_table := match_record.tbl;
      IF ref_table != table_name AND NOT (ref_table = ANY(joined_tables)) THEN
        SELECT kcu.column_name, ccu.column_name INTO fk_col, fk_ref_col
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = frontbase_get_rows.table_name
          AND ccu.table_name = ref_table
        LIMIT 1;
        IF fk_col IS NOT NULL THEN
          join_clause := join_clause || format(' LEFT JOIN %I ON %I.%I = %I.%I', ref_table, table_name, fk_col, ref_table, fk_ref_col);
          joined_tables := array_append(joined_tables, ref_table);
        END IF;
      END IF;
    END LOOP;
  END;

  FOR filter_item IN SELECT * FROM jsonb_array_elements(filters)
  LOOP
    filter_col := filter_item->>'column';
    IF filter_col LIKE '%.%' THEN
      ref_table := split_part(filter_col, '.', 1);
      IF ref_table != table_name AND NOT (ref_table = ANY(joined_tables)) THEN
        SELECT kcu.column_name, ccu.column_name INTO fk_col, fk_ref_col
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
          AND tc.table_name = frontbase_get_rows.table_name AND ccu.table_name = ref_table
        LIMIT 1;
        IF fk_col IS NOT NULL THEN
          join_clause := join_clause || format(' LEFT JOIN %I ON %I.%I = %I.%I', ref_table, table_name, fk_col, ref_table, fk_ref_col);
          joined_tables := array_append(joined_tables, ref_table);
        END IF;
      END IF;
    END IF;
  END LOOP;

  DECLARE filter_conds text;
  BEGIN
    filter_conds := frontbase__build_where(filters);
    IF filter_conds != '' THEN where_clause := 'WHERE ' || filter_conds; END IF;
  END;

  IF sort_col IS NOT NULL AND sort_col != '' THEN
    order_clause := 'ORDER BY ' || sort_col || ' ' || COALESCE(sort_dir, 'asc');
  ELSE
    order_clause := '';
  END IF;

  offset_val := (page - 1) * page_size;

  query := format('SELECT %s FROM %I %s %s %s LIMIT %s OFFSET %s', columns, table_name, join_clause, where_clause, order_clause, page_size, offset_val);
  EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;

  count_query := format('SELECT COUNT(*) FROM %I %s %s', table_name, join_clause, where_clause);
  EXECUTE count_query INTO total_count;

  RETURN json_build_object('rows', COALESCE(result, '[]'::json), 'total', total_count);
END;
$$;

-- 3. Universal Search with Auto-Join Detection
CREATE OR REPLACE FUNCTION frontbase_search_rows(
  table_name text,
  columns text,
  joins jsonb,
  search_query text,
  search_cols text[],
  page int DEFAULT 1,
  page_size int DEFAULT 10,
  filters jsonb DEFAULT '[]'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  query text; count_query text; result json; total_count bigint; offset_val int;
  join_item jsonb; join_clause text := ''; where_clause text := '';
  search_where text := ''; filter_where text := '';
  filter_item jsonb; filter_col text; col text; first_col boolean := true;
  joined_tables text[] := ARRAY[]::text[]; ref_table text; fk_col text; fk_ref_col text;
BEGIN
  FOR join_item IN SELECT * FROM jsonb_array_elements(joins)
  LOOP
    joined_tables := array_append(joined_tables, (join_item->>'table'));
    join_clause := join_clause || ' ' || (join_item->>'type') || ' JOIN ' || format('%I', (join_item->>'table')) || ' ON ' || (join_item->>'on');
  END LOOP;

  IF search_cols IS NOT NULL THEN
    FOREACH col IN ARRAY search_cols
    LOOP
      IF col LIKE '%.%' THEN
        ref_table := split_part(col, '.', 1);
        IF ref_table != table_name AND NOT (ref_table = ANY(joined_tables)) THEN
          SELECT kcu.column_name, ccu.column_name INTO fk_col, fk_ref_col
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = frontbase_search_rows.table_name AND ccu.table_name = ref_table
          LIMIT 1;
          IF fk_col IS NOT NULL THEN
            join_clause := join_clause || format(' LEFT JOIN %I ON %I.%I = %I.%I', ref_table, table_name, fk_col, ref_table, fk_ref_col);
            joined_tables := array_append(joined_tables, ref_table);
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF search_cols IS NOT NULL AND array_length(search_cols, 1) > 0 AND search_query IS NOT NULL AND search_query != '' THEN
    search_where := '(';
    FOREACH col IN ARRAY search_cols
    LOOP
      IF NOT first_col THEN search_where := search_where || ' OR '; END IF;
      IF col LIKE '%.%' THEN
        search_where := search_where || format('%I.%I::text ILIKE %L', split_part(col, '.', 1), split_part(col, '.', 2), '%' || search_query || '%');
      ELSE
        search_where := search_where || format('%I::text ILIKE %L', col, '%' || search_query || '%');
      END IF;
      first_col := false;
    END LOOP;
    search_where := search_where || ')';
  END IF;

  filter_where := frontbase__build_where(filters);

  IF search_where != '' OR filter_where != '' THEN
    where_clause := 'WHERE ';
    IF search_where != '' AND filter_where != '' THEN
      where_clause := where_clause || search_where || ' AND ' || filter_where;
    ELSIF search_where != '' THEN where_clause := where_clause || search_where;
    ELSE where_clause := where_clause || filter_where; END IF;
  END IF;

  offset_val := (page - 1) * page_size;
  query := format('SELECT %s FROM %I %s %s LIMIT %s OFFSET %s', columns, table_name, join_clause, where_clause, page_size, offset_val);
  EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;
  count_query := format('SELECT COUNT(*) FROM %I %s %s', table_name, join_clause, where_clause);
  EXECUTE count_query INTO total_count;

  RETURN json_build_object('rows', COALESCE(result, '[]'::json), 'total', total_count);
END;
$$;

-- 4. Aggregation (GROUP BY) — new, not in supabase_setup.sql
CREATE OR REPLACE FUNCTION frontbase_aggregate(
  table_name text,
  category text,
  aggregation text DEFAULT 'count',
  value_col text DEFAULT NULL,
  filters jsonb DEFAULT '[]'::jsonb,
  sort text DEFAULT 'none',
  row_limit int DEFAULT 10
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  where_clause text := '';
  val_expr text;
  query text;
  result json;
BEGIN
  where_clause := frontbase__build_where(filters);
  IF where_clause != '' THEN where_clause := 'WHERE ' || where_clause; END IF;

  val_expr := CASE aggregation
    WHEN 'count'  THEN 'COUNT(*)'
    WHEN 'sum'    THEN format('COALESCE(SUM((%I)::numeric), 0)', value_col)
    WHEN 'average' THEN format('COALESCE(AVG((%I)::numeric), 0)', value_col)
    WHEN 'min'    THEN format('MIN((%I)::numeric)', value_col)
    WHEN 'max'    THEN format('MAX((%I)::numeric)', value_col)
    ELSE 'COUNT(*)'
  END;

  query := format(
    'SELECT %I::text AS category, %s AS value FROM %I %s GROUP BY %I ORDER BY ',
    category, val_expr, table_name, where_clause, category
  );

  IF sort = 'asc' THEN
    query := query || 'value ASC';
  ELSIF sort = 'desc' THEN
    query := query || 'value DESC';
  ELSE
    query := query || format('%I', category);
  END IF;

  query := query || format(' LIMIT %s', row_limit);

  EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$$;
