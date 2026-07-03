"""Connected-account identity — what makes two accounts "the same account."

The primary credential key(s) per provider (e.g. Cloudflare's ``api_token``) uniquely
identify an account, independent of its display name. Used to:

- **dedup at connect time** (``routers/edge_providers.py``) — refuse connecting an
  account that's already connected; and
- **match-or-create on portable import** (``services/engine_move.py``) — so an imported
  engine rebinds to the SAME account when one already exists, and creates a fresh one
  (bringing its credentials) when it doesn't.

Matching is **never name-based** (two distinct accounts can share a name) and **always
scoped to one ``project_id``** — which is tenant-bound, so a match never inspects another
tenant's accounts. Identity keys may live in the secrets blob or the metadata dict, so
both are merged for the comparison (this also fixes a latent gap where Supabase's
``project_ref`` — metadata — never matched against the decrypted secrets alone).
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

# Primary credential key(s) that uniquely identify an account per provider.
# Default fallback is ``["api_token"]`` for any provider not listed.
ACCOUNT_IDENTITY_KEYS: dict[str, list[str]] = {
    "cloudflare": ["api_token"],
    "supabase":   ["access_token", "project_ref"],
    "vercel":     ["api_token"],
    "netlify":    ["api_token"],
    "deno":       ["access_token"],
    "upstash":    ["api_token", "email"],
}


def _account_view(acct: Any) -> dict:
    """Decrypted secrets ∪ parsed metadata for an ``EdgeProviderAccount``."""
    from .security import decrypt_credentials

    view: dict = {}
    try:
        view.update(decrypt_credentials(str(acct.provider_credentials or "{}")))
    except Exception:
        pass
    if acct.provider_metadata:
        try:
            view.update(json.loads(str(acct.provider_metadata)))
        except (json.JSONDecodeError, TypeError):
            pass
    return view


def find_account_by_identity(
    db: Session,
    project_id: str | None,
    provider: str,
    incoming: dict,
) -> Any | None:
    """Return the existing account in ``project_id`` that IS ``incoming``, or None.

    Parameters
    ----------
    project_id:
        Tenant scope. In multi-tenant cloud mode this is the caller's project, so only
        that tenant's accounts are ever inspected. Master admin / self-host pass None,
        which matches their own unassigned accounts (project_id IS NULL).
    provider:
        e.g. ``"cloudflare"`` — selects the identity keys from :data:`ACCOUNT_IDENTITY_KEYS`.
    incoming:
        Merged (metadata ∪ secrets) plaintext credential dict for the account being
        connected/imported.

    Returns the matching ``EdgeProviderAccount`` (reuse) or ``None`` (caller creates).
    Same primary credential = same account; different credential = different account,
    so this never causes a wrong rebinding — at worst a duplicate, never a misbind.
    """
    from ..models.models import EdgeProviderAccount

    keys = ACCOUNT_IDENTITY_KEYS.get(provider, ["api_token"])
    incoming_identity = {k: incoming.get(k) for k in keys if incoming.get(k)}
    if not incoming_identity:
        return None  # nothing to match on → caller creates

    candidates = (
        db.query(EdgeProviderAccount)
        .filter(
            EdgeProviderAccount.provider == provider,
            EdgeProviderAccount.project_id == project_id,
        )
        .all()
    )
    for acct in candidates:
        view = _account_view(acct)
        if all(view.get(k) == incoming_identity.get(k) for k in incoming_identity):
            return acct
    return None
