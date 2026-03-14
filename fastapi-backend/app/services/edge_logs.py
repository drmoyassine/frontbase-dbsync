"""
Edge Logs — Fetch runtime logs from edge providers.

Supports Deno Deploy, Cloudflare Workers, and Supabase Edge Functions.
Each provider's raw log format is normalized to UnifiedLogEntry.

Caching follows AGENTS.md L1/L2/L3 pattern:
  L1: In-memory _LOG_CACHE (60s TTL)
  L2: Redis (5 min TTL)
  L3: Provider API (source)
"""

import time
import json
import hashlib
from dataclasses import dataclass, asdict
from typing import Optional

from datetime import datetime, timedelta, timezone
import httpx


# ── Unified Log Entry ─────────────────────────────────────────────────

@dataclass
class UnifiedLogEntry:
    timestamp: str       # ISO 8601
    level: str           # debug | info | warn | error
    message: str         # Raw log message
    source: str = "runtime"   # runtime | request | error
    metadata: Optional[dict] = None  # Provider-specific extras


@dataclass
class LogsResponse:
    logs: list[dict]
    next_cursor: Optional[str] = None
    provider: str = ""
    cached: bool = False


# ── L1 In-Memory Cache (60s TTL) ─────────────────────────────────────

_LOG_CACHE: dict[str, tuple[float, LogsResponse]] = {}
_L1_TTL = 60  # seconds


def _cache_key(engine_id: str, cursor: str | None, level: str | None, limit: int) -> str:
    raw = f"{engine_id}:{cursor or ''}:{level or ''}:{limit}"
    return hashlib.md5(raw.encode()).hexdigest()


def _l1_get(key: str) -> LogsResponse | None:
    entry = _LOG_CACHE.get(key)
    if entry and (time.time() - entry[0]) < _L1_TTL:
        result = entry[1]
        result.cached = True
        return result
    if entry:
        del _LOG_CACHE[key]
    return None


def _l1_set(key: str, value: LogsResponse) -> None:
    _LOG_CACHE[key] = (time.time(), value)
    # Evict old entries if cache grows too large
    if len(_LOG_CACHE) > 200:
        cutoff = time.time() - _L1_TTL
        stale = [k for k, (ts, _) in _LOG_CACHE.items() if ts < cutoff]
        for k in stale:
            del _LOG_CACHE[k]


# ── L2 Redis Cache (5 min TTL) ───────────────────────────────────────

_L2_TTL = 300  # seconds


async def _l2_get(redis_url: str | None, key: str) -> LogsResponse | None:
    if not redis_url:
        return None
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(redis_url, decode_responses=True)
        data = await r.get(f"edge_logs:{key}")
        await r.aclose()
        if data:
            parsed = json.loads(data)
            return LogsResponse(
                logs=parsed["logs"],
                next_cursor=parsed.get("next_cursor"),
                provider=parsed.get("provider", ""),
                cached=True,
            )
    except Exception:
        pass
    return None


async def _l2_set(redis_url: str | None, key: str, value: LogsResponse) -> None:
    if not redis_url:
        return
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(redis_url, decode_responses=True)
        await r.setex(
            f"edge_logs:{key}",
            _L2_TTL,
            json.dumps({"logs": value.logs, "next_cursor": value.next_cursor, "provider": value.provider}),
        )
        await r.aclose()
    except Exception:
        pass


# ── Public API ────────────────────────────────────────────────────────

async def fetch_logs(
    provider_type: str,
    creds: dict,
    engine_name: str,
    limit: int = 50,
    cursor: str | None = None,
    level: str | None = None,
    redis_url: str | None = None,
    engine_id: str = "",
) -> LogsResponse:
    """Fetch logs from a provider with L1/L2 caching.

    Args:
        provider_type: 'deno', 'cloudflare', or 'supabase'
        creds: decrypted credentials (from credential_resolver)
        engine_name: app slug / script name / function slug
        limit: max entries to return
        cursor: pagination cursor (provider-specific)
        level: filter by log level
        redis_url: optional Redis URL for L2 cache
        engine_id: engine ID for cache key

    Returns:
        LogsResponse with normalized log entries and next cursor.
    """
    ck = _cache_key(engine_id or engine_name, cursor, level, limit)

    # L1 check
    cached = _l1_get(ck)
    if cached:
        return cached

    # L2 check
    cached = await _l2_get(redis_url, ck)
    if cached:
        _l1_set(ck, cached)
        return cached

    # L3: fetch from provider
    if provider_type == "deno":
        result = await _deno_fetch_logs(creds, engine_name, limit, cursor, level)
    elif provider_type == "cloudflare":
        result = await _cf_fetch_logs(creds, engine_name, limit, cursor, level)
    elif provider_type == "supabase":
        result = await _supabase_fetch_logs(creds, engine_name, limit, cursor, level)
    elif provider_type == "vercel":
        result = await _vercel_fetch_logs(creds, engine_name, limit, cursor, level)
    else:
        result = LogsResponse(logs=[], provider=provider_type)

    # Store in caches
    _l1_set(ck, result)
    await _l2_set(redis_url, ck, result)

    return result


