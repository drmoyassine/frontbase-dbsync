# Implementation Plan: Manual FK Relationships for Non-Relational Datasources

## Overview

Enable manual foreign key relationship definitions for non-relational datasources (Google Sheets, REST API) to provide SQL-like relationship features: JOINs, lookups, and schema visualization.

---

## Phase 1: Data Model & Storage (Backend)

### 1.1 Relationship Schema

**File**: `fastapi-backend/app/services/sync/schemas/relationship.py` (NEW)

```python
from pydantic import BaseModel, Field
from typing import List, Optional

class RelationshipDefinition(BaseModel):
    """Manually defined FK relationship for non-relational datasources."""
    from_table: str = Field(..., description="Source table name")
    from_column: str = Field(..., description="Source column (FK)")
    to_table: str = Field(..., description="Target table name")
    to_column: str = Field(..., description="Target column (PK/referenced)")
    relationship_type: str = Field(default="many_to_one", description="many_to_one | one_to_one | one_to_many | many_to_many")
    cascade_delete: bool = Field(default=False, description="Delete related records when source deleted")
    label: Optional[str] = Field(None, description="Human-readable label for UI")

class RelationshipMetadata(BaseModel):
    """Container for all relationships in a datasource."""
    relationships: List[RelationshipDefinition] = []
```

### 1.2 Storage in Datasource Model

**File**: `fastapi-backend/app/services/sync/models/datasource.py`

**Option A**: Store in existing `extra_config` JSON column (recommended)
```python
# extra_config JSON structure:
{
  "webAppUrl": "...",
  "webAppSecret": "...",
  "relationships": [
    {
      "from_table": "Users",
      "from_column": "department_id",
      "to_table": "Departments",
      "to_column": "id",
      "relationship_type": "many_to_one",
      "cascade_delete": false
    }
  ]
}
```

**Option B**: New dedicated table (if complex metadata needed)
```python
class DatasourceRelationship(Base):
    __tablename__ = "datasource_relationships"
    id = Column(String(36), primary_key=True)
    datasource_id = Column(String(36), ForeignKey("datasources.id"))
    # ... relationship fields
```

**Decision**: Use **Option A** (extra_config) for simplicity. No migration needed.

### 1.3 API Endpoints

**File**: `fastapi-backend/app/services/sync/routers/datasources/relationships.py` (NEW)

```python
@router.get("/{datasource_id}/relationships/")
async def get_relationships(datasource_id: str):
    """Get all relationships for a datasource."""
    ds = await get_datasource(datasource_id)
    cfg = json.loads(ds.extra_config or "{}")
    return cfg.get("relationships", [])

@router.post("/{datasource_id}/relationships/")
async def create_relationship(datasource_id: str, rel: RelationshipDefinition):
    """Add a new relationship."""
    # Validate: tables exist, columns exist
    # Add to extra_config.relationships array
    # Save

@router.delete("/{datasource_id}/relationships/{index}/")
async def delete_relationship(datasource_id: str, index: int):
    """Remove relationship by array index."""

@router.put("/{datasource_id}/relationships/{index}/")
async def update_relationship(datasource_id: str, index: int, rel: RelationshipDefinition):
    """Update existing relationship."""
```

---

## Phase 2: Adapter Integration

### 2.1 Extend Schema Response

**File**: `fastapi-backend/app/services/sync/adapters/google_sheets_adapter.py`

Modify `get_schema()` to include relationships:

```python
async def get_schema(self, table: str) -> Dict[str, Any]:
    schema = await self._call("schema")
    
    # Get defined relationships from extra_config
    relationships = self._get_relationships()
    
    for t in (schema.get("tables") or []):
        if t.get("name") == table:
            # Add foreign_keys based on relationships
            fks = []
            for rel in relationships:
                if rel["from_table"] == table:
                    fks.append({
                        "column": rel["from_column"],
                        "foreign_table": rel["to_table"],
                        "foreign_column": rel["to_column"],
                        "is_user_defined": True,  # Flag as manually defined
                    })
            return {"columns": t.get("columns") or [], "foreign_keys": fks}
    return {"columns": [], "foreign_keys": []}
```

### 2.2 Add Helper Method

**File**: `fastapi-backend/app/services/sync/adapters/google_sheets_adapter.py`

```python
def _get_relationships(self) -> List[Dict]:
    """Extract relationships from extra_config."""
    cfg = self._read_config()
    return cfg.get("relationships", [])
```

