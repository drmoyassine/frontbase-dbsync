"""Response contracts for the database domain (CF-22 P0 burn-down).

Table rows and RPC results are inherently dynamic (they come from USER tables),
so `list[dict]` / `Any` on those payloads is the honest contract — the typed
part is the envelope and the schema/metadata shapes the console relies on.
"""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class TableRef(BaseModel):
    """A table reference from the database catalog (e.g. Supabase definitions).

    `schema` is exposed as the JSON key `schema` (matching the catalog payload)
    via an alias, so the field name does not shadow `BaseModel.schema`.
    """

    model_config = ConfigDict(populate_by_name=True)

    name: str
    schema_: str = Field(default="public", alias="schema")


class TablesData(BaseModel):
    tables: list[TableRef]


class TablesEnvelope(BaseModel):
    success: bool
    data: Optional[TablesData] = None
    message: Optional[str] = None
    error: Optional[str] = None


class ColumnInfo(BaseModel):
    """Column descriptor with both snake_case and frontend-alias keys."""

    column_name: str
    data_type: Optional[str] = None
    is_nullable: Optional[str] = None
    column_default: Optional[Any] = None
    is_primary: Optional[bool] = None
    is_foreign: Optional[bool] = None
    foreign_table: Optional[str] = None
    foreign_column: Optional[str] = None
    name: str
    type: Optional[str] = None
    isForeign: Optional[bool] = None
    foreignTable: Optional[str] = None
    foreignColumn: Optional[str] = None


class TableSchemaData(BaseModel):
    table_name: str
    columns: list[ColumnInfo]


class TableSchemaEnvelope(BaseModel):
    success: bool
    data: Optional[TableSchemaData] = None
    error: Optional[str] = None


class TableDataEnvelope(BaseModel):
    """Paged rows from a user table — rows are dynamic dicts by nature."""

    success: bool
    message: Optional[str] = None
    data: list[dict[str, Any]] = []
    total: Optional[int] = None


class DistinctValuesEnvelope(BaseModel):
    success: bool
    data: Any = None
    error: Optional[str] = None


class AdvancedQueryEnvelope(BaseModel):
    success: bool
    data: Any = None
    rows: Any = None
    error: Optional[str] = None
