"""
Schema Comparison and Validation Middleware
Automatically compares FastAPI Pydantic schemas with Express.js Zod schemas
to ensure API compatibility during migration.
"""

import json
import re
from typing import Dict, Any, Optional, List, Union
from fastapi import Request, Response
from fastapi.responses import JSONResponse
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SchemaCompatibilityError(Exception):
    """Raised when schemas are incompatible"""
    pass

class ZodSchemaConverter:
    """Converts Zod schemas to Python/Pydantic-compatible format for comparison"""
    
    @staticmethod
    def extract_zod_schema(zod_code: str) -> Dict[str, Any]:
        """Extract schema structure from Zod code"""
        try:
            # Basic schema extraction - can be enhanced with AST parsing
            schema_info = {
                "fields": {},
                "type": "object",
                "validators": []
            }
            
            # Extract object schema fields
            object_match = re.search(r'z\.object\(\s*\{([^}]+)\}\s*\)', zod_code, re.DOTALL)
            if object_match:
                fields_content = object_match.group(1)
                
                # Extract field definitions
                field_pattern = r'(\w+):\s*(z\.[^(]+)'
                for match in re.finditer(field_pattern, fields_content):
                    field_name = match.group(1)
                    field_type = match.group(2)
                    
                    # Extract field constraints
                    constraints = {}
                    
                    # String constraints
                    if 'min_length' in field_type:
                        min_match = re.search(r'min_length\s*=\s*(\d+)', field_type)
                        if min_match:
                            constraints['minLength'] = int(min_match.group(1))
                    
                    if 'max_length' in field_type:
                        max_match = re.search(r'max_length\s*=\s*(\d+)', field_type)
                        if max_match:
                            constraints['maxLength'] = int(max_match.group(1))
                    
                    if 'pattern' in field_type:
                        pattern_match = re.search(r'pattern\s*=\s*[\'"]([^\'\"]+)[\'"]', field_type)
                        if pattern_match:
                            constraints['pattern'] = pattern_match.group(1)
                    
                    # Number constraints
                    if 'min' in field_type:
                        min_match = re.search(r'min\s*=\s*(\d+(?:\.\d+)?)', field_type)
                        if min_match:
                            constraints['minimum'] = float(min_match.group(1))
                    
                    if 'max' in field_type:
                        max_match = re.search(r'max\s*=\s*(\d+(?:\.\d+)?)', field_type)
                        if max_match:
                            constraints['maximum'] = float(max_match.group(1))
                    
                    # Required/Optional
                    constraints['required'] = not field_type.endswith('?.optional()')
                    
                    schema_info["fields"][field_name] = {
                        "type": "string",  # Default, can be enhanced
                        "constraints": constraints
                    }
            
            return schema_info
        except Exception as e:
            logger.error(f"Error extracting Zod schema: {e}")
            return {"error": str(e)}

class SchemaComparator:
    """Compares FastAPI and Zod schemas for compatibility"""
    
    def __init__(self):
        self.zod_converter = ZodSchemaConverter()
    
    def compare_schemas(self, zod_schema: str, pydantic_fields: Dict[str, Any]) -> Dict[str, Any]:
        """Compare Zod and Pydantic schemas"""
        try:
            zod_info = self.zod_converter.extract_zod_schema(zod_schema)
            
            if "error" in zod_info:
                return {"error": zod_info["error"]}
            
            comparison = {
                "compatible": True,
                "differences": [],
                "missing_fields": [],
                "extra_fields": [],
                "constraint_mismatches": []
            }
            
            zod_fields = zod_info.get("fields", {})
            
            # Check for missing fields
            for field_name in zod_fields:
                if field_name not in pydantic_fields:
                    comparison["missing_fields"].append(field_name)
                    comparison["compatible"] = False
            
            # Check for extra fields
            for field_name in pydantic_fields:
                if field_name not in zod_fields:
                    comparison["extra_fields"].append(field_name)
                    comparison["compatible"] = False
            
            # Compare constraints for common fields
            for field_name in zod_fields:
                if field_name in pydantic_fields:
                    zod_constraints = zod_fields[field_name].get("constraints", {})
                    pydantic_constraints = pydantic_fields[field_name].get("constraints", {})
                    
                    constraint_diff = self._compare_constraints(
                        zod_constraints, 
                        pydantic_constraints, 
                        field_name
                    )
                    
                    if constraint_diff:
                        comparison["constraint_mismatches"].append(constraint_diff)
                        comparison["compatible"] = False
            
            return comparison
        except Exception as e:
            return {"error": f"Comparison failed: {str(e)}"}
    
    def _compare_constraints(self, zod_constraints: Dict[str, Any], 
                           pydantic_constraints: Dict[str, Any], 
                           field_name: str) -> Optional[Dict[str, Any]]:
        """Compare field constraints between schemas"""
        differences = {
            "field": field_name,
            "issues": []
        }
        
        # Check min_length vs minLength
        zod_min = zod_constraints.get("minLength")
        pydantic_min = pydantic_constraints.get("minLength")
        if zod_min and pydantic_min and zod_min != pydantic_min:
            differences["issues"].append(f"min_length mismatch: Zod={zod_min}, Pydantic={pydantic_min}")
        
        # Check max_length vs maxLength
        zod_max = zod_constraints.get("maxLength")
        pydantic_max = pydantic_constraints.get("maxLength")
        if zod_max and pydantic_max and zod_max != pydantic_max:
            differences["issues"].append(f"max_length mismatch: Zod={zod_max}, Pydantic={pydantic_max}")
        
        # Check required/optional
        zod_required = zod_constraints.get("required", True)
        pydantic_required = pydantic_constraints.get("required", True)
        if zod_required != pydantic_required:
            differences["issues"].append(f"required mismatch: Zod={zod_required}, Pydantic={pydantic_required}")
        
        return differences if differences["issues"] else None

