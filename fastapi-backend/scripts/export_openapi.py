"""OpenAPI contract exporter (CF-22 P0 / W1).

Writes deterministic contract artifacts to fastapi-backend/contracts/:

  - openapi.full.json       — the DEPLOYMENT_MODE=cloud surface (every router),
                              with each operation annotated `x-edition`:
                              "community" (also present self-host) or "cloud".
  - openapi.community.json  — the DEPLOYMENT_MODE=self-host surface. This IS the
                              community-edition contract the frontbase-framework
                              backend must implement (CF-22 P1/P2 consume it).

Edition classification is DERIVED, never hand-maintained: the app is imported
once per deployment mode in a subprocess (edition.py reads DEPLOYMENT_MODE at
import time), and an operation is "community" iff it exists in the self-host
surface. Cloud mode uses AUTH_PROVIDER=supabase so no SuperTokens core is needed.

Usage:
    venv/Scripts/python.exe scripts/export_openapi.py          # export both
    venv/Scripts/python.exe scripts/export_openapi.py --check  # export + fail if
                                                               # contracts/ changed
                                                               # (CI staleness gate)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACTS = ROOT / "contracts"
METHODS = ("get", "post", "put", "delete", "patch", "options", "head", "trace")

MODES = {
    # artifact name -> env overrides for the subprocess import.
    # PYTHONHASHSEED pinned: FastAPI resolves duplicate pydantic model names by
    # module-path prefix in set-iteration order, which str-hash randomization
    # would otherwise make non-deterministic across runs.
    "community": {"DEPLOYMENT_MODE": "self-host", "PYTHONHASHSEED": "0"},
    "full": {"DEPLOYMENT_MODE": "cloud", "AUTH_PROVIDER": "supabase", "PYTHONHASHSEED": "0"},
}


def _dump_current_process(outfile: str) -> None:
    """Subprocess entry: import the app under the ambient env and dump its spec."""
    sys.path.insert(0, str(ROOT))
    from main import app  # noqa: PLC0415 — must import after env is set

    Path(outfile).write_text(json.dumps(app.openapi()), encoding="utf-8")


def _export_mode(mode: str) -> dict:
    env = {**os.environ, **MODES[mode]}
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        result = subprocess.run(
            [sys.executable, __file__, "--dump", tmp_path],
            env=env,
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            sys.stderr.write(result.stdout + result.stderr)
            raise SystemExit(f"export failed for mode '{mode}'")
        return json.loads(Path(tmp_path).read_text(encoding="utf-8"))
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _operation_keys(spec: dict) -> set[tuple[str, str]]:
    return {
        (path, method)
        for path, item in spec.get("paths", {}).items()
        for method in item
        if method in METHODS
    }


def _write(name: str, spec: dict) -> Path:
    CONTRACTS.mkdir(exist_ok=True)
    out = CONTRACTS / name
    out.write_text(json.dumps(spec, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return out


def main() -> None:
    if "--dump" in sys.argv:
        _dump_current_process(sys.argv[sys.argv.index("--dump") + 1])
        return

    community = _export_mode("community")
    full = _export_mode("full")

    community_ops = _operation_keys(community)
    full_ops = _operation_keys(full)

    orphans = community_ops - full_ops
    if orphans:  # self-host-only routes would make "full" a lie — surface loudly
        raise SystemExit(f"operations present in self-host but not cloud: {sorted(orphans)}")

    for path, item in full["paths"].items():
        for method in item:
            if method in METHODS:
                item[method]["x-edition"] = (
                    "community" if (path, method) in community_ops else "cloud"
                )

    _write("openapi.full.json", full)
    _write("openapi.community.json", community)

    cloud_only = len(full_ops - community_ops)
    print(
        f"contracts/ exported: full={len(full_ops)} ops "
        f"(community={len(community_ops)}, cloud-only={cloud_only})"
    )

    if "--check" in sys.argv:
        # Fail if the regenerated spec differs from the committed one. Compares
        # against the index (== HEAD on a fresh CI checkout), matching the
        # frontend client staleness gate. Locally this passes once the regenerated
        # artifacts are staged; in CI it fails when a router change wasn't
        # accompanied by a spec regeneration.
        diff = subprocess.run(
            ["git", "diff", "--exit-code", "--stat", "--", str(CONTRACTS)],
            cwd=ROOT,
        )
        if diff.returncode != 0:
            raise SystemExit("contracts/ artifacts are stale — commit the regenerated specs")


if __name__ == "__main__":
    main()
