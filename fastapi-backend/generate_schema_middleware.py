#!/usr/bin/env python3
"""
Schema Middleware Generator
Automatically extracts Zod schemas from Express.js code and generates
FastAPI middleware for schema validation and compatibility checking.
"""

import os
import re
import json
import subprocess
from pathlib import Path
from typing import Dict, Any, List

class ZodSchemaExtractor:
    """Extract and parse Zod schemas from Express.js files"""
    
    def __init__(self, express_js_path: str):
        self.express_js_path = Path(express_js_path)
        self.validation_dir = self.express_js_path / "validation"
        self.schemas_file = self.validation_dir / "schemas.js"
    
    def extract_all_schemas(self) -> Dict[str, Any]:
        """Extract all Zod schemas from the Express.js validation file"""
        if not self.schemas_file.exists():
            raise FileNotFoundError(f"Schemas file not found: {self.schemas_file}")
        
        schemas = {}
        content = self.schemas_file.read_text(encoding='utf-8')
        
        # Extract all z.object schemas
        object_pattern = r'(\w+Schema)\s*=\s*z\.object\(\s*\{([^}]+)\}\s*\)'
        for match in re.finditer(object_pattern, content, re.DOTALL):
            schema_name = match.group(1)
            schema_body = match.group(2)
            
            schema_info = self._parse_zod_object(schema_body)
            schemas[schema_name] = schema_info
        
        return schemas
    
    def _parse_zod_object(self, schema_body: str) -> Dict[str, Any]:
        """Parse a z.object schema body"""
        fields = {}
        
        # Extract field definitions
        field_pattern = r'(\w+):\s*z\.(\w+)'
        for match in re.finditer(field_pattern, schema_body):
            field_name = match.group(1)
            field_type = match.group(2)
            
            field_info = {
                "type": self._map_zod_type(field_type),
                "constraints": {}
            }
            
            # Extract constraints
            constraints = self._extract_constraints(field_name, schema_body)
            field_info["constraints"] = constraints
            
            fields[field_name] = field_info
        
        return {
            "type": "object",
            "fields": fields
        }
    
    def _map_zod_type(self, zod_type: str) -> str:
        """Map Zod types to Python/Pydantic types"""
        type_mapping = {
            "string": "string",
            "number": "number", 
            "boolean": "boolean",
            "array": "array",
            "object": "object"
        }
        return type_mapping.get(zod_type, "unknown")
    
    def _extract_constraints(self, field_name: str, schema_body: str) -> Dict[str, Any]:
        """Extract constraints for a field"""
        constraints = {}
        
        # Find the field definition
        field_pattern = rf'{field_name}:\s*z\.(.+?)(?:,|\}}|\n)'
        field_match = re.search(field_pattern, schema_body, re.DOTALL)
        
        if field_match:
            field_def = field_match.group(1).strip()
            
            # Extract string constraints
            if 'string' in field_def:
                # min_length
                min_match = re.search(r'min_length\s*=\s*(\d+)', field_def)
                if min_match:
                    constraints["minLength"] = int(min_match.group(1))
                
                # max_length
                max_match = re.search(r'max_length\s*=\s*(\d+)', field_def)
                if max_match:
                    constraints["maxLength"] = int(max_match.group(1))
                
                # pattern
                pattern_match = re.search(r'pattern\s*=\s*[\'"]([^\'\"]+)[\'"]', field_def)
                if pattern_match:
                    constraints["pattern"] = pattern_match.group(1)
                
                # url
                if '.url(' in field_def:
                    constraints["format"] = "url"
            
            # Extract number constraints
            elif 'number' in field_def:
                min_match = re.search(r'min\s*=\s*(\d+(?:\.\d+)?)', field_def)
                if min_match:
                    constraints["minimum"] = float(min_match.group(1))
                
                max_match = re.search(r'max\s*=\s*(\d+(?:\.\d+)?)', field_def)
                if max_match:
                    constraints["maximum"] = float(max_match.group(1))
            
            # Check for optional
            if '.optional()' in field_def or '.default(' in field_def:
                constraints["required"] = False
            else:
                constraints["required"] = True
        
        return constraints

