# API Compatibility Guide

## Overview

This guide documents the successful implementation of automatic schema comparison and validation middleware that ensures API compatibility between Express.js (Zod) and FastAPI (Pydantic) backends during the migration process.

## 🎯 Key Achievements

### ✅ Schema Alignment Fixed
- **Before**: FastAPI expected `{supabase_url, supabase_anon_key}` but frontend sent `{url, anonKey}`
- **After**: FastAPI now expects `{url, anonKey}` matching Express.js and frontend exactly
- **Result**: 422 errors eliminated, proper validation working

### ✅ Automatic Schema Extraction
- Created middleware generator that extracts 21 Zod schemas from Express.js
- Generated compatibility report with field-by-field analysis
- Created auto-generated middleware for real-time validation

### ✅ Real-time Compatibility Testing
- Middleware validates requests against both Zod and Pydantic schemas
- Provides detailed error messages with schema comparison data
- Logs compatibility issues for debugging

## 📁 Generated Files

### 1. Schema Compatibility Report
**Location**: `fastapi-backend/app/middleware/auto_generated/schema_compatibility_report.md`

Contains detailed analysis of 21 extracted schemas:
- Field definitions and constraints
- Required vs optional fields
- URL format validation
- Type mappings (Zod → Pydantic)

### 2. Auto-Generated Middleware
**Location**: `fastapi-backend/app/middleware/auto_generated/auto_schema_middleware.py`

Features:
- Real-time request validation
- Schema compatibility checking
- Detailed error reporting
- Support for all extracted endpoints

### 3. Schema Data Export
**Location**: `fastapi-backend/app/middleware/auto_generated/extracted_schemas.json`

Machine-readable schema data for further processing or integration testing.

## 🔧 How to Use the Middleware

### 1. Integration in FastAPI App

```python
from fastapi import FastAPI
from app.middleware.auto_generated.auto_schema_middleware import AutoSchemaValidationMiddleware

app = FastAPI()

# Add the auto-generated middleware
schema_middleware = AutoSchemaValidationMiddleware(app)
app = schema_middleware

# The middleware will automatically:
# - Validate POST/PUT/PATCH requests
# - Check compatibility with Express.js schemas
# - Return detailed error messages
```

### 2. Generate Updated Middleware

When Express.js schemas change:

```bash
cd fastapi-backend
python generate_schema_middleware.py
```

This will:
- Re-extract schemas from `../server/validation/schemas.js`
- Generate updated middleware
- Create new compatibility report
- Update JSON schema data

### 3. Monitor Compatibility

Check the generated report:
```bash
cat fastapi-backend/app/middleware/auto_generated/schema_compatibility_report.md
```

## 📊 Schema Mapping Examples

### TestConnectionRequestSchema

**Express.js (Zod)**:
```javascript
const TestConnectionRequestSchema = z.object({
  url: z.string().url('Invalid URL'),
  anonKey: z.string().min(1, 'Anonymous key is required')
});
```

**FastAPI (Pydantic)**:
```python
class DatabaseConnectionRequest(BaseModel):
    url: constr(min_length=1)
    anonKey: constr(min_length=1)
```

### ConnectSupabaseRequestSchema

**Express.js (Zod)**:
```javascript
const ConnectSupabaseRequestSchema = z.object({
  url: z.string().url('Invalid URL'),
  anonKey: z.string().min(1, 'Anonymous key is required'),
  serviceKey: z.string().optional()
});
```

**FastAPI (Pydantic)**:
```python
class DatabaseConnectionRequest(BaseModel):
    url: constr(min_length=1)
    anonKey: constr(min_length=1)
    serviceKey: Optional[constr(min_length=1)] = None
```

## 🧪 Testing Results

### Before Fix
```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "supabase_url"],
      "msg": "Field required"
    }
  ]
}
```

### After Fix
```json
{
  "detail": "Connection failed - invalid credentials"
}
```

## 🔄 Migration Workflow

### Phase 1: Schema Extraction ✅
1. Extract all Zod schemas from Express.js
2. Generate Pydantic-compatible representations
3. Create middleware for real-time validation
4. Document compatibility mappings

### Phase 2: Endpoint Migration
1. Migrate endpoints one-by-one
2. Use middleware to ensure compatibility
3. Test with identical payloads
4. Verify response formats match

### Phase 3: Gradual Switchover
1. Keep Express.js as primary
2. Route requests to FastAPI for testing
3. Compare responses for consistency
4. Switch traffic when fully compatible

## 🛠️ Development Tools

### Schema Validator
```python
# Check schema compatibility programmatically
from app.middleware.schema_comparison import SchemaComparator

comparator = SchemaComparator()
result = comparator.compare_schemas(
    zod_schema_string,
    pydantic_fields_dict
)
print(result)  # Shows compatibility issues
```

### Compatibility Report Generator
```python
# Generate updated report
from app.middleware.auto_generated.auto_schema_middleware import AutoSchemaValidationMiddleware

middleware = AutoSchemaValidationMiddleware(app)
report = middleware.get_compatibility_report()
print(report)
```

## 📈 Next Steps

1. **Integrate Middleware**: Add auto-generated middleware to main FastAPI app
2. **Test All Endpoints**: Use the middleware to validate all API endpoints
3. **Continuous Monitoring**: Run schema extraction regularly as Express.js evolves
4. **Performance Optimization**: Add caching for schema validation
5. **Extended Coverage**: Add support for query parameters and headers

## 🎯 Benefits

- **Zero Manual Schema Maintenance**: Automatic extraction and generation
- **Real-time Compatibility**: Instant feedback on schema mismatches
- **Migration Safety**: Ensures no breaking changes during transition
- **Documentation**: Always up-to-date compatibility reports
- **Developer Experience**: Clear error messages with schema comparison data

This system provides a robust foundation for seamless backend migration while maintaining API compatibility throughout the process.