### 2.3 Apply to REST Adapter

**File**: `fastapi-backend/app/services/sync/adapters/rest_adapter.py`

Apply same pattern — REST datasources also lack native FKs.

---

## Phase 3: Frontend UI Components

### 3.1 Relationship Editor Modal

**File**: `src/modules/dbsync/components/RelationshipModal.tsx` (NEW)

```typescript
interface RelationshipModalProps {
  datasourceId: string;
  tables: string[];  // Available tables
  onClose: () => void;
}

export function RelationshipModal({ datasourceId, tables, onClose }: RelationshipModalProps) {
  const [relationships, setRelationships] = useState<RelationshipDefinition[]>([]);
  const [newRel, setNewRel] = useState<Partial<RelationshipDefinition>>({});

  return (
    <Dialog>
      <DialogTitle>Define Relationships</DialogTitle>
      <DialogContent>
        {/* Existing relationships list */}
        {relationships.map((rel, i) => (
          <RelationshipCard key={i} relation={rel} onDelete={() => deleteRelation(i)} />
        ))}

        {/* Add new relationship form */}
        <div className="grid grid-cols-2 gap-4">
          <Select value={newRel.from_table} onChange={...}>
            {tables.map(t => <option value={t}>{t}</option>)}
          </Select>
          <Select value={newRel.from_column} onChange={...}>
            {/* Columns loaded from table schema */}
          </Select>
          {/* Similar for to_table, to_column */}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### 3.2 Add to Datasource Page

**File**: `src/modules/dbsync/pages/Datasources.tsx`

Add "Relationships" button/column:

```typescript
{datasource.type === 'google_sheets' && (
  <Button onClick={() => setShowRelationshipModal(true)}>
    <Link2 className="w-4 h-4 mr-2" />
    Define Relationships
  </Button>
)}
```

### 3.3 Schema Visualization with FK Lines

**File**: `src/modules/dbsync/components/SchemaDiagram.tsx` (ENHANCE)

Add relationship lines between table boxes:

```typescript
{relationships.map((rel, i) => (
  <RelationLine
    key={i}
    from={{ table: rel.from_table, column: rel.from_column }}
    to={{ table: rel.to_table, column: rel.to_column }}
    type={rel.relationship_type}
  />
))}
```

---

## Phase 4: Integration Points

### 4.1 TableSchema Response

**File**: `fastapi-backend/app/services/sync/routers/datasources/schema.py`

Modify schema endpoint to include `foreign_keys`:

```python
@router.get("/{datasource_id}/tables/{table}/schema/")
async def get_table_schema(datasource_id: str, table: str):
    adapter = get_adapter(datasource)
    schema = await adapter.get_schema(table)
    # schema now includes foreign_keys from relationships
    return schema
```

### 4.2 Relationships Endpoint

**File**: `fastapi-backend/app/services/sync/routers/datasources/__init__.py`

```python
from app.services.sync.routers.datasources.relationships import router as relationships_router
router.include_router(relationships_router, prefix="/relationships", tags=["Relationships"])
```

### 4.3 Frontend API Client

**File**: `src/modules/dbsync/api/relationships.ts` (NEW)

```typescript
export const relationshipsApi = {
  list: (datasourceId: string) => api.get<RelationshipDefinition[]>(`/datasources/${datasourceId}/relationships/`),
  create: (datasourceId: string, data: RelationshipDefinition) =>
    api.post(`/datasources/${datasourceId}/relationships/`, data),
  update: (datasourceId: string, index: number, data: RelationshipDefinition) =>
    api.put(`/datasources/${datasourceId}/relationships/${index}/`, data),
  delete: (datasourceId: string, index: number) =>
    api.delete(`/datasources/${datasourceId}/relationships/${index}/`),
};
```

---

## Phase 5: Validation & Constraints

### 5.1 Backend Validation

When creating a relationship, validate:

```python
async def validate_relationship(datasource, rel: RelationshipDefinition):
    adapter = get_adapter(datasource)
    
    # Check tables exist
    tables = await adapter.get_tables()
    if rel.from_table not in tables or rel.to_table not in tables:
        raise ValueError("Referenced table does not exist")
    
    # Check columns exist
    from_schema = await adapter.get_schema(rel.from_table)
    to_schema = await adapter.get_schema(rel.to_table)
    
    from_columns = [c["name"] for c in from_schema["columns"]]
    to_columns = [c["name"] for c in to_schema["columns"]]
    
    if rel.from_column not in from_columns:
        raise ValueError(f"Column '{rel.from_column}' not found in '{rel.from_table}'")
    if rel.to_column not in to_columns:
        raise ValueError(f"Column '{rel.to_column}' not found in '{rel.to_table}'")
    
    # Check for circular dependencies (optional)
    # Check for duplicate relationships
