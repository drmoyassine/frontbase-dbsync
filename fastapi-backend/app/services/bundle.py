"""
Bundle Hash & Build Utilities.

Shared by all provider deploy modules.
Single source of truth for:
- Source hash computation (drift detection)
- Bundle building (provider-specific tsup config selection)

To add a new provider:
  Add entries to PROVIDER_TSUP_CONFIGS (lite + full).
"""

import json
import os
import hashlib
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import HTTPException


# Path to the edge service
EDGE_DIR = Path(os.getcwd()).parent / "services" / "edge"
if not EDGE_DIR.exists():
    EDGE_DIR = Path(__file__).parent.parent.parent.parent / "services" / "edge"


# ── Provider → tsup config map ────────────────────────────────────────
# Each entry: {"config": tsup config filename, "output": built JS filename}
# Key format: "{provider}" for lite, "{provider}-full" for full bundle.
PROVIDER_TSUP_CONFIGS = {
    # Cloudflare (existing)
    "cloudflare":      {"config": "tsup.cloudflare-lite.ts",        "output": "cloudflare-lite.js"},
    "cloudflare-full": {"config": "tsup.cloudflare.ts",             "output": "cloudflare.js"},
    # Supabase Edge Functions
    "supabase":        {"config": "tsup.supabase-edge-lite.ts",     "output": "supabase-edge-lite.js"},
    "supabase-full":   {"config": "tsup.supabase-edge.ts",          "output": "supabase-edge.js"},
    # Upstash Workflows
    "upstash":         {"config": "tsup.upstash-workflow-lite.ts",  "output": "upstash-workflow-lite.js"},
    "upstash-full":    {"config": "tsup.upstash-workflow.ts",       "output": "upstash-workflow.js"},
    # Vercel Edge Functions
    "vercel":          {"config": "tsup.vercel-edge-lite.ts",       "output": "vercel-edge-lite.js"},
    "vercel-full":     {"config": "tsup.vercel-edge.ts",            "output": "vercel-edge.js"},
    # Netlify Edge Functions
    "netlify":         {"config": "tsup.netlify-edge-lite.ts",      "output": "netlify-edge-lite.js"},
    "netlify-full":    {"config": "tsup.netlify-edge.ts",           "output": "netlify-edge.js"},
    # Deno Deploy
    "deno":            {"config": "tsup.deno-deploy-lite.ts",       "output": "deno-deploy-lite.js"},
    "deno-full":       {"config": "tsup.deno-deploy.ts",            "output": "deno-deploy.js"},
}


def compute_bundle_hash(content: str) -> str:
    """Compute a 12-char SHA-256 hash of a bundle."""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()[:12]


# In-memory cache to avoid re-hashing on every request
_source_hash_cache: dict[str, tuple[float, str]] = {}  # path → (mtime, hash)

# Build cache: config_key → (source_hash, script_content, bundle_hash)
# Avoids re-running tsup when source hasn't changed (prevents --reload restart)
_build_cache: dict[str, tuple[str, str, str]] = {}


# ── Core Zone Convention ──────────────────────────────────────────────
# Files prefixed with CORE_PREFIX are system-managed (Frontbase core).
# Everything else at snapshot root is user-customizable code.
CORE_PREFIX = "frontbase-core"


def get_source_hash() -> str | None:
    """Hash all .ts source files in services/edge/src/ for drift detection.
    
    Returns a 12-char SHA-256 digest, or None if the source dir doesn't exist.
    This hashes the CORE source tree — drift means Frontbase has a new core version.
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


def capture_source_snapshot(provider: str = "", adapter_type: str = "") -> dict[str, str] | None:
    """Capture provider-relevant .ts source files as { relative_path: content }.

    Filters by:
    - provider: excludes adapter files for OTHER providers
    - adapter_type: excludes ssr/, components/ for lite bundles (automations-only)
    Excludes __tests__/, backup files, and type declaration stubs.
    All paths are prefixed with 'frontbase-edge/' for branding.
    Injects a README.md at the root for DX context.
    Returns None if src/ directory doesn't exist.
    """
    src_dir = EDGE_DIR / "src"
    if not src_dir.exists():
        return None

    # Build exclusion list: adapters for OTHER providers
    all_providers = {"cloudflare", "supabase", "vercel", "netlify", "deno", "upstash", "docker"}
    other_providers = all_providers - {provider} if provider else set()

    # Folders only used by full bundles (SSR/pages) — exclude from lite
    is_lite = adapter_type in ("automations", "lite", "")
    full_only_dirs = {"ssr/", "components/", "db/_archived/"}

    # Core files go under frontbase-core/ prefix (system-managed zone)
    PREFIX = CORE_PREFIX

    snapshot: dict[str, str] = {}
    for filepath in sorted(src_dir.rglob("*.ts")):
        rel = str(filepath.relative_to(src_dir)).replace("\\", "/")
        # Skip test files, backups, and declaration stubs
        if rel.startswith("__tests__/") or ".bak" in rel:
            continue
        # Skip other providers' adapter files
        if rel.startswith("adapters/") and other_providers:
            basename = filepath.stem.lower()
            if any(p in basename for p in other_providers):
                continue
        # Skip SSR-only folders for lite bundles
        if is_lite and any(rel.startswith(d) for d in full_only_dirs):
            continue
        try:
            snapshot[f"{PREFIX}/{rel}"] = filepath.read_text(encoding="utf-8")
        except (OSError, IOError):
            continue

    if not snapshot:
        return None

    # Inject README.md at root
    bundle_mode = "Full (SSR + Automations)" if not is_lite else "Lite (Automations only)"
    provider_label = provider.capitalize() if provider else "Unknown"
    readme = f"""# Frontbase Edge Engine

