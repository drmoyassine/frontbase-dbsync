"""One-off credential backfill (task #124 phase 5d).

Migrates legacy inline datasource credentials into Connected Accounts so the
phase-5a lockdown leaves no row behind: for every datasource row WITHOUT a
``provider_account_id`` that still carries inline secrets, create an
``EdgeProviderAccount`` (in the main DB) from those secrets, point the row at
it, then NULL the inline secret columns. Google Sheets / REST rows additionally
have their secrets stripped from ``extra_config`` (webAppSecret /
webAppSecretEncrypted / headers).

Idempotent: rows that already reference a CA are skipped, so re-running is a
no-op. Dry-run by default — ``--apply`` performs the migration.

Usage:
    python -m app.services.sync.backfill_credentials            # pre-flight report
    python -m app.services.sync.backfill_credentials --apply    # migrate + null

Rows with neither a CA nor inline credentials are reported but untouched (they
were already unusable); their secrets are NEVER nulled without a replacement
CA being created first.
"""

import argparse
import json
import uuid
from typing import Any, Optional

_SECRET_COLUMNS = ("password_encrypted", "api_key_encrypted", "anon_key_encrypted")

# extra_config keys that are credentials (stripped after migration)
_EXTRA_CONFIG_SECRET_KEYS = {
    "google_sheets": ("webAppSecret", "webAppSecretEncrypted"),
    "rest": ("headers",),
}


def _dec(value: Optional[str]) -> Optional[str]:
    """Decrypt an inline column value; plaintext (legacy) passes through."""
    from app.core.security import decrypt_field
    if not value:
        return None
    return decrypt_field(value)