```

### 5.2 Type Compatibility

Optional: Warn if data types don't match (e.g., linking string to number).

---

## Phase 6: Query Builder Integration (Future)

### 6.1 Auto-Suggest Joins

**File**: `src/modules/builder/components/QueryBuilder.tsx`

When building queries, suggest JOINs based on relationships:

```typescript
if (selectedTable && relationships) {
  const relatedTables = relationships
    .filter(r => r.from_table === selectedTable || r.to_table === selectedTable)
    .map(r => ({
      table: r.from_table === selectedTable ? r.to_table : r.from_table,
      joinOn: `${r.from_table}.${r.from_column} = ${r.to_table}.${r.to_column}`,
      type: r.relationship_type
    }));
}
```

---

## File Checklist

### Backend (NEW)
- `app/services/sync/schemas/relationship.py`
- `app/services/sync/routers/datasources/relationships.py`

### Backend (MODIFY)
- `app/services/sync/adapters/google_sheets_adapter.py` - Add `_get_relationships()`, extend `get_schema()`
- `app/services/sync/adapters/rest_adapter.py` - Same as above
- `app/services/sync/routers/datasources/__init__.py` - Include relationships router

### Frontend (NEW)
- `src/modules/dbsync/components/RelationshipModal.tsx`
- `src/modules/dbsync/api/relationships.ts`
- `src/modules/dbsync/types/relationships.ts` - RelationshipDefinition interface

### Frontend (MODIFY)
- `src/modules/dbsync/pages/Datasources.tsx` - Add Relationships button
- `src/modules/dbsync/components/SchemaDiagram.tsx` - Render relationship lines
- `src/modules/dbsync/types/index.ts` - Add relationships to Datasource interface

---

## Acceptance Criteria

1. ✅ Can define relationship from Table A.Column X → Table B.Column Y
2. ✅ Relationships persist in datasource `extra_config`
3. ✅ Schema API returns `foreign_keys` based on relationships
4. ✅ Schema diagram shows relationship lines
5. ✅ Validation prevents invalid table/column references
6. ✅ Works for both Google Sheets and REST datasources

---

## Edge Cases to Handle

1. **Circular relationships**: A → B → C → A
   - Allow but warn in UI

2. **Self-referential**: Employees.manager_id → Employees.id
   - Support this use case

3. **Multi-column keys**: (order_id, product_id) → (order_id, product_id)
   - Future enhancement, single-column for MVP

4. **Schema changes**: Column renamed/deleted
   - Mark relationship as "broken" in UI, don't delete

---

## Testing

```python
# Unit tests
async def test_create_relationship():
    rel = RelationshipDefinition(
        from_table="Users",
        from_column="dept_id",
        to_table="Departments",
        to_column="id"
    )
    result = await create_relationship(datasource_id, rel)
    assert result["from_table"] == "Users"

async def test_relationship_in_schema():
    schema = await adapter.get_schema("Users")
    assert schema["foreign_keys"][0]["foreign_table"] == "Departments"

# Integration test
async def test_end_to_end():
    # Create relationship
    # Get schema
    # Verify FK present
    # Delete relationship
    # Verify FK removed
```

---

## Implementation Order

1. **Phase 1** (1-2 days): Data model + API endpoints
2. **Phase 2** (1 day): Adapter integration
3. **Phase 3** (2-3 days): Frontend UI components
4. **Phase 4** (1 day): Integration & API client
5. **Phase 5** (1 day): Validation
6. **Phase 6** (future): Query builder integration

**Total Estimate**: 5-8 days for MVP

---

## Notes for Implementer

- Start with **google_sheets** only, then apply same pattern to **rest**
- Use **extra_config** for storage — no DB migration needed
- Relationships are **metadata only** — no constraint enforcement in Sheets
- Consider adding **"import from SQL"** feature to copy FKs from a real DB
- UI should clearly distinguish between **native FKs** (Supabase) and **user-defined** (Sheets)
