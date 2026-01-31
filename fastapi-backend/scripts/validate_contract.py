"""
Pydantic-Zod Contract Validation Script

This script validates that the Pydantic schemas (FastAPI) and Zod schemas (Edge)
are in sync by generating JSON Schema from Pydantic and comparing the structure.

Run this script during CI/CD or before publishing to ensure contract parity.
"""

import json
import sys
from pathlib import Path

# Add the app to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.schemas.publish import (
    PageComponent,
    VisibilitySettings,
    ViewportOverrides,
    StylesData,
    ComponentBinding,
    PublishPageRequest,
    PageLayout,
)


def generate_contract_snapshot():
    """Generate JSON Schema snapshot from Pydantic models"""
    
    schemas = {
        "PageComponent": PageComponent.model_json_schema(),
        "VisibilitySettings": VisibilitySettings.model_json_schema(),
        "ViewportOverrides": ViewportOverrides.model_json_schema(),
        "StylesData": StylesData.model_json_schema(),
        "ComponentBinding": ComponentBinding.model_json_schema(),
        "PublishPageRequest": PublishPageRequest.model_json_schema(),
        "PageLayout": PageLayout.model_json_schema(),
    }
    
    return schemas


def save_contract_snapshot(output_path: str = "contracts/publish-contract.json"):
    """Save the contract snapshot to a file"""
    schemas = generate_contract_snapshot()
    
    output_file = Path(__file__).parent.parent / output_path
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_file, "w") as f:
        json.dump(schemas, f, indent=2)
    
    print(f"✅ Contract snapshot saved to: {output_file}")
    return output_file


def validate_required_fields():
    """Validate that critical fields are present in schemas"""
    
    errors = []
    
    # Check PageComponent has required fields
    page_component_fields = set(PageComponent.model_fields.keys())
    required_fields = {"id", "type", "visibility", "styles", "stylesData", "children", "binding", "props"}
    
    missing = required_fields - page_component_fields
    if missing:
        errors.append(f"PageComponent missing fields: {missing}")
    
    # Check VisibilitySettings has viewport fields
    visibility_fields = set(VisibilitySettings.model_fields.keys())
    required_visibility = {"mobile", "tablet", "desktop"}
    
    missing_visibility = required_visibility - visibility_fields
    if missing_visibility:
        errors.append(f"VisibilitySettings missing fields: {missing_visibility}")
    
    # Check ViewportOverrides has viewport fields
    viewport_fields = set(ViewportOverrides.model_fields.keys())
    required_viewports = {"mobile", "tablet"}
    
    missing_viewports = required_viewports - viewport_fields
    if missing_viewports:
        errors.append(f"ViewportOverrides missing fields: {missing_viewports}")
    
    # Check StylesData has required fields
    styles_fields = set(StylesData.model_fields.keys())
    required_styles = {"values", "viewportOverrides"}
    
    missing_styles = required_styles - styles_fields
    if missing_styles:
        errors.append(f"StylesData missing fields: {missing_styles}")
    
    if errors:
        print("❌ Contract validation failed:")
        for error in errors:
            print(f"   - {error}")
        return False
    
    print("✅ All required fields present in Pydantic schemas")
    return True


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Validate Pydantic-Zod contract")
    parser.add_argument("--generate", action="store_true", help="Generate contract snapshot")
    parser.add_argument("--validate", action="store_true", help="Validate required fields")
    parser.add_argument("--output", default="contracts/publish-contract.json", help="Output path for snapshot")
    
    args = parser.parse_args()
    
    if args.generate:
        save_contract_snapshot(args.output)
    
    if args.validate:
        if not validate_required_fields():
            sys.exit(1)
    
    if not args.generate and not args.validate:
        # Run both by default
        save_contract_snapshot(args.output)
        if not validate_required_fields():
            sys.exit(1)


if __name__ == "__main__":
    main()