# ── Provider: Deno Deploy ─────────────────────────────────────────────

async def _deno_fetch_logs(
    creds: dict, app_slug: str, limit: int, cursor: str | None, level: str | None
) -> LogsResponse:
    """Fetch runtime logs from Deno Deploy via GET /v2/apps/{app}/logs.

    The Deno v2 API requires a `start` query param (ISO timestamp).
    Returns {logs: [...], next_cursor: str|null}.
    """
    access_token = creds.get("access_token", "")
    if not access_token:
        return LogsResponse(logs=[], provider="deno")

    # `start` is required — default to 24h ago. Deno expects Z suffix, not +00:00
    start_ts = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")

    params: dict[str, str | int] = {
        "start": start_ts,
        "limit": min(limit, 1000),
    }
    if cursor:
        params["cursor"] = cursor
    if level:
        params["level"] = level

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"https://api.deno.com/v2/apps/{app_slug}/logs",
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
        )
        if resp.status_code != 200:
            print(f"[EdgeLogs] Deno logs failed: {resp.status_code} {resp.text[:200]}")
            return LogsResponse(logs=[], provider="deno")

        data = resp.json()

    # Deno v2 returns {logs: [...], next_cursor: str|null}
    logs_raw = data.get("logs", []) if isinstance(data, dict) else data
    next_cursor = data.get("next_cursor") if isinstance(data, dict) else None

    entries = []
    for entry in logs_raw:
        entries.append(asdict(UnifiedLogEntry(
            timestamp=entry.get("timestamp", entry.get("time", "")),
            level=entry.get("level", "info"),
            message=entry.get("message", entry.get("msg", str(entry))),
            source=entry.get("source", "runtime"),
            metadata={k: v for k, v in entry.items() if k not in ("timestamp", "time", "level", "message", "msg")},
        )))

    return LogsResponse(logs=entries, next_cursor=next_cursor, provider="deno")


# ── Provider: Cloudflare Workers ──────────────────────────────────────

async def _cf_fetch_logs(
    creds: dict, script_name: str, limit: int, cursor: str | None, level: str | None
) -> LogsResponse:
    """Fetch invocation logs from CF Workers via GraphQL Analytics API.

    Uses workersInvocationsAdaptive for invocation-level telemetry: status,
    datacenter (coloCode), wall time, response size, subrequests.

    Note: CF's Observability telemetry/query endpoint requires dashboard-created
    saved queries (queryId) and cannot be used for ad-hoc programmatic access.
    The GraphQL Analytics API is the best available programmatic option.
    """
    api_token = creds.get("api_token", "")
    account_id = creds.get("account_id", "") or creds.get("_metadata", {}).get("account_id", "")

    if not api_token:
        return LogsResponse(logs=[], provider="cloudflare")

    # If no account_id in creds, resolve it
    if not account_id:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.cloudflare.com/client/v4/accounts",
                headers={"Authorization": f"Bearer {api_token}"},
            )
            if resp.status_code == 200:
                accounts = resp.json().get("result", [])
                if accounts:
                    account_id = accounts[0].get("id", "")

    if not account_id:
        return LogsResponse(logs=[], provider="cloudflare")

    return await _cf_graphql_fetch(api_token, account_id, script_name, limit, cursor)


