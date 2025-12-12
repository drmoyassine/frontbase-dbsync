-- 8. Get Filter Options for Users (Auth + Contacts Join)
CREATE OR REPLACE FUNCTION frontbase_get_users_filter_options(
  table_name text,
  auth_id_col text,
  column_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  query text;
  result json;
BEGIN
  -- Construct query to get distinct values from the joined set
  -- Handles both auth columns and contact columns
  IF column_name = 'auth_email' OR column_name = 'email' THEN
    query := format(
      'SELECT DISTINCT au.email 
       FROM auth.users au
       INNER JOIN %I c ON au.id = c.%I
       ORDER BY au.email ASC',
      table_name,
      auth_id_col
    );
  ELSIF column_name = 'auth_created_at' THEN
    -- For dates, we might want simple distinct, or distinct dates without time
    -- For now, simple distinct
    query := format(
      'SELECT DISTINCT au.created_at 
       FROM auth.users au
       INNER JOIN %I c ON au.id = c.%I
       ORDER BY au.created_at DESC',
      table_name,
      auth_id_col
    );
  ELSE
    -- Contact table column
    query := format(
      'SELECT DISTINCT c.%I 
       FROM auth.users au
       INNER JOIN %I c ON au.id = c.%I
       ORDER BY c.%I ASC',
      column_name,
      table_name,
      auth_id_col,
      column_name
    );
  END IF;

  EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
