"""Managed auto-provisioning — Frontbase-owned Cloudflare resources for managed tiers.

When a managed-tier tenant (Free-shared / Basic) is granted a managed add-on, this
provisions the corresponding Cloudflare resource **in Frontbase's account** and records
it as an ordinary row (``is_managed=True``, project-scoped) so serving / secrets_builder
work unchanged. Provisioning is gated by ``has_active_addon``; resources are deprovisioned
on add-on revoke.

Operator credentials (env, NOT per-tenant):
  FB_OPERATOR_CF_ACCOUNT_ID  — Frontbase's Cloudflare account id
  FB_OPERATOR_CF_API_TOKEN   — token scoped to: Workers Scripts, D1, Workers KV,
                               Workers R2, Workers Domains

⚠️ Makes LIVE Cloudflare API calls. Requires the operator credentials above and a live
integration test against them before the managed tier is enabled — code-complete, not
operationally verified without those.

Resource map (Cloudflare-native; queue = Upstash QStash is a separate provider, see TODO):
  managed_edge_db → CF Workers (engine) + CF D1 (state-db)   [engine deploy reuses the
                                                              existing bundle pipeline]
  managed_cache   → CF Workers KV namespace
  managed_domain  → CF Workers Custom Domain
  (storage)       → CF R2 bucket
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

CF_API = "https://api.cloudflare.com/client/v4"


# ---------------------------------------------------------------------------
# Operator credentials
# ---------------------------------------------------------------------------

class ManagedProvisioningNotConfigured(RuntimeError):
    """Raised when operator CF credentials are absent."""


def operator_credentials() -> tuple[str, str]:
    account = os.getenv("FB_OPERATOR_CF_ACCOUNT_ID")
    token = os.getenv("FB_OPERATOR_CF_API_TOKEN")
    if not account or not token:
        raise ManagedProvisioningNotConfigured(
            "Managed provisioning is not configured. Set FB_OPERATOR_CF_ACCOUNT_ID and "
            "FB_OPERATOR_CF_API_TOKEN (Cloudflare token scoped to Workers/D1/KV/R2/Domains)."
        )
    return account, token


def is_configured() -> bool:
    try:
        operator_credentials()
        return True
    except ManagedProvisioningNotConfigured:
        return False


# ---------------------------------------------------------------------------
# Cloudflare REST helpers
# ---------------------------------------------------------------------------

async def _cf(method: str, path: str, *, json_body: Optional[dict] = None) -> dict[str, Any]:
    account, token = operator_credentials()
    url = f"{CF_API}/{path.format(account_id=account)}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(method, url, headers=headers, json=json_body)
    data = resp.json() if resp.content else {}
    if resp.status_code >= 400 or not data.get("success", True):
        raise RuntimeError(f"Cloudflare API {method} {path} failed: {resp.status_code} {data}")
    return data.get("result", {})


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Resource provisioning (records is_managed rows)
# ---------------------------------------------------------------------------

async def provision_d1(db: Session, *, tenant_id: str, project_id: str, name: str) -> str:
    """Create a D1 database in the operator account; record an is_managed EdgeDatabase.

    Returns the new EdgeDatabase id. Requires the managed_edge_db add-on (checked by caller).
    """
    from app.models.models import EdgeDatabase
    result = await _cf("POST", "accounts/{account_id}/d1/database", json_body={"name": name})
    db_id = str(result.get("uuid") or "")
    db_url = f"{result.get('hostname', '')}"  # D1 is accessed via binding, not a URL
    row = EdgeDatabase(
        id=str(uuid.uuid4()),
        name=name,
        provider="d1",
        db_url=db_url or f"d1:{db_id}",
        db_token=None,
        project_id=project_id,
        is_managed=True,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(row)
    db.commit()
    logger.info("[managed] provisioned D1 %s for tenant %s", db_id, tenant_id)
    return str(row.id)


async def provision_kv(db: Session, *, tenant_id: str, project_id: str, title: str) -> str:
    """Create a Workers KV namespace; record an is_managed EdgeCache. Requires managed_cache."""
    from app.models.models import EdgeCache
    result = await _cf("POST", "accounts/{account_id}/storage/kv/namespaces", json_body={"title": title})
    ns_id = str(result.get("id") or "")
    row = EdgeCache(
        id=str(uuid.uuid4()),
        name=title,
        provider="kv",
        cache_url=f"kv:{ns_id}",
        project_id=project_id,
        is_managed=True,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(row)
    db.commit()
    logger.info("[managed] provisioned KV %s for tenant %s", ns_id, tenant_id)
    return str(row.id)


async def provision_r2(db: Session, *, tenant_id: str, project_id: str, name: str) -> str:
    """Create an R2 bucket (storage). Records a storage_providers row (is_managed)."""
    # R2 uses the S3-compatible API; bucket creation via CF API:
    await _cf("PUT", "accounts/{account_id}/r2/buckets", json_body={"name": name})
    # The storage_providers model stores the bucket; caller records it.
    logger.info("[managed] provisioned R2 bucket %s for tenant %s", name, tenant_id)
    return name


# ---------------------------------------------------------------------------
# Deprovision (on add-on revoke / tenant termination)
# ---------------------------------------------------------------------------

async def deprovision_d1(db: Session, edge_db_id: str) -> None:
    from app.models.models import EdgeDatabase
    row = db.query(EdgeDatabase).filter(EdgeDatabase.id == edge_db_id, EdgeDatabase.is_managed == True).first()  # noqa: E712
    if not row:
        return
    cf_id = str(row.db_url).split(":", 1)[1] if str(row.db_url).startswith("d1:") else None
    if cf_id:
        try:
            await _cf("DELETE", f"accounts/{{account_id}}/d1/database/{cf_id}")
        except Exception as e:
            logger.warning("[managed] D1 delete failed for %s: %s", cf_id, e)
    db.delete(row)
    db.commit()


async def deprovision_kv(db: Session, cache_id: str) -> None:
    from app.models.models import EdgeCache
    row = db.query(EdgeCache).filter(EdgeCache.id == cache_id, EdgeCache.is_managed == True).first()  # noqa: E712
    if not row:
        return
    ns_id = str(row.cache_url).split(":", 1)[1] if str(row.cache_url).startswith("kv:") else None
    if ns_id:
        try:
            await _cf("DELETE", f"accounts/{{account_id}}/storage/kv/namespaces/{ns_id}")
        except Exception as e:
            logger.warning("[managed] KV delete failed for %s: %s", ns_id, e)
    db.delete(row)
    db.commit()


# TODO (managed pipeline, credential-gated):
#  - provision_engine(): deploy the Frontbase edge bundle as a CF Worker in the operator
#    account (re-use engine_provisioner._cf_pre_deploy + secrets_builder, re-targeted to the
#    operator EdgeProviderAccount). Records an is_managed EdgeEngine. This is the base
#    managed_edge_db resource and the core of the managed tier.
#  - provision_domain(): CF Workers Custom Domain (managed_domain add-on).
#  - queue (managed_queue): Upstash QStash (separate provider + token).
