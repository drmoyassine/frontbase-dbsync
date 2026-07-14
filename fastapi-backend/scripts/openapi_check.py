"""OpenAPI hygiene gate (CF-22 P0 / W1).

Validates contracts/openapi.full.json (run scripts/export_openapi.py first):

  HARD FAILURES (contract must always hold):
    - every operation has an operationId, and they are globally unique
    - every operation has at least one tag
    - every operation carries an x-edition annotation (community|cloud)

  RATCHET (burn-down, never regress):
    - operations whose success response has no typed schema (missing
      response_model / untyped dict return -> `{}` schema) are compared against
      the committed baseline contracts/openapi_gaps.json:
        * a gap NOT in the baseline fails the build (new untyped endpoint)
        * baseline entries that are now typed are reported as burn-down;
          run with --update-baseline to shrink the file (it can only shrink)

Usage:
    venv/Scripts/python.exe scripts/openapi_check.py
    venv/Scripts/python.exe scripts/openapi_check.py --update-baseline
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACTS = ROOT / "contracts"
SPEC_PATH = CONTRACTS / "openapi.full.json"
BASELINE_PATH = CONTRACTS / "openapi_gaps.json"
METHODS = ("get", "post", "put", "delete", "patch", "options", "head", "trace")


def _operations(spec: dict):
    for path, item in spec.get("paths", {}).items():
        for method in item:
            if method in METHODS:
                yield path, method, item[method]


def _has_typed_success(op: dict) -> bool:
    """True when some 2xx response declares a non-empty JSON schema."""
    for status, resp in op.get("responses", {}).items():
        if not status.startswith("2"):
            continue
        if status == "204":  # no content is a legitimate typed contract
            return True
        for media in resp.get("content", {}).values():
            schema = media.get("schema")
            if schema:  # FastAPI emits literally {} for untyped returns
                return True
    return False


def main() -> None:
    if not SPEC_PATH.exists():
        raise SystemExit("contracts/openapi.full.json missing — run scripts/export_openapi.py")

    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    errors: list[str] = []

    # Duplicate pydantic class names across modules get module-path-prefixed
    # component names (app__routers__x__Foo) — non-deterministic across runs and
    # hostile to client codegen. Rename the class instead.
    for name in spec.get("components", {}).get("schemas", {}):
        if "__" in name:
            errors.append(f"module-prefixed schema name (duplicate class — rename it): {name}")
    gaps: list[str] = []
    op_ids: Counter[str] = Counter()
    total = 0

    for path, method, op in _operations(spec):
        total += 1
        key = f"{method.upper()} {path}"

        op_id = op.get("operationId")
        if not op_id:
            errors.append(f"missing operationId: {key}")
        else:
            op_ids[op_id] += 1

        if not op.get("tags"):
            errors.append(f"missing tags: {key}")

        if op.get("x-edition") not in ("community", "cloud"):
            errors.append(f"missing x-edition: {key}")

        if not _has_typed_success(op):
            gaps.append(key)

    for op_id, count in sorted(op_ids.items()):
        if count > 1:
            dupes = [
                f"{m.upper()} {p}"
                for p, m, o in _operations(spec)
                if o.get("operationId") == op_id
            ]
            errors.append(f"duplicate operationId '{op_id}': {dupes}")

    gaps.sort()
    baseline: list[str] = (
        json.loads(BASELINE_PATH.read_text(encoding="utf-8")) if BASELINE_PATH.exists() else []
    )

    new_gaps = [g for g in gaps if g not in baseline]
    burned_down = [b for b in baseline if b not in gaps]

    if "--update-baseline" in sys.argv:
        if not BASELINE_PATH.exists():
            BASELINE_PATH.write_text(json.dumps(gaps, indent=2) + "\n", encoding="utf-8")
            print(f"baseline created: {len(gaps)} untyped-response gaps recorded")
        else:
            kept = [b for b in baseline if b in gaps]  # ratchet only shrinks
            BASELINE_PATH.write_text(json.dumps(kept, indent=2) + "\n", encoding="utf-8")
            print(f"baseline shrunk: {len(baseline)} -> {len(kept)} (burned down {len(burned_down)})")
        baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
        new_gaps = [g for g in gaps if g not in baseline]

    typed = total - len(gaps)
    print(f"operations: {total} | typed success responses: {typed} ({typed * 100 // max(total, 1)}%)")
    print(f"untyped gaps: {len(gaps)} (baseline {len(baseline)}, burn-down available: {len(burned_down)})")

    if errors:
        print("\nHARD FAILURES:")
        for e in errors:
            print(f"  - {e}")
    if new_gaps:
        print("\nNEW untyped-response endpoints (add response_model or typed return):")
        for g in new_gaps:
            print(f"  - {g}")

    if errors or new_gaps:
        raise SystemExit(1)
    print("openapi hygiene gate: PASS")


if __name__ == "__main__":
    main()