def _parse_extra(row: Any) -> dict:
    raw = getattr(row, "extra_config", None)
    if not raw:
        return {}
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else dict(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def plan_migration(row: Any) -> Optional[dict]:
    """Map a legacy datasource row's inline credentials onto CA payloads.

    Pure function (no DB). Returns::

        {"secrets": {...}, "metadata": {...},
         "extra_config": "<cleaned json or None>", "extra_config_changed": bool}

    or ``None`` when the row carries no inline credentials worth migrating.
    Metadata key names match PROVIDER_METADATA_KEYS per provider so the values
    stay cleartext on the CA (routing happens via split_credentials at connect).
    """
    t = getattr(getattr(row, "type", None), "value", None) or str(getattr(row, "type", ""))
    secrets: dict = {}
    metadata: dict = {}
    extra = _parse_extra(row)
    extra_changed = False

    if t == "supabase":
        if _dec(row.api_key_encrypted):
            secrets["service_role_key"] = _dec(row.api_key_encrypted)
        if _dec(row.anon_key_encrypted):
            secrets["anon_key"] = _dec(row.anon_key_encrypted)
        if row.api_url:
            metadata["api_url"] = row.api_url
    elif t in ("postgres", "mysql", "neon"):
        if _dec(row.password_encrypted):
            secrets["password"] = _dec(row.password_encrypted)
        if t == "neon" and _dec(row.api_key_encrypted):
            secrets["api_key"] = _dec(row.api_key_encrypted)
        for col in ("host", "port", "database", "username"):
            val = getattr(row, col, None)
            if val is not None:
                metadata[col] = val
    elif t in ("wordpress_rest", "wordpress_graphql", "wordpress_plugin"):
        app_pw = _dec(getattr(row, "api_key_encrypted", None)) or \
            _dec(getattr(row, "password_encrypted", None))
        if app_pw:
            secrets["app_password"] = app_pw
        url_key = "base_url" if t == "wordpress_rest" else "api_url"
        if getattr(row, "api_url", None):
            metadata[url_key] = row.api_url
        if getattr(row, "username", None):
            metadata["username"] = row.username
    elif t == "google_sheets":
        secret = extra.get("webAppSecret")
        encrypted = extra.get("webAppSecretEncrypted")
        if not secret and encrypted:
            secret = _dec(encrypted)
        if secret:
            secrets["webAppSecret"] = secret
        for key in ("webAppUrl", "spreadsheetId", "spreadsheetName"):
            if extra.get(key):
                metadata[key] = extra[key]
        for key in _EXTRA_CONFIG_SECRET_KEYS["google_sheets"]:
            if key in extra:
                extra.pop(key)
                extra_changed = True
    elif t == "rest":
        if extra.get("headers"):
            secrets["headers"] = extra["headers"]
        if extra.get("baseUrl"):
            metadata["baseUrl"] = extra["baseUrl"]
        for key in _EXTRA_CONFIG_SECRET_KEYS["rest"]:
            if key in extra:
                extra.pop(key)
                extra_changed = True
    else:
        return None

    if not secrets and not metadata:
        return None
    if not secrets:
        # Metadata-only rows carry no credential — nothing to centralize.
        return None

    return {
        "secrets": secrets,
        "metadata": metadata,
        "extra_config": json.dumps(extra) if extra_changed else None,
        "extra_config_changed": extra_changed,
    }


async def run_backfill(apply: bool = False) -> dict:
    """Scan all datasource rows; optionally migrate them. Returns a report."""
    from sqlalchemy import select
    from app.services.sync.database import async_session
    from app.services.sync.models.datasource import Datasource
    from app.database.config import SessionLocal
    from app.models.models import EdgeProviderAccount
    from app.core.security import encrypt_credentials
    from datetime import datetime, timezone

    report = {
        "total": 0, "already_ca": 0, "needs_migration": 0,
        "migrated": 0, "no_inline_creds": 0, "failed": 0,
        "needs_by_type": {}, "apply": apply,
    }

    async with async_session() as db:
        rows = (await db.execute(select(Datasource))).scalars().all()
        report["total"] = len(rows)

        for row in rows:
            t = getattr(row.type, "value", None) or str(row.type)
            if row.provider_account_id:
                report["already_ca"] += 1
                continue
            plan = plan_migration(row)
            if not plan:
                report["no_inline_creds"] += 1
                continue
            report["needs_migration"] += 1
            report["needs_by_type"][t] = report["needs_by_type"].get(t, 0) + 1

            if not apply:
                continue

            # 1. Create the CA in the MAIN DB first — secrets are only nulled
            #    once a replacement exists (never break a working datasource).
            main_db = SessionLocal()
            try:
                now = datetime.now(timezone.utc).isoformat()
                ca = EdgeProviderAccount(
                    id=str(uuid.uuid4()),
                    name=f"{row.name} (migrated)",
                    project_id=row.project_id,
                    provider=t,
                    provider_credentials=encrypt_credentials(plan["secrets"]),
                    provider_metadata=json.dumps(plan["metadata"]) if plan["metadata"] else None,
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
                main_db.add(ca)
                main_db.commit()
                ca_id = str(ca.id)
            except Exception:
                main_db.rollback()
                report["failed"] += 1
                continue
            finally:
                main_db.close()

            # 2. Point the row at the CA and null the inline secrets.
            row.provider_account_id = ca_id
            for col in _SECRET_COLUMNS:
                setattr(row, col, None)
            if plan["extra_config_changed"]:
                row.extra_config = plan["extra_config"]
            report["migrated"] += 1

        if apply:
            await db.commit()

    return report


def _print_report(report: dict) -> None:
    mode = "APPLY" if report["apply"] else "DRY RUN (no changes made)"
    print(f"[backfill_credentials] {mode}")
    print(f"  total rows:            {report['total']}")
    print(f"  already have a CA:     {report['already_ca']}")
    print(f"  need migration:        {report['needs_migration']}"
          + (f"  by type: {report['needs_by_type']}" if report["needs_by_type"] else ""))
    print(f"  no inline creds:       {report['no_inline_creds']}")
    if report["apply"]:
        print(f"  migrated:              {report['migrated']}")
        print(f"  failed:                {report['failed']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="perform the migration (default: dry-run report)")
    args = parser.parse_args()

    import asyncio
    report = asyncio.run(run_backfill(apply=args.apply))
    _print_report(report)
    if args.apply and report["failed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