**Provider**: {provider_label}
**Bundle**: {bundle_mode}
**Adapter**: {adapter_type or "automations"}

## Folder Structure

| Folder | Description |
|:-------|:------------|
| `adapters/` | Platform entry point — wires the Hono app to the runtime |
| `engine/` | Core Hono app creation, middleware, route registration |
| `routes/` | API routes: health, deploy, execute, webhook, executions |
| `cache/` | Redis/Upstash cache adapter with ICacheProvider interface |
| `middleware/` | Auth (API key, JWT), rate limiting |
| `db/` | State provider (SQLite/Turso), datasource adapters |
| `schemas/` | Zod validation schemas for API payloads |
| `startup/` | Backend sync on boot (Redis, Turso, JWT settings) |
| `lib/` | Shared utilities |
{"| `ssr/` | Server-side page rendering (React/Hono) |" if not is_lite else ""}
## Data vs Code

This Inspector shows the **engine source code** — how the runtime works.

Published **pages and workflows** are stored in the attached state database
(SQLite or Turso), not in these source files. They are deployed via the
`/api/deploy` endpoint and served by the routes defined here.
"""
    snapshot[f"{PREFIX}/README.md"] = readme

    return snapshot


def write_source_files(files: dict[str, str], target_dir: Path | None = None) -> int:
    """Write source files to a directory (default: EDGE_DIR/src/).

    Returns count of files written.
    Strips 'frontbase-core/' or legacy 'frontbase-edge/' prefix if present.
    Skips README.md (virtual Inspector file, not a real source).
    Path traversal protection: all resolved paths must stay inside target.
    """
    src_dir = target_dir or (EDGE_DIR / "src")
    if not src_dir.exists():
        raise HTTPException(500, f"Source directory not found: {src_dir}")

    written = 0
    for rel_path, content in files.items():
        # Skip virtual README
        if rel_path.endswith("README.md"):
            continue
        # Strip zone prefixes
        clean_path = rel_path
        for prefix in (f"{CORE_PREFIX}/", "frontbase-edge/"):
            if clean_path.startswith(prefix):
                clean_path = clean_path[len(prefix):]
                break
        target = (src_dir / clean_path).resolve()
        # Block path traversal
        if not str(target).startswith(str(src_dir.resolve())):
            raise HTTPException(400, f"Path traversal blocked: {rel_path}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        written += 1

    return written


def build_worker_from_snapshot(
    snapshot: dict[str, str],
    adapter_type: str = "automations",
    provider: str = "cloudflare",
) -> tuple[str, str]:
    """Build a bundle from an engine's source snapshot (temp dir isolation).

    1. Copy the edge service scaffolding (package.json, tsup configs, node_modules)
    2. Write snapshot files into temp src/
    3. Run tsup build
    4. Return (script_content, bundle_hash)
    5. Cleanup temp dir
    """
    is_full = adapter_type == "full"
    config_key = f"{provider}-full" if is_full else provider
    cfg = PROVIDER_TSUP_CONFIGS.get(config_key)
    if not cfg:
        raise HTTPException(400, f"Unknown provider/adapter_type: {config_key}")

    config_file = cfg["config"]
    output_file = cfg["output"]
    label = f"{provider.capitalize()} {'Full' if is_full else 'Lite'} (snapshot)"

    tmp_dir = None
    try:
        tmp_dir = Path(tempfile.mkdtemp(prefix="frontbase-build-"))
        tmp_src = tmp_dir / "src"
        tmp_src.mkdir()

        # Copy build scaffolding from EDGE_DIR
        for f in ("package.json", "tsconfig.json", config_file):
            src = EDGE_DIR / f
            if src.exists():
                shutil.copy2(src, tmp_dir / f)

        # Symlink node_modules (much faster than copying)
        nm_src = EDGE_DIR / "node_modules"
        nm_dst = tmp_dir / "node_modules"
        if nm_src.exists():
            # Windows junction for dirs, symlink for Unix
            if os.name == 'nt':
                subprocess.run(
                    ["cmd", "/c", "mklink", "/J", str(nm_dst), str(nm_src)],
                    capture_output=True, shell=False
                )
            else:
                nm_dst.symlink_to(nm_src)

        # Write snapshot files to temp src/
        write_source_files(snapshot, target_dir=tmp_src)

        # Run tsup build in temp dir
        dist_file = tmp_dir / "dist" / output_file
        print(f"[Bundle] Building {label} from snapshot in {tmp_dir}...")
        result = subprocess.run(
            ["npx", "tsup", "--config", config_file],
            cwd=str(tmp_dir),
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=120 if is_full else 60,
            shell=True,
        )
        if result.returncode != 0:
            err = result.stderr.strip() or result.stdout.strip() or "Unknown build error"
            raise HTTPException(500, f"Snapshot build failed: {err[:500]}")

        if not dist_file.exists():
            raise HTTPException(500, f"Snapshot build output not found at {dist_file}")

        content = dist_file.read_text(encoding="utf-8")
        bundle_hash = compute_bundle_hash(content)
        print(f"[Bundle] {label} snapshot build: {len(content)} bytes hash={bundle_hash}")
        return content, bundle_hash

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Snapshot build failed: {str(e)}")
    finally:
        if tmp_dir and tmp_dir.exists():
            try:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass  # Best-effort cleanup


def apply_core_update(
    engine_snapshot: dict[str, str],
    new_core: dict[str, str],
) -> tuple[dict[str, str], list[str]]:
    """Merge a new core snapshot with an engine's existing snapshot.

    - Replaces all frontbase-core/* entries with new core
    - Preserves all user files (anything NOT under frontbase-core/)
    - Returns (merged_snapshot, conflicting_files) where conflicting_files
      lists core files the user had previously modified
    """
    prefix = f"{CORE_PREFIX}/"

    # Separate user files (anything not under frontbase-core/)
    user_files = {k: v for k, v in engine_snapshot.items() if not k.startswith(prefix)}

    # Detect conflicts: core files that user had modified
    old_core = {k: v for k, v in engine_snapshot.items() if k.startswith(prefix)}
    conflicts = []
    for path, new_content in new_core.items():
        if path in old_core and old_core[path] != new_content:
            # This core file existed and was different — was it user-modified?
            # (If the old core matched the previous release, it's not a conflict)
            conflicts.append(path)

    # Merge: new core + user files
    merged = {**new_core, **user_files}
    return merged, conflicts


def build_worker(adapter_type: str = "automations", provider: str = "cloudflare") -> tuple[str, str]:
    """Build a provider-specific bundle and return (script_content, bundle_hash).
    
    Uses PROVIDER_TSUP_CONFIGS to select the correct tsup config and output
    filename. In Docker/VPS: delegates to edge container. In dev: runs locally.
    """
    is_full = adapter_type == "full"
    label = f"{provider.capitalize()} {'Full' if is_full else 'Lite'}"

    # Resolve tsup config + output from the registry
    config_key = f"{provider}-full" if is_full else provider
    cfg = PROVIDER_TSUP_CONFIGS.get(config_key)
    if not cfg:
        raise HTTPException(400, f"Unknown provider/adapter_type: {config_key}")
    config_file = cfg["config"]
    output_file = cfg["output"]
    dist_file = EDGE_DIR / "dist" / output_file

    # --- Strategy 1: Delegate to edge container (Docker/VPS) ---
    edge_url = os.environ.get("EDGE_URL", os.environ.get("EDGE_SSR_URL", ""))
    if edge_url:
        import requests as req
        build_url = f"{edge_url}/api/build-bundle"
        print(f"[Bundle] Delegating {label} bundle build to edge container ({build_url})...")
        try:
            resp = req.post(
                build_url,
                json={"adapter_type": adapter_type, "provider": provider},
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

    # Cache check: skip rebuild if source hasn't changed since last build
    current_src_hash = get_source_hash() or ""
    cached = _build_cache.get(config_key)
    if cached and dist_file.exists():
        cached_hash, cached_content, cached_bundle_hash = cached
        if cached_hash == current_src_hash:
            print(f"[Bundle] {label} cache hit (hash={cached_bundle_hash}), skipping rebuild")
            return cached_content, cached_bundle_hash

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
    _build_cache[config_key] = (current_src_hash, content, bundle_hash)
    print(f"[Bundle] {label} bundle built: {len(content)} bytes ({len(content)//1024} KB) hash={bundle_hash}")
    return content, bundle_hash
