"""Neon Management API helpers — connect-time credential enrichment.

Mirrors supabase_management.py: after a Neon Connected Account is created, the
connect flow fetches the selected project's connection URI and decomposes it
into discrete fields so datasources referencing the CA can connect. Before this
(task #124 Gap 1) the discovered connection_uri never left the discovery
response — the CA only held the management API key, and neon datasources
created against it had no DB credentials to connect with.

The password lands in the CA's encrypted secrets (`password` is a registered
neon secret key); host/port/database/username land in cleartext metadata.
"""

from typing import Optional

import httpx
from sqlalchemy.engine.url import make_url

NEON_API = "https://console.neon.tech/api/v2"


async def fetch_neon_db_credentials(api_key: str, project_id: str) -> Optional[dict]:
    """Fetch the project's connection URI and decompose it into discrete fields.

    Returns ``{"password", "host", "port", "database", "username"}`` (whichever
    are present) or ``None`` on any failure — enrichment is best-effort and
    must never fail the connect.
    """
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{NEON_API}/projects/{project_id}/connection_uri",
                headers=headers,
                params={"role_name": "neondb_owner", "database_name": "neondb"},
            )
        if resp.status_code != 200:
            return None
        uri = resp.json().get("uri", "")
        if not uri:
            return None
        u = make_url(uri)
        out: dict = {}
        for key, val in (
            ("host", u.host), ("port", u.port), ("database", u.database),
            ("username", u.username), ("password", u.password),
        ):
            if val is not None:
                out[key] = val
        return out or None
    except Exception:
        return None