class MiddlewareGenerator:
    """Generate FastAPI middleware based on extracted schemas"""
    
    def __init__(self, schemas: Dict[str, Any]):
        self.schemas = schemas
    
    def generate_middleware_code(self) -> str:
        """Generate the middleware code"""
        code = """# Auto-generated Schema Validation Middleware
# Generated from Express.js Zod schemas

import json
import logging
from typing import Dict, Any
from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

class AutoSchemaValidationMiddleware:
    def __init__(self, app):
        self.app = app
        self.schema_mappings = self._generate_schema_mappings()
    
    async def __call__(self, request: Request, call_next):
        # Skip non-POST/PUT/PATCH requests
        if request.method not in ["POST", "PUT", "PATCH"]:
            return await call_next(request)
        
        path = request.url.path
        
        if path not in self.schema_mappings:
            return await call_next(request)
        
        try:
            body = await request.json()
            validation_result = self._validate_request(body, path)
            
            if not validation_result["valid"]:
                logger.warning(f"Schema validation failed for {path}")
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
    
    def _validate_request(self, body: Dict[str, Any], path: str) -> Dict[str, Any]:
        if path not in self.schema_mappings:
            return {"valid": True}
        
        mapping = self.schema_mappings[path]
        schema_fields = mapping["fields"]
        
        errors = []
        
        # Check required fields
        for field_name, field_info in schema_fields.items():
            if field_info["constraints"].get("required", True):
                if field_name not in body:
                    errors.append(f"Field '{field_name}' is required")
        
        # Check field constraints
        for field_name, value in body.items():
            if field_name in schema_fields:
                field_info = schema_fields[field_name]
                
                # Type checking
                expected_type = field_info["type"]
                if expected_type == "string" and not isinstance(value, str):
                    errors.append(f"Field '{field_name}' must be a string")
                elif expected_type == "number" and not isinstance(value, (int, float)):
                    errors.append(f"Field '{field_name}' must be a number")
                elif expected_type == "boolean" and not isinstance(value, bool):
                    errors.append(f"Field '{field_name}' must be a boolean")
                
                # String constraints
                constraints = field_info["constraints"]
                if "minLength" in constraints and isinstance(value, str) and len(value) < constraints["minLength"]:
                    errors.append(f"Field '{field_name}' must be at least {constraints['minLength']} characters")
                
                if "maxLength" in constraints and isinstance(value, str) and len(value) > constraints["maxLength"]:
                    errors.append(f"Field '{field_name}' must be at most {constraints['maxLength']} characters")
                
                # URL format check
                if constraints.get("format") == "url" and isinstance(value, str):
                    if not (value.startswith("http://") or value.startswith("https://")):
                        errors.append(f"Field '{field_name}' must be a valid URL")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors
        }
    
    def _generate_schema_mappings(self) -> Dict[str, Dict[str, Any]]:
        \"\"\"Generate schema mappings from extracted Zod schemas\"\"\"
        return {
"""
        
        # Add schema mappings
        endpoint_mappings = self._generate_endpoint_mappings()
        for i, (endpoint, mapping) in enumerate(endpoint_mappings.items()):
            comma = "," if i < len(endpoint_mappings) - 1 else ""
            code += f'            "{endpoint}": {json.dumps(mapping, indent=16)},{comma}\n'
        
        code += """        }
    
    def get_compatibility_report(self) -> str:
        \"\"\"Generate compatibility report\"\"\"
        report = "# Schema Compatibility Report\\n\\n"
        report += "Generated from Express.js Zod schemas\\n\\n"
        report += f"Total endpoints: {len(self.schema_mappings)}\\n\\n"
        
        for endpoint, mapping in self.schema_mappings.items():
            report += f"## {endpoint}\\n\\n"
            fields = mapping["fields"]
            report += f"Fields: {len(fields)}\\n"
            
            for field_name, field_info in fields.items():
                constraints = field_info["constraints"]
                required = "Required" if constraints.get("required", True) else "Optional"
                report += f"- {field_name}: {field_info['type']} ({required})\\n"
                if constraints:
                    constraint_strs = []
                    if "minLength" in constraints:
                        constraint_strs.append(f"minLength={constraints['minLength']}")
                    if "maxLength" in constraints:
                        constraint_strs.append(f"maxLength={constraints['maxLength']}")
                    if constraint_strs:
                        report += f"  - Constraints: {', '.join(constraint_strs)}\\n"
            
            report += "\\n---\\n\\n"
        
        return report
"""
        
        return code
    
    def get_compatibility_report(self) -> str:
        """Generate compatibility report"""
        report = "# Schema Compatibility Report\\n\\n"
        report += "Generated from Express.js Zod schemas\\n\\n"
        report += f"Total schemas: {len(self.schemas)}\\n\\n"
        
        for schema_name, schema_info in self.schemas.items():
            report += f"## {schema_name}\\n\\n"
            fields = schema_info.get("fields", {})
            report += f"Fields: {len(fields)}\\n"
            
            for field_name, field_info in fields.items():
                constraints = field_info.get("constraints", {})
                required = "Required" if constraints.get("required", True) else "Optional"
                report += f"- {field_name}: {field_info['type']} ({required})\\n"
                if constraints:
                    constraint_strs = []
                    if "minLength" in constraints:
                        constraint_strs.append(f"minLength={constraints['minLength']}")
                    if "maxLength" in constraints:
                        constraint_strs.append(f"maxLength={constraints['maxLength']}")
                    if "format" in constraints:
                        constraint_strs.append(f"format={constraints['format']}")
                    if constraint_strs:
                        report += f"  - Constraints: {', '.join(constraint_strs)}\\n"
            
            report += "\\n---\\n\\n"
        
        return report
    
    def _generate_endpoint_mappings(self) -> Dict[str, Dict[str, Any]]:
        """Generate endpoint mappings from schemas"""
        mappings = {}
        
        # Map schemas to endpoints based on common patterns
        schema_to_endpoint = {
            "TestConnectionRequestSchema": "/api/database/test-supabase",
            "ConnectSupabaseRequestSchema": "/api/database/connect-supabase",
            "LoginRequestSchema": "/api/auth/login",
            "RegisterRequestSchema": "/api/auth/register",
            "CreatePageRequestSchema": "/api/pages",
            "UpdatePageRequestSchema": "/api/pages/{id}",
            "CreateVariableRequestSchema": "/api/variables",
            "UpdateVariableRequestSchema": "/api/variables/{id}"
        }
        
        for schema_name, endpoint in schema_to_endpoint.items():
            if schema_name in self.schemas:
                mappings[endpoint] = {
                    "schema_name": schema_name,
                    "fields": self.schemas[schema_name]["fields"]
                }
        
        return mappings

