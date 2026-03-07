"""
Supabase PostgREST Query Builder

Extracted from supabase_adapter.py for single-responsibility compliance.
Handles REST API query construction, filtering, search, and counting
via Supabase PostgREST endpoints.
"""

from typing import Any, Callable, Awaitable, Dict, List, Optional, Union
import logging
import httpx


logger = logging.getLogger(__name__)


async def build_search_conditions(
    table: str,
    search: str,
    schema_getter: Callable[[str], Awaitable[Dict[str, Any]]],
    client: httpx.AsyncClient,
    related_specs: Optional[List[Dict[str, Any]]] = None,
) -> List[str]:
    """
    Build PostgREST OR conditions for text search across main + related tables.

    2-step strategy for related tables:
    1. Find text columns in related table
    2. Query related table for matching IDs
    3. Add fk_col.in.(ids) to the OR clause

    Returns a list of PostgREST condition strings.
    """
    schema = await schema_getter(table)
    cols = [
        c["name"]
        for c in schema.get("columns", [])
        if any(t in str(c.get("type", "")).lower() for t in ["char", "text", "string", "varchar"])
    ]
    or_conds = [f"{col}.ilike.*{search}*" for col in cols[:10]]

    if related_specs:
        for spec in related_specs:
            t_name = spec["table"]
            try:
                rel_schema = await schema_getter(t_name)
                rel_cols = [
                    c["name"]
                    for c in rel_schema.get("columns", [])
                    if any(t in str(c.get("type", "")).lower() for t in ["char", "text", "string", "varchar"])
                ]

                # Find FK column in main table pointing to related table
                fk_col = None
                if schema and "foreign_keys" in schema:
                    for fk in schema["foreign_keys"]:
                        if fk.get("target_table") == t_name:
                            fk_col = fk.get("column")
                            break

                if fk_col and rel_cols:
                    rel_or = [f"{rc}.ilike.*{search}*" for rc in rel_cols[:5]]
                    rel_params = {
                        "select": "id",
                        "or": f"({','.join(rel_or)})",
                        "limit": "50",
                    }
                    try:
                        rel_res = await client.get(f"/rest/v1/{t_name}", params=rel_params)
                        if rel_res.status_code == 200:
                            rel_ids = [str(r["id"]) for r in rel_res.json() if "id" in r]
                            if rel_ids:
                                or_conds.append(f"{fk_col}.in.({','.join(rel_ids)})")
                    except Exception:
                        pass
            except Exception:
                continue

    return or_conds


def build_filter_params(
    where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]],
) -> tuple[Dict[str, str], set]:
    """
    Convert where clause to PostgREST filter params.
    Returns (params_dict, set_of_related_table_names_in_filters).
    """
    params: Dict[str, str] = {}
    related_filters: set = set()

    if not where:
        return params, related_filters

    filter_list = (
        where
        if isinstance(where, list)
        else [{"field": k, "operator": "==", "value": v} for k, v in where.items()]
    )

    for f in filter_list:
        k = f.get("field")
        v = f.get("value")
        op = f.get("operator", "==")

        if k and "." in k:
            related_filters.add(k.split(".")[0])

        if not k or v is None:
            continue

        if op == "==":
            params[k] = f"eq.{v}"
        elif op == "!=":
            params[k] = f"neq.{v}"
        elif op == ">":
            params[k] = f"gt.{v}"
        elif op == "<":
            params[k] = f"lt.{v}"
        elif op == "contains":
            params[k] = f"ilike.*{v}*"

    return params, related_filters


async def read_records_via_api(
    client: httpx.AsyncClient,
    table: str,
    schema_getter: Callable[[str], Awaitable[Dict[str, Any]]],
    columns: Optional[List[str]] = None,
    where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
    limit: int = 100,
    offset: int = 0,
    order_by: Optional[str] = None,
    order_direction: Optional[str] = "asc",
    select_param: Optional[str] = None,
    search: Optional[str] = None,
    related_specs: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Read records using Supabase REST API."""
    params: Dict[str, str] = {}

    # Build select
    final_select = select_param if select_param else (",".join(columns) if columns else "*")

    # Detect related table filters and inject !inner join
    filter_params, related_filters = build_filter_params(where)

    if related_filters and final_select:
        for t in related_filters:
            if f"{t}(" in final_select and f"{t}!inner(" not in final_select:
                final_select = final_select.replace(f"{t}(", f"{t}!inner(")

    params["select"] = final_select
    params.update(filter_params)

    # Search
    if search:
        try:
            or_conds = await build_search_conditions(
                table, search, schema_getter, client, related_specs
            )
            if or_conds:
                params["or"] = f"({','.join(or_conds)})"
        except Exception:
            pass

    # Order
    if order_by:
        if "." in order_by:
            parts = order_by.split(".")
            if len(parts) >= 2:
                table_part = parts[0]
                col_part = ".".join(parts[1:])
                direction = "desc" if order_direction and order_direction.lower() == "desc" else "asc"
                params["order"] = f"{table_part}({col_part}).{direction}"
        else:
            direction = ".desc" if order_direction and order_direction.lower() == "desc" else ".asc"
            params["order"] = f"{order_by}{direction}"

    params["limit"] = str(limit)
    params["offset"] = str(offset)

    response = await client.get(f"/rest/v1/{table}", params=params)

    if response.status_code >= 400:
        raise ValueError(f"Supabase API Read Error: {response.text} - Params: {params}")

    response.raise_for_status()
    return response.json()


async def count_records_via_api(
    client: httpx.AsyncClient,
    table: str,
    schema_getter: Callable[[str], Awaitable[Dict[str, Any]]],
    where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
    related_specs: Optional[List[Dict[str, Any]]] = None,
    search: Optional[str] = None,
) -> int:
    """Count records using Supabase REST API with Content-Range header."""
    select_val = "*"

    filter_params, related_filters = build_filter_params(where)

    # Build embeddings for related tables
    if related_specs:
        embeddings = []
        for spec in related_specs:
            t = spec["table"]
            suffix = "!inner" if t in related_filters else ""
            if suffix or search:
                embeddings.append(f"{t}{suffix}(*)")
        if embeddings:
            select_val = f"*,{','.join(embeddings)}"

    params: Dict[str, str] = {"select": select_val, "limit": "1", "offset": "0"}
    params.update(filter_params)

    # Search
    if search:
        try:
            or_conds = await build_search_conditions(
                table, search, schema_getter, client, related_specs
            )
            if or_conds:
                params["or"] = f"({','.join(or_conds)})"
        except Exception:
            pass

    response = await client.get(
        f"/rest/v1/{table}",
        params=params,
        headers={"Prefer": "count=exact"},
    )

    if response.status_code >= 400:
        raise ValueError(f"Supabase API Error: {response.text} - Params: {params}")

    response.raise_for_status()

    content_range = response.headers.get("content-range", "")
    if "/" in content_range:
        return int(content_range.split("/")[-1])
    return 0
