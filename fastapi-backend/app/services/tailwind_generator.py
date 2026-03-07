"""
Tailwind CSS Utility Generator

Extracted from css_bundler.py for single-responsibility compliance.
Handles extracting CSS class names from Edge SSR TypeScript source files
and generating Tailwind CSS utilities via the standalone CLI.
"""

import asyncio
import os
import re
import subprocess
import tempfile
from typing import Set

from .tailwind_cli import ensure_tailwind_cli


def extract_css_classes_from_source(source_dir: str) -> set:
    """
    Extract CSS class names from Edge SSR TypeScript renderer source files.
    
    Scans for class="..." and className="..." patterns in template strings
    and string literals. Also handles conditional class expressions like
    `props.hideOnDesktop ? 'md:hidden' : ''`.
    
    Similar pattern to icon extraction: we parse the source to find
    exactly what CSS classes are used, then pass them to Tailwind.
    """
    classes = set()
    
    # Patterns to extract CSS classes from TypeScript source
    patterns = [
        # class="..." or className="..." in template literals
        r'class(?:Name)?=[\"\'](.*?)[\"\'](.*?)',
        r'class(?:Name)?=\\?"([^"]+?)\\?"',
        r'class(?:Name)?=\\"([^\\]+?)\\"',
        # String literals containing class names (e.g. 'md:hidden', 'flex gap-4')
        r"'([a-z][a-z0-9:/_-]+(?:\s+[a-z][a-z0-9:/_-]+)*)'",
    ]
    
    # Use the exact same patterns as original
    patterns = [
        r'class(?:Name)?=[\"\'](.*?)[\"\'](.*?)',
        r'class(?:Name)?=\\?"([^"]+?)\\?"',
        r'class(?:Name)?=\\"([^\\]+?)\\"',
        r"'([a-z][a-z0-9:/_-]+(?:\s+[a-z][a-z0-9:/_-]+)*)'",
    ]
    
    if not os.path.isdir(source_dir):
        return classes
    
    for root, dirs, files in os.walk(source_dir):
        for filename in files:
            if not (filename.endswith('.ts') or filename.endswith('.tsx')):
                continue
            filepath = os.path.join(root, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                for pattern in patterns:
                    for match in re.finditer(pattern, content):
                        class_str = match.group(1)
                        for cls in class_str.split():
                            cls = cls.strip('"\',`{}$')
                            if cls and re.match(r'^[a-zA-Z!-][\w:/.\[\]-]*$', cls):
                                classes.add(cls)
            except Exception as e:
                print(f"[tailwind_generator] Warning: Could not read {filepath}: {e}")
    
    return classes


def extract_classes_from_component(component: dict, classes: set):
    """Extract CSS class names from component props (user-set className, etc.)"""
    if not isinstance(component, dict):
        return
    props = component.get('props', {})
    if isinstance(props, dict):
        for key, value in props.items():
            if key.lower() in ('classname', 'class', 'containerclass') and isinstance(value, str):
                for cls in value.split():
                    cls = cls.strip()
                    if cls:
                        classes.add(cls)
    # Recurse into children
    for child in component.get('children', []):
        extract_classes_from_component(child, classes)


async def generate_tailwind_utilities(components: list) -> str:
    """
    Generate Tailwind utility CSS using @source inline() with extracted class names.
    
    Instead of relying on Tailwind's Oxide scanner to parse TypeScript template
    literals (which misses responsive variants like md:flex), we:
    1. Read Edge SSR source files (.ts)
    2. Extract all CSS class names using regex
    3. Feed them to Tailwind v4 via @source inline("...")
    
    This is the CSS equivalent of the icon-fetch pattern: deterministic, 
    complete, and requires zero manual class maintenance.
    
    Compatible with Tailwind CSS v4.2+ (@source inline syntax).
    """
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            input_css = os.path.join(tmpdir, "input.css")
            output_css = os.path.join(tmpdir, "output.css")
            
            # 1. Find Edge SSR source directory  
            edge_ssr_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "services", "edge", "src", "ssr")
            if not os.path.isdir(edge_ssr_dir):
                edge_ssr_dir = "/app/edge-ssr-source"
            
            # 2. Extract all CSS class names from source files
            extracted_classes = extract_css_classes_from_source(edge_ssr_dir)
            
            # Also extract class names from component JSON (user-set className props)
            for component in components:
                extract_classes_from_component(component, extracted_classes)
            
            if extracted_classes:
                print(f"[tailwind_generator] Extracted {len(extracted_classes)} unique CSS classes from Edge SSR source")
                responsive = [c for c in extracted_classes if ':' in c and not c.startswith('--')]
                if responsive:
                    print(f"[tailwind_generator] Responsive classes found: {sorted(responsive)[:20]}")
            else:
                print("[tailwind_generator] Warning: No CSS classes extracted, using safelist fallback")

            # 3. Build @source inline() directive with all extracted classes
            classes_str = ' '.join(sorted(extracted_classes))
            
            # 4. Write input CSS with @source inline()
            with open(input_css, "w") as f:
                f.write('@import "tailwindcss";\n')
                f.write(f'@source inline("{classes_str}");\n\n')
                # Map CSS variable color names so Tailwind generates
                # bg-primary, text-muted-foreground, border-border, etc.
                f.write('@theme {\n')
                f.write('  --color-background: hsl(var(--background));\n')
                f.write('  --color-foreground: hsl(var(--foreground));\n')
                f.write('  --color-primary: hsl(var(--primary));\n')
                f.write('  --color-primary-foreground: hsl(var(--primary-foreground));\n')
                f.write('  --color-secondary: hsl(var(--secondary));\n')
                f.write('  --color-secondary-foreground: hsl(var(--secondary-foreground));\n')
                f.write('  --color-muted: hsl(var(--muted));\n')
                f.write('  --color-muted-foreground: hsl(var(--muted-foreground));\n')
                f.write('  --color-accent: hsl(var(--accent));\n')
                f.write('  --color-accent-foreground: hsl(var(--accent-foreground));\n')
                f.write('  --color-destructive: hsl(var(--destructive));\n')
                f.write('  --color-destructive-foreground: hsl(var(--destructive-foreground));\n')
                f.write('  --color-card: hsl(var(--card));\n')
                f.write('  --color-card-foreground: hsl(var(--card-foreground));\n')
                f.write('  --color-popover: hsl(var(--popover));\n')
                f.write('  --color-popover-foreground: hsl(var(--popover-foreground));\n')
                f.write('  --color-border: hsl(var(--border));\n')
                f.write('  --color-input: hsl(var(--input));\n')
                f.write('  --color-ring: hsl(var(--ring));\n')
                f.write('  --radius: var(--radius);\n')
                f.write('}\n')
                
            # 5. Run tailwindcss CLI (v4 standalone binary)
            tailwind_bin = await ensure_tailwind_cli()
            if not tailwind_bin:
                print("[tailwind_generator] ⚠️ Tailwind CLI unavailable, skipping utility generation")
                return ""

            cmd = [
                tailwind_bin,
                "-i", input_css,
                "-o", output_css,
                "--minify"
            ]
            
            def _run_tailwind():
                return subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=30,
                    cwd=tmpdir
                )
            
            try:
                result = await asyncio.to_thread(_run_tailwind)
            except subprocess.TimeoutExpired:
                print("[tailwind_generator] ⚠️ Tailwind CLI timed out after 30s")
                return ""
            
            if result.stderr:
                stderr_text = result.stderr.strip()
                if stderr_text:
                    print(f"[tailwind_generator] Tailwind CLI stderr: {stderr_text[:500]}")
            
            if result.returncode != 0:
                print(f"[tailwind_generator] Tailwind CLI failed (exit {result.returncode})")
                return ""
                
            if os.path.exists(output_css):
                with open(output_css, "r") as f:
                    result = f.read()
                has_media = '@media' in result
                print(f"[tailwind_generator] Tailwind utilities generated: {len(result)} bytes, has @media: {has_media}")
                return result
            return ""
    except Exception as e:
        print(f"[tailwind_generator] Error running Tailwind CLI: {str(e)}")
        return ""
