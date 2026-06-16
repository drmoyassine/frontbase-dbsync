"""
Chart aggregation SQL builder.

Charts always group their data by a category column and aggregate a measure
(count/sum/average/min/max) per group. Doing this in the database — instead of
fetching a page of rows and aggregating in the browser — is the only correct
approach: you cannot aggregate a dataset you have already truncated.

This module builds a safe Postgres-dialect GROUP BY query. It is shared by:
- the builder data endpoint (via the datasource adapters), and
- the publish-time request computation (baked into an exec_sql RPC call).

Identifiers are double-quoted/escaped and literals are single-quoted/escaped.
v1 supports base-table columns only (no joined "table.col" categories).
"""

from typing import Any, Dict, List, Optional

_AGG_FUNCS = {"count", "sum", "average", "min", "max"}
_SQL_FUNC = {"sum": "SUM", "average": "AVG", "min": "MIN", "max": "MAX"}


def _q_ident(name: str) -> str:
    """Double-quote a SQL identifier, supporting a dotted table.column form."""
    return ".".join('"' + part.replace('"', '""') + '"' for part in str(name).split("."))


def _q_lit(value: Any) -> str:
    """Single-quote a SQL string literal."""
    return "'" + str(value).replace("'", "''") + "'"


def _build_where(filters: Optional[List[Dict[str, Any]]]) -> str:
    """Build a WHERE clause from a list of filter dicts.

    Accepts both the builder shape ({field, operator, value}) and the edge shape
    ({column, filterType, value}). Only a pragmatic subset of operators is
    supported here; unknown operators are skipped.
    """
    if not filters:
        return ""
    conditions: List[str] = []
    for f in filters:
        if not isinstance(f, dict):
            continue
        col = f.get("column") or f.get("field")
        if not col:
            continue
        op = (f.get("operator") or f.get("filterType") or "==").lower()
        val = f.get("value")

        # Valueless operators
        if op in ("is_null",):
            conditions.append(f"{_q_ident(col)} IS NULL")
            continue
        if op in ("not_null",):
            conditions.append(f"{_q_ident(col)} IS NOT NULL")
            continue

        if val is None or val == "":
            continue

        c = _q_ident(col)
        if op in ("==", "eq", "dropdown"):
            conditions.append(f"{c} = {_q_lit(val)}")
        elif op in ("!=", "neq"):
            conditions.append(f"{c} IS DISTINCT FROM {_q_lit(val)}")
        elif op in ("contains", "text", "ilike"):
            conditions.append(f"CAST({c} AS TEXT) ILIKE {_q_lit('%' + str(val) + '%')}")
        elif op in (">", "gt"):
            conditions.append(f"{c} > {_q_lit(val)}")
        elif op in (">=", "gte"):
            conditions.append(f"{c} >= {_q_lit(val)}")
        elif op in ("<", "lt"):
            conditions.append(f"{c} < {_q_lit(val)}")
        elif op in ("<=", "lte"):
            conditions.append(f"{c} <= {_q_lit(val)}")
        elif op in ("in", "multiselect"):
            vals = val if isinstance(val, list) else [v.strip() for v in str(val).split(",") if v.strip()]
            if vals:
                conditions.append(f"{c} IN ({', '.join(_q_lit(v) for v in vals)})")

    return (" WHERE " + " AND ".join(conditions)) if conditions else ""


def build_aggregate_sql(
    table: str,
    category: str,
    aggregation: str = "count",
    value: Optional[str] = None,
    filters: Optional[List[Dict[str, Any]]] = None,
    sort: str = "none",
    limit: int = 10,
) -> str:
    """Build a `SELECT <category> AS category, <agg> AS value ... GROUP BY` query.

    The result rows are shaped {category, value} so the chart can render them
    directly with no further aggregation.
    """
    agg = (aggregation or "count").lower()
    if agg not in _AGG_FUNCS:
        agg = "count"

    cat = _q_ident(category)

    # 'count' tallies rows and needs no value column. Anything else needs a
    # column; if one wasn't provided we degrade to count rather than emit bad SQL.
    if agg == "count" or not value:
        measure = "COUNT(*)"
    else:
        col = _q_ident(value)
        if agg in ("sum", "average"):
            # Cast to numeric so text-typed columns don't blow up; '' -> NULL.
            measure = f"{_SQL_FUNC[agg]}(NULLIF(CAST({col} AS TEXT), '')::numeric)"
        else:  # min / max
            measure = f"{_SQL_FUNC[agg]}({col})"

    where_sql = _build_where(filters)

    order_sql = ""
    if sort == "asc":
        order_sql = " ORDER BY value ASC NULLS LAST"
    elif sort == "desc":
        order_sql = " ORDER BY value DESC NULLS LAST"

    try:
        lim = max(1, min(int(limit or 10), 1000))
    except (TypeError, ValueError):
        lim = 10

    return (
        f"SELECT {cat} AS category, {measure} AS value "
        f"FROM {_q_ident(table)}{where_sql} "
        f"GROUP BY {cat}{order_sql} LIMIT {lim}"
    )