class SchemaValidationMiddleware:
    """FastAPI middleware for schema validation"""
    
    def __init__(self, app):
        self.app = app
        self.comparator = SchemaComparator()
        self.schema_mappings = self._load_schema_mappings()
    
    async def __call__(self, request: Request, call_next):
        """Middleware function"""
        
        # Skip non-POST/PUT requests for validation
        if request.method not in ["POST", "PUT", "PATCH"]:
            return await call_next(request)
        
        # Get request path
        path = request.url.path
        
        # Skip if no schema mapping exists
        if path not in self.schema_mappings:
            return await call_next(request)
        
        try:
            # Get request body
            body = await request.json()
            
            # Validate against schemas
            validation_result = self._validate_request(body, path)
            
            if not validation_result["valid"]:
                logger.warning(f"Schema validation failed for {path}: {validation_result}")
                return JSONResponse(
                    status_code=422,
                    content={
                        "detail": validation_result["errors"],
                        "schema_comparison": validation_result.get("schema_comparison")
                    }
                )
            
            return await call_next(request)
            
        except Exception as e:
            logger.error(f"Schema validation error: {e}")
            return await call_next(request)
    
    def _load_schema_mappings(self) -> Dict[str, Dict[str, Any]]:
        """Load schema mappings for endpoints"""
        return {
            "/api/database/test-supabase": {
                "zod_schema": """
TestConnectionRequestSchema = z.object({
  url: z.string().url('Invalid URL'),
  anonKey: z.string().min(1, 'Anonymous key is required')
})
                """,
                "pydantic_fields": {
                    "url": {"type": "string", "constraints": {"minLength": 1}},
                    "anonKey": {"type": "string", "constraints": {"minLength": 1}}
                }
            },
            "/api/database/connect-supabase": {
                "zod_schema": """
ConnectSupabaseRequestSchema = z.object({
  url: z.string().url('Invalid URL'),
  anonKey: z.string().min(1, 'Anonymous key is required'),
  serviceKey: z.string().optional()
})
                """,
                "pydantic_fields": {
                    "url": {"type": "string", "constraints": {"minLength": 1}},
                    "anonKey": {"type": "string", "constraints": {"minLength": 1}},
                    "serviceKey": {"type": "string", "constraints": {"required": False}}
                }
            }
        }
    
    def _validate_request(self, body: Dict[str, Any], path: str) -> Dict[str, Any]:
        """Validate request body against schema mapping"""
        if path not in self.schema_mappings:
            return {"valid": True}
        
        mapping = self.schema_mappings[path]
        schema_info = mapping["pydantic_fields"]
        
        errors = []
        
        # Check required fields
        for field_name, field_info in schema_info.items():
            if field_info["constraints"].get("required", True):
                if field_name not in body:
                    errors.append(f"Field '{field_name}' is required")
        
        # Check field types and constraints
        for field_name, value in body.items():
            if field_name in schema_info:
                field_info = schema_info[field_name]
                
                # Type checking (basic)
                expected_type = field_info["type"]
                if expected_type == "string" and not isinstance(value, str):
                    errors.append(f"Field '{field_name}' must be a string")
                
                # Length constraints
                constraints = field_info["constraints"]
                if "minLength" in constraints and isinstance(value, str) and len(value) < constraints["minLength"]:
                    errors.append(f"Field '{field_name}' must be at least {constraints['minLength']} characters")
                
                if "maxLength" in constraints and isinstance(value, str) and len(value) > constraints["maxLength"]:
                    errors.append(f"Field '{field_name}' must be at most {constraints['maxLength']} characters")
        
        # Schema comparison
        schema_comparison = self.comparator.compare_schemas(
            mapping["zod_schema"], 
            mapping["pydantic_fields"]
        )
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "schema_comparison": schema_comparison
        }

def create_schema_report() -> str:
    """Generate a schema compatibility report"""
    middleware = SchemaValidationMiddleware(None)
    
    report = "# Schema Compatibility Report\n\n"
    
    for path, mapping in middleware.schema_mappings.items():
        report += f"## {path}\n\n"
        
        # Get schema comparison
        comparison = middleware.comparator.compare_schemas(
            mapping["zod_schema"],
            mapping["pydantic_fields"]
        )
        
        if comparison.get("error"):
            report += f"**Error**: {comparison['error']}\n\n"
            continue
        
        if comparison["compatible"]:
            report += "✅ **Compatible** - Schemas match\n\n"
        else:
            report += "❌ **Incompatible** - Schema differences found:\n\n"
            
            if comparison["missing_fields"]:
                report += f"**Missing fields**: {', '.join(comparison['missing_fields'])}\n\n"
            
            if comparison["extra_fields"]:
                report += f"**Extra fields**: {', '.join(comparison['extra_fields'])}\n\n"
            
            if comparison["constraint_mismatches"]:
                report += "**Constraint mismatches**:\n"
                for issue in comparison["constraint_mismatches"]:
                    for problem in issue["issues"]:
                        report += f"- {issue['field']}: {problem}\n"
                report += "\n"
        
        report += "---\n\n"
    
    return report

# Export main classes
__all__ = ["SchemaValidationMiddleware", "SchemaComparator", "ZodSchemaConverter", "create_schema_report"]