async def _cf_graphql_fetch(
    api_token: str, account_id: str, script_name: str, limit: int, cursor: str | None,
) -> LogsResponse:
    """Fallback: GraphQL Analytics for invocation-level telemetry."""
    offset = int(cursor) if cursor and cursor.isdigit() else 0
    now = datetime.now(timezone.utc)
    since = (now - timedelta(hours=72)).strftime("%Y-%m-%dT%H:%M:%SZ")
    until_ts = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    graphql_query = """
    {
      viewer {
        accounts(filter: {accountTag: "%s"}) {
          workersInvocationsAdaptive(
            filter: {datetime_geq: "%s", datetime_leq: "%s"%s}
            limit: %d
            orderBy: [datetime_DESC]
          ) {
            dimensions {
              datetime
              scriptName
              status
              coloCode
            }
            sum {
              wallTime
              errors
              subrequests
              responseBodySize
            }
          }
        }
      }
    }
    """ % (
        account_id,
        since,
        until_ts,
        f', scriptName: "{script_name}"' if script_name else "",
        min(limit, 100),
    )

    entries: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.cloudflare.com/client/v4/graphql",
                headers={"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"},
                json={"query": graphql_query},
            )
            if resp.status_code != 200:
                print(f"[EdgeLogs] CF GraphQL failed: {resp.status_code} {resp.text[:200]}")
                return LogsResponse(logs=[], provider="cloudflare")

            data = resp.json()

        accounts = data.get("data", {}).get("viewer", {}).get("accounts", [])
        invocations = accounts[0].get("workersInvocationsAdaptive", []) if accounts else []

        for inv in invocations:
            dims = inv.get("dimensions", {})
            sums = inv.get("sum", {})
            status = dims.get("status", "unknown")
            log_level = "error" if status in ("clientError", "serverError") else "info"
            script = dims.get("scriptName", script_name or "worker")
            ts = dims.get("datetime", "")
            colo = dims.get("coloCode", "")

            duration_us = sums.get("wallTime", 0)
            duration_ms = round(duration_us / 1000, 1) if duration_us else 0
            resp_size = sums.get("responseBodySize", 0)
            subreqs = sums.get("subrequests", 0)
            err_count = sums.get("errors", 0)

            parts = [status]
            if colo:
                parts.append(f"· {colo}")
            if duration_ms:
                parts.append(f"· {duration_ms}ms")
            if resp_size:
                size_str = f"{resp_size} B" if resp_size < 1024 else f"{resp_size / 1024:.1f} KB"
                parts.append(f"· {size_str}")
            if subreqs:
                parts.append(f"· {subreqs} subreq{'s' if subreqs != 1 else ''}")
            if err_count:
                parts.append(f"· {err_count} error{'s' if err_count != 1 else ''}")

            entries.append(asdict(UnifiedLogEntry(
                timestamp=ts,
                level=log_level,
                message=f"[{script}] {' '.join(parts)}",
                source="invocation",
                metadata={
                    "scriptName": script, "status": status, "coloCode": colo,
                    "wallTimeMs": duration_ms, "responseBodySize": resp_size,
                },
            )))

    except Exception as e:
        print(f"[EdgeLogs] CF GraphQL error: {e}")
        return LogsResponse(logs=[], provider="cloudflare")

    next_cursor = str(offset + limit) if len(entries) >= limit else None
    return LogsResponse(logs=entries, next_cursor=next_cursor, provider="cloudflare")


# ── Provider: Supabase Edge Functions ─────────────────────────────────

async def _supabase_fetch_logs(
    creds: dict, function_slug: str, limit: int, cursor: str | None, level: str | None
) -> LogsResponse:
    """Fetch logs from Supabase via Analytics API (SQL on function_logs)."""
    access_token = creds.get("access_token", "")
    project_ref = creds.get("project_ref", "") or creds.get("_metadata", {}).get("project_ref", "")

    if not access_token or not project_ref:
        return LogsResponse(logs=[], provider="supabase")

    # Build SQL query for function_logs
    where_clauses = []
    if level:
        level_map = {"error": "error", "warn": "warning", "info": "info", "debug": "debug"}
        mapped = level_map.get(level, level)
        where_clauses.append(f"event_message LIKE '%[{mapped}]%'")

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    offset = int(cursor) if cursor and cursor.isdigit() else 0

    sql = (
        f"SELECT id, timestamp, event_message "
        f"FROM function_logs "
        f"{where_sql} "
        f"ORDER BY timestamp DESC "
        f"LIMIT {limit} OFFSET {offset}"
    )

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"https://api.supabase.com/v1/projects/{project_ref}/analytics/endpoints/logs.all",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"sql": sql},
        )
        if resp.status_code != 200:
            print(f"[EdgeLogs] Supabase logs failed: {resp.status_code} {resp.text[:200]}")
            return LogsResponse(logs=[], provider="supabase")

        data = resp.json()

    # Parse response — Supabase returns [{id, timestamp, event_message}, ...]
    rows = data if isinstance(data, list) else data.get("result", [])
    entries = []
    for row in rows:
        msg = row.get("event_message", "")
        # Try to detect level from message
        detected_level = "info"
        for lv in ("error", "warn", "debug"):
            if f"[{lv}]" in msg.lower():
                detected_level = lv
                break

        entries.append(asdict(UnifiedLogEntry(
            timestamp=row.get("timestamp", ""),
            level=detected_level,
            message=msg,
            source="runtime",
            metadata={"id": row.get("id", "")},
        )))

    # Cursor for next page
    next_cursor = str(offset + limit) if len(entries) >= limit else None

    return LogsResponse(logs=entries, next_cursor=next_cursor, provider="supabase")


