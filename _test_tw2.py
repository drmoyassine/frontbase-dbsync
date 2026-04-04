import asyncio, os, tempfile, subprocess
os.chdir('fastapi-backend')
import sys
sys.path.insert(0, '.')

from app.services.tailwind_cli import ensure_tailwind_cli

async def main():
    tailwind_bin = await ensure_tailwind_cli()
    input_css = "input_test.css"
    content_file = "content_test.html"

    # Write content
    with open(content_file, "w") as f:
        f.write('<div class="flex h-10 w-full rounded-md border-input bg-card bg-background shadow-sm space-y-4 px-3 py-2 text-sm border rounded-lg"></div>')

    # Write CSS
    with open(input_css, "w") as f:
        f.write('@import "tailwindcss";\n')
        f.write(f'@source "{content_file}";\n')

    cmd = [
        tailwind_bin,
        "-i", input_css,
        "--minify"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    print(f"Status: {result.returncode}")
    print(f"Output length: {len(result.stdout)}")
    for cls in ['flex', 'h-10', 'w-full', 'rounded-md', 'border-input', 'bg-card']:
        print(f".{cls}: {('.' + cls) in result.stdout}")
        
    try: os.remove(input_css); os.remove(content_file)
    except: pass

asyncio.run(main())
