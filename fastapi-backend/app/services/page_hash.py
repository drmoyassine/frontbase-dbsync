"""
Page Hash Utility — SHA-256 content hash for drift detection.

Extracted from publish.py for single-responsibility compliance.
Used by: publish_to_target, and any future page comparison logic.
"""

import hashlib
import json


def compute_page_hash(page) -> str:
    """Compute a SHA-256 hash of the page's publishable attributes for drift detection.

    Rule: Include ALL columns EXCEPT:
      - content_hash (self-referential)
      - Metadata columns: deleted_at, created_at, updated_at

    This is future-proof: new columns on the Page model are automatically
    included in the hash without code changes.
    """
    # Columns excluded from the hash
    EXCLUDED = frozenset({
        "content_hash",   # self-referential
        "deleted_at",     # metadata
        "created_at",     # metadata
        "updated_at",     # metadata
    })

    def serialize(d):
        if d is None: return ""
        if isinstance(d, bool): return "1" if d else "0"
        if isinstance(d, str):
            try:
                obj = json.loads(d)
                return json.dumps(obj, sort_keys=True) if isinstance(obj, dict) else json.dumps(obj)
            except: return d
        return json.dumps(d, sort_keys=True)

    # Dynamically collect column values in alphabetical order for determinism
    if hasattr(page, '__table__'):
        col_names = sorted(c.name for c in page.__table__.columns if c.name not in EXCLUDED)
    else:
        # Fallback for non-ORM objects (dicts, etc.)
        col_names = sorted(k for k in vars(page) if not k.startswith('_') and k not in EXCLUDED)

    parts = [serialize(getattr(page, col, None)) for col in col_names]
    raw_string = "|".join(parts)
    return hashlib.sha256(raw_string.encode('utf-8')).hexdigest()