# ── Retention Config ──────────────────────────────────────────────────

# Provider log retention periods (hours) by plan tier
RETENTION_HOURS: dict[str, dict[str, int]] = {
    "deno":       {"free": 24,   "paid": 168},    # 1 day / 7 days
    "cloudflare": {"free": 72,   "paid": 720},    # 3 days / 30 days
    "supabase":   {"free": 24,   "pro": 168, "team": 168, "enterprise": 720},  # 1 / 7 / 7 / 30 days
    "vercel":     {"free": 1,    "pro": 24,  "enterprise": 720},  # 1h / 1 day / 30 days
}


def get_retention_hours(provider_type: str, plan_tier: str) -> int:
    """Get log retention in hours for a provider + plan tier."""
    provider_map = RETENTION_HOURS.get(provider_type, {"free": 24})
    return provider_map.get(plan_tier, provider_map.get("free", 24))


# ── Provider: Vercel ──────────────────────────────────────────────────

async def _vercel_fetch_logs(
    creds: dict, project_name: str, limit: int, cursor: str | None, level: str | None
) -> LogsResponse:
    """Fetch deployment events from Vercel via GET /v3/deployments/{id}/events.

    Resolves the latest deployment for the project, then fetches events.
    Events have: {type: "stdout"|"stderr", created (epoch ms), text}
    """
    from ..services import vercel_deploy_api

    api_token = creds.get("api_token", "")
    team_id = creds.get("team_id")
    if not api_token:
        return LogsResponse(logs=[], provider="vercel")

    # Resolve project_id from project_name
    projects = await vercel_deploy_api.list_projects(api_token, team_id)
    project_id = None
    for p in projects:
        if p.get("name") == project_name:
            project_id = p.get("id")
            break
    if not project_id:
        return LogsResponse(logs=[], provider="vercel")

    # Get latest deployment(s)
    deps = await vercel_deploy_api.list_deployments(api_token, project_id, team_id, limit=3)
    if not deps:
        return LogsResponse(logs=[], provider="vercel")

    # Fetch events from the latest deployment
    dep_id = deps[0].get("uid", "")
    events = await vercel_deploy_api.get_deployment_events(api_token, dep_id, team_id)

    entries = []
    offset = int(cursor) if cursor and cursor.isdigit() else 0
    filtered = events[offset:offset + limit]

    for ev in filtered:
        ev_type = ev.get("type", "stdout")
        log_level = "error" if ev_type == "stderr" else "info"

        # Apply level filter
        if level and log_level != level:
            continue

        # Timestamp: created is epoch millis
        created_ms = ev.get("created", 0)
        ts = ""
        if created_ms:
            try:
                ts = datetime.fromtimestamp(created_ms / 1000, tz=timezone.utc).isoformat()
            except (OSError, ValueError):
                ts = str(created_ms)

        text = ev.get("text", "")
        if not text:
            # Some events have payload instead
            payload = ev.get("payload", {})
            if isinstance(payload, dict):
                text = payload.get("text", payload.get("message", str(payload)))
            else:
                text = str(payload)

        entries.append(asdict(UnifiedLogEntry(
            timestamp=ts,
            level=log_level,
            message=text,
            source="build" if ev.get("type") in ("stdout", "stderr") else "runtime",
            metadata={"deploymentId": dep_id, "eventType": ev_type},
        )))

    next_cursor = str(offset + limit) if len(filtered) >= limit else None
    return LogsResponse(logs=entries, next_cursor=next_cursor, provider="vercel")
