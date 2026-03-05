"""
Bundle Hash & Build Utilities.

Shared by both cloudflare.py and edge_engines.py routers.
Single source of truth for:
- Source hash computation (drift detection)
- Bundle building (CF worker output)
"""

import os
import hashlib
import subprocess
from pathlib import Path

from fastapi import HTTPException


# Path to the edge service
EDGE_DIR = Path(os.getcwd()).parent / "services" / "edge"
if not EDGE_DIR.exists():
    EDGE_DIR = Path(__file__).parent.parent.parent.parent / "services" / "edge"


def compute_bundle_hash(content: str) -> str:
    """Compute a 12-char SHA-256 hash of a bundle."""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()[:12]


# In-memory cache to avoid re-hashing on every request
_source_hash_cache: dict[str, tuple[float, str]] = {}  # path → (mtime, hash)


def get_source_hash() -> str | None:
    """Hash all .ts source files in services/edge/src/ for drift detection.
    
    Returns a 12-char SHA-256 digest, or None if the source dir doesn't exist.
    Changes to ANY .ts file in the source tree will produce a different hash,
    immediately marking deployed engines as outdated — no build step required.
    """
    src_dir = EDGE_DIR / "src"
    if not src_dir.exists():
        return None

    hasher = hashlib.sha256()
    # Sort for determinism across OS/filesystem orderings
    ts_files = sorted(src_dir.rglob("*.ts"))
    if not ts_files:
        return None

    for filepath in ts_files:
        # Include the relative path so that renames/moves change the hash
        rel = str(filepath.relative_to(src_dir)).replace("\\", "/")
        hasher.update(rel.encode("utf-8"))
        try:
            hasher.update(filepath.read_bytes())
        except (OSError, IOError):
            continue

    return hasher.hexdigest()[:12]


def build_worker(adapter_type: str = "automations") -> tuple[str, str]:
    """Build the Cloudflare Worker bundle and return (script_content, bundle_hash).
    
    In Docker/VPS: delegates to the edge container's /api/build-bundle endpoint.
    In local dev: runs npx tsup directly (edge source is available locally).
    """
    is_full = adapter_type == "full"
    label = "Full" if is_full else "Lite"

    # --- Strategy 1: Delegate to edge container (Docker/VPS) ---
    edge_url = os.environ.get("EDGE_URL", os.environ.get("EDGE_SSR_URL", ""))
    if edge_url:
        import requests as req
        build_url = f"{edge_url}/api/build-bundle"
        print(f"[Bundle] Delegating {label} bundle build to edge container ({build_url})...")
        try:
            resp = req.post(
                build_url,
                json={"adapter_type": adapter_type},
                timeout=120 if is_full else 60,
            )
            data = resp.json()
            if resp.status_code != 200 or not data.get("success"):
                err = data.get("error", "Unknown build error")
                raise HTTPException(500, f"Edge build failed: {err[:500]}")
            
            content = data["script_content"]
            bundle_hash = compute_bundle_hash(content)
            print(f"[Bundle] {label} bundle received: {len(content)} bytes ({len(content)//1024} KB) hash={bundle_hash}")
            return content, bundle_hash
        except HTTPException:
            raise
        except Exception as e:
            print(f"[Bundle] Edge build delegation failed: {e}, trying local fallback...")

    # --- Strategy 2: Local build (development) ---
    if not EDGE_DIR.exists():
        raise HTTPException(500, f"Edge service not available for building. EDGE_DIR={EDGE_DIR} does not exist and EDGE_URL is not set.")

    config_file = "tsup.cloudflare.ts" if is_full else "tsup.cloudflare-lite.ts"
    output_file = "cloudflare.js" if is_full else "cloudflare-lite.js"
    dist_file = EDGE_DIR / "dist" / output_file

    if dist_file.exists():
        dist_file.unlink()

    print(f"[Bundle] Building {label} Worker bundle locally in {EDGE_DIR}...")
    try:
        result = subprocess.run(
            ["npx", "tsup", "--config", config_file],
            cwd=str(EDGE_DIR),
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=120 if is_full else 60,
            shell=True,
        )

        if result.returncode != 0:
            err = result.stderr.strip() or result.stdout.strip() or "Unknown build error"
            raise HTTPException(500, f"Build failed: {err[:500]}")
    except subprocess.TimeoutExpired:
        raise HTTPException(500, f"Build timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Build process failed: {str(e)}")

    if not dist_file.exists():
        raise HTTPException(500, f"Build output not found at {dist_file}")

    content = dist_file.read_text(encoding="utf-8")
    bundle_hash = compute_bundle_hash(content)
    print(f"[Bundle] {label} bundle built: {len(content)} bytes ({len(content)//1024} KB) hash={bundle_hash}")
    return content, bundle_hash
