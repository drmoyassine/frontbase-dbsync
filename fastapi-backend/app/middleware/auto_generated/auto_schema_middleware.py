# Auto-generated Schema Validation Middleware
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
        """Generate schema mappings from extracted Zod schemas"""
        return {
            "/api/database/test-supabase": {
                "schema_name": "TestConnectionRequestSchema",
                "fields": {
                                "url": {
                                                "type": "string",
                                                "constraints": {
                                                                "format": "url",
                                                                "required": true
                                                }
                                },
                                "anonKey": {
                                                "type": "string",
                                                "constraints": {
                                                                "required": true
                                                }
                                }
                }
},,
            "/api/database/connect-supabase": {
                "schema_name": "ConnectSupabaseRequestSchema",
                "fields": {
                                "url": {
                                                "type": "string",
                                                "constraints": {
                                                                "format": "url",
                                                                "required": true
                                                }
                                },
                                "anonKey": {
                                                "type": "string",
                                                "constraints": {
                                                                "required": true
                                                }
                                },
                                "serviceKey": {
                                                "type": "string",
                                                "constraints": {
                                                                "required": false
                                                }
                                }
                }
},,
            "/api/auth/login": {
                "schema_name": "LoginRequestSchema",
                "fields": {
                                "username": {
                                                "type": "string",
                                                "constraints": {
                                                                "required": true
                                                }
                                },
                                "password": {
                                                "type": "string",
                                                "constraints": {
                                                                "required": true
                                                }
                                }
                }
},,
            "/api/auth/register": {
                "schema_name": "RegisterRequestSchema",
                "fields": {
                                "username": {
                                                "type": "string",
                                                "constraints": {
                                                                "required": true
                                                }
                                },
                                "email": {
                                                "type": "string",
                                                "constraints": {
                                                                "required": true
                                                }
                                },
                                "password": {
                                                "type": "string",
                                                "constraints": {
                                                                "required": true
                                                }
                                }
                }
},
        }
    
    def get_compatibility_report(self) -> str:
        """Generate compatibility report"""
        report = "# Schema Compatibility Report\n\n"
        report += "Generated from Express.js Zod schemas\n\n"
        report += f"Total endpoints: {len(self.schema_mappings)}\n\n"
        
        for endpoint, mapping in self.schema_mappings.items():
            report += f"## {endpoint}\n\n"
            fields = mapping["fields"]
            report += f"Fields: {len(fields)}\n"
            
            for field_name, field_info in fields.items():
                constraints = field_info["constraints"]
                required = "Required" if constraints.get("required", True) else "Optional"
                report += f"- {field_name}: {field_info['type']} ({required})\n"
                if constraints:
                    constraint_strs = []
                    if "minLength" in constraints:
                        constraint_strs.append(f"minLength={constraints['minLength']}")
                    if "maxLength" in constraints:
                        constraint_strs.append(f"maxLength={constraints['maxLength']}")
                    if constraint_strs:
                        report += f"  - Constraints: {', '.join(constraint_strs)}\n"
            
            report += "\n---\n\n"
        
        return report
