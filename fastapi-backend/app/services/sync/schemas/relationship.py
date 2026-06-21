"""
Schemas for user-defined FK relationships (non-relational datasources).

Google Sheets and REST datasources have no native foreign keys. Users can
manually define relationships, which are stored in the datasource's
`extra_config` JSON under a `relationships` key and merged into the existing
schema/relationships APIs so they behave exactly like native SQL FKs.

Stored shape (extra_config.relationships):
    [
      {
        "from_table": "Users",
        "from_column": "department_id",
        "to_table": "Departments",
        "to_column": "id",
        "relationship_type": "many_to_one",
        "label": "User Department",
        "cascade_delete": false
      }
    ]
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger("app.services.sync.schemas.relationship")

VALID_RELATIONSHIP_TYPES = {"many_to_one", "one_to_one", "one_to_many", "many_to_many"}


class RelationshipDefinition(BaseModel):
    """A manually-defined FK relationship."""

    from_table: str = Field(..., min_length=1, description="Source table (holds the FK column)")
    from_column: str = Field(..., min_length=1, description="Source column (the FK)")
    to_table: str = Field(..., min_length=1, description="Target table (the referenced table)")
    to_column: str = Field(..., min_length=1, description="Target column (the referenced PK/column)")
    relationship_type: str = Field(
        default="many_to_one",
        description="many_to_one | one_to_one | one_to_many | many_to_many",
    )
    label: Optional[str] = Field(None, description="Human-readable label for the UI")
    cascade_delete: bool = Field(default=False, description="Delete related rows when source is deleted (future)")


class RelationshipResponse(BaseModel):
    """Relationship echoed back after create/update, with its array index."""

    index: int
    relationship: RelationshipDefinition


# ── Service helpers: read/write relationships from datasource.extra_config ──


def _read_config(datasource: Any) -> Dict[str, Any]:
    raw = getattr(datasource, "extra_config", None)
    if not raw:
        return {}
    if isinstance(raw, dict):
        return dict(raw)
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


def _write_config(datasource: Any, cfg: Dict[str, Any]) -> None:
    """Persist the full config dict back as a JSON string on the datasource."""
    datasource.extra_config = json.dumps(cfg)


def get_user_relationships(datasource: Any) -> List[Dict[str, Any]]:
    """Read the user-defined relationships list from extra_config."""
    cfg = _read_config(datasource)
    rels = cfg.get("relationships") or []
    return [r for r in rels if isinstance(r, dict)]


def _normalize_user_fk(rel: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Map a user-defined relationship to the normalized shape returned by
    SchemaService.get_all_relationships() so the two sources are uniform."""
    from_table = rel.get("from_table") or rel.get("source_table")
    from_column = rel.get("from_column") or rel.get("source_column")
    to_table = rel.get("to_table") or rel.get("target_table")
    to_column = rel.get("to_column") or rel.get("target_column") or "id"
    if not (from_table and from_column and to_table):
        return None
    return {
        "source_table": from_table,
        "source_column": from_column,
        "target_table": to_table,
        "target_column": to_column,
        "is_user_defined": True,
        "relationship_type": rel.get("relationship_type", "many_to_one"),
        "label": rel.get("label"),
    }


def get_user_relationships_normalized(datasource: Any) -> List[Dict[str, Any]]:
    """User-defined relationships in the normalized relationship shape."""
    out: List[Dict[str, Any]] = []
    for rel in get_user_relationships(datasource):
        norm = _normalize_user_fk(rel)
        if norm:
            out.append(norm)
    return out


def get_user_foreign_keys_for_table(datasource: Any, table: str) -> List[Dict[str, Any]]:
    """User-defined FKs originating from `table`, in the per-table schema
    foreign_keys shape (constrained_columns/referred_table/referred_columns)
    so they merge seamlessly with native SQL FKs."""
    out: List[Dict[str, Any]] = []
    for rel in get_user_relationships(datasource):
        if (rel.get("from_table") or rel.get("source_table")) != table:
            continue
        out.append({
            "constrained_columns": [rel.get("from_column") or rel.get("source_column")],
            "referred_table": rel.get("to_table") or rel.get("target_table"),
            "referred_columns": [rel.get("to_column") or rel.get("target_column") or "id"],
            "is_user_defined": True,
            "relationship_type": rel.get("relationship_type", "many_to_one"),
            "label": rel.get("label"),
        })
    return out


def validate_relationship_dict(rel: Dict[str, Any]) -> RelationshipDefinition:
    """Validate a relationship dict via the Pydantic model.

    Raises ValueError on invalid relationship_type.
    """
    if rel.get("relationship_type") and rel["relationship_type"] not in VALID_RELATIONSHIP_TYPES:
        raise ValueError(
            f"Invalid relationship_type '{rel['relationship_type']}'. "
            f"Must be one of: {', '.join(sorted(VALID_RELATIONSHIP_TYPES))}"
        )
    try:
        return RelationshipDefinition(**rel)
    except Exception as e:
        raise ValueError(f"Invalid relationship definition: {e}")


def add_user_relationship(datasource: Any, rel: Dict[str, Any]) -> int:
    """Append a validated relationship to extra_config.relationships.

    Returns the index of the newly added relationship.
    Raises ValueError on validation failure or duplicate.
    """
    validated = validate_relationship_dict(rel)
    cfg = _read_config(datasource)
    rels = cfg.get("relationships") or []

    # Duplicate check (same from/to table+column)
    new_key = (validated.from_table, validated.from_column, validated.to_table, validated.to_column)
    for existing in rels:
        key = (
            existing.get("from_table"),
            existing.get("from_column"),
            existing.get("to_table"),
            existing.get("to_column"),
        )
        if key == new_key:
            raise ValueError(
                f"Relationship already exists: {validated.from_table}.{validated.from_column} → "
                f"{validated.to_table}.{validated.to_column}"
            )

    rels.append(validated.model_dump())
    cfg["relationships"] = rels
    _write_config(datasource, cfg)
    return len(rels) - 1


def update_user_relationship(datasource: Any, index: int, rel: Dict[str, Any]) -> None:
    """Replace the relationship at `index` with the validated `rel`."""
    validated = validate_relationship_dict(rel)
    cfg = _read_config(datasource)
    rels = cfg.get("relationships") or []
    if index < 0 or index >= len(rels):
        raise ValueError(f"Relationship index {index} out of range")
    rels[index] = validated.model_dump()
    cfg["relationships"] = rels
    _write_config(datasource, cfg)


def delete_user_relationship(datasource: Any, index: int) -> Dict[str, Any]:
    """Remove the relationship at `index`. Returns the removed relationship."""
    cfg = _read_config(datasource)
    rels = cfg.get("relationships") or []
    if index < 0 or index >= len(rels):
        raise ValueError(f"Relationship index {index} out of range")
    removed = rels.pop(index)
    cfg["relationships"] = rels
    _write_config(datasource, cfg)
    return removed
