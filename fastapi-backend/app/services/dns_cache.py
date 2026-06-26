"""
DNS resolution cache with TTL enforcement for SSRF hardening.

Purpose
-------
Two SSRF-relevant behaviors live here:

1. **Multi-IP resolution.** ``socket.gethostbyname`` returns a *single* address
   chosen by the OS. A hostname that resolves to both a public and a private
   address (a classic rebinding / pinning-bypass setup) could therefore pass an
   SSRF check when the OS hands back the public record, while the subsequent
   outbound connect lands on the private one. ``resolve_all`` uses
   ``socket.getaddrinfo`` to enumerate *every* A/AAAA record so the caller can
   reject the hostname when **any** resolved address is unsafe.

2. **TTL-stabilized cache.** Resolved address sets are memoized for a short
   window so repeated validations within one request lifecycle observe a
   consistent view rather than re-querying authoritative DNS each time.

Important limitation (documented, not hidden)
---------------------------------------------
Full DNS-rebinding protection requires pinning the *validated* IP onto the
actual outbound transport (httpx / asyncpg), so the connection cannot be
redirected to a freshly-rotated private address after the check passes. This
module validates and stabilizes the **check** path and closes the
mixed-A-record variant; connection-level IP pinning is future work. See the
Phase 2.1 delivery report §"Item 4 — known limitations".
"""

from __future__ import annotations

import ipaddress
import socket
import time
from threading import Lock
from typing import Callable, Dict, List, Tuple

# Injected clock so tests can advance time without sleeping. ``monotonic`` is
# immune to wall-clock jumps, which is what we want for TTL expiry.
_now: Callable[[], float] = time.monotonic

# Default TTL (seconds). Short enough to follow legitimate DNS changes, long
# enough to stabilize within a single request lifecycle.
DEFAULT_TTL = 60

# hostname -> (deduped+sorted address list, monotonic expiry timestamp)
_cache: Dict[str, Tuple[List[str], float]] = {}
_lock = Lock()


def _default_resolver(hostname: str) -> List[str]:
    """Resolve ``hostname`` to every IPv4/IPv6 literal address.

    Returns an empty list when DNS resolution fails. Order is unspecified;
    callers must treat the result as a set (the cache dedupes/sorts it).
    """
    addresses: List[str] = []
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return addresses
    for _family, _stype, _proto, _canon, sockaddr in infos:
        # IPv4 sockaddr: (host, port); IPv6 sockaddr: (host, port, flow, scope)
        candidate = sockaddr[0]
        # Strip any IPv6 zone-id ("fe80::1%eth0") — ip_address rejects it, and
        # we never dial a scoped address from the server side.
        if "%" in candidate:
            candidate = candidate.split("%", 1)[0]
        try:
            ipaddress.ip_address(candidate)
        except ValueError:
            continue
        if candidate not in addresses:
            addresses.append(candidate)
    return addresses


def resolve_all(
    hostname: str,
    ttl: int = DEFAULT_TTL,
    resolver: Callable[[str], List[str]] = _default_resolver,
) -> List[str]:
    """Return all resolved IP literals for ``hostname``, cached for ``ttl`` s.

    On a cache hit the cached set is returned even if upstream DNS has since
    changed — this is the stabilization property. On a miss (or expiry) the
    ``resolver`` is invoked and its result cached.

    A failed resolution is cached as an empty list for the TTL window so a
    transient NXDOMAIN does not hammer authoritative DNS; callers treat an
    empty result as "unresolvable → unsafe".
    """
    now = _now()
    with _lock:
        cached = _cache.get(hostname)
        if cached is not None:
            addresses, expires_at = cached
            if now < expires_at:
                return list(addresses)
            _cache.pop(hostname, None)

    resolved = resolver(hostname)
    normalized = sorted(set(resolved))

    with _lock:
        _cache[hostname] = (normalized, now + ttl)
    return list(normalized)


def clear_cache() -> None:
    """Drop every cached entry. Intended for tests and operational resets."""
    with _lock:
        _cache.clear()


def cache_stats() -> Dict[str, int]:
    """Snapshot of cache occupancy for monitoring/dashboards."""
    with _lock:
        return {"entries": len(_cache), "ttl_seconds": DEFAULT_TTL}