def generate_middleware_files(express_js_path: str, output_dir: str):
    """Generate all middleware files"""
    
    # Extract schemas
    extractor = ZodSchemaExtractor(express_js_path)
    schemas = extractor.extract_all_schemas()
    
    # Generate middleware
    generator = MiddlewareGenerator(schemas)
    middleware_code = generator.generate_middleware_code()
    
    # Write files
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Auto-generated middleware
    middleware_file = output_path / "auto_schema_middleware.py"
    middleware_file.write_text(middleware_code)
    
    # Compatibility report
    report = generator.get_compatibility_report()
    report_file = output_path / "schema_compatibility_report.md"
    report_file.write_text(report)
    
    # Schema data (JSON)
    schemas_file = output_path / "extracted_schemas.json"
    with open(schemas_file, 'w') as f:
        json.dump(schemas, f, indent=2)
    
    print(f"Generated middleware files:")
    print(f"  - {middleware_file}")
    print(f"  - {report_file}")
    print(f"  - {schemas_file}")
    print(f"\\nExtracted {len(schemas)} schemas")

if __name__ == "__main__":
    # Paths
    express_js_path = "../server"  # Relative to fastapi-backend
    output_dir = "app/middleware/auto_generated"
    
    # Generate files
    generate_middleware_files(express_js_path, output_dir)
    
    print("\\n✅ Middleware generation complete!")
    print("\\nNext steps:")
    print("1. Review the compatibility report")
    print("2. Import and use the auto-generated middleware in main.py")
    print("3. Test API endpoints for compatibility")