"""
Edge Security Configuration.

Centralized security settings for edge resource connections (vector DBs,
caches, queues, state DBs). The single source of truth for SSRF protection
policy consumed by the connection testers (`test_*_connection_raw`).

Tuning knobs live here so operators can harden or relax policy without editing
router code. Values are plain module constants (no env coupling) — override at
deploy time via a patched module if a deployment needs a different policy.
"""

import ipaddress
from typing import FrozenSet, Tuple


# ─── SSRF protection ────────────────────────────────────────────────────────
# Networks that MUST NOT be reachable from server-side connection testers.
# Includes cloud-provider metadata services (169.254.0.0/16 etc.), RFC1918
# private space, loopback, and link-local — anything an attacker could target
# to pivot off the backend host or steal instance metadata.

DEFAULT_BLOCKED_IP_RANGES: FrozenSet[ipaddress._BaseNetwork] = frozenset({
    # Cloud provider metadata services
    ipaddress.ip_network('169.254.0.0/16'),   # AWS / GCP / Azure link-local metadata
    ipaddress.ip_network('100.100.0.0/16'),   # Alibaba (Aliyun) metadata
    ipaddress.ip_network('192.0.0.2/32'),      # Cloudflare DNS / metadata-like
    # RFC1918 private networks
    ipaddress.ip_network('10.0.0.0/8'),
    ipaddress.ip_network('172.16.0.0/12'),
    ipaddress.ip_network('192.168.0.0/16'),
    # Loopback
    ipaddress.ip_network('127.0.0.0/8'),
    ipaddress.ip_network('0.0.0.0/8'),          # "This host" / Unspecified
    # IPv6
    ipaddress.ip_network('::1/128'),            # IPv6 loopback
    ipaddress.ip_network('fc00::/7'),           # IPv6 unique-local
    ipaddress.ip_network('fe80::/10'),          # IPv6 link-local
})

# Allowlisted hostnames that bypass the IP blocklist (e.g. internal services on
# private space that the platform legitimately needs to reach). Empty by default.
ALLOWED_DOMAINS: FrozenSet[str] = frozenset()

# URL schemes the connection testers are permitted to dial. Anything else is
# rejected before DNS resolution. Kept narrow on purpose.
ALLOWED_URL_SCHEMES: Tuple[str, ...] = (
    "postgres://",
    "postgresql://",  # PostgreSQL / pgvector
    "https://",        # Cloud providers (CF Vectorize, Turso, Upstash, …)
    "http://",         # Self-hosted / local (still gated by _is_safe_url)
    "libsql://",       # Turso libsql protocol (host is SSRF-checked like https)
)

# ─── SSRF logging ───────────────────────────────────────────────────────────
# When True, blocked SSRF attempts are recorded via the security logger
# (Python logging + best-effort DB row). Disable only in noisy test envs.
SSRF_LOG_ENABLED: bool = True
SSRF_LOG_ATTEMPTS: bool = True
