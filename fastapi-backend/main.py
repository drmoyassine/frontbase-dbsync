# gpu_model serialization update — force reload
# Load .env FIRST — before any app imports that may read env vars (e.g. FERNET_KEY)
from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from app.routers import pages, project, variables, database, rls, actions, auth_forms, auth, settings, storage, edge_providers, edge_engines, cloudflare, cloudflare_inspector, engine_inspector, edge_databases, edge_caches, edge_queues, edge_gpu, edge_api_keys, edge_agent_profiles, deno, themes, agent
from app.middleware.test_mode import TestModeMiddleware
from app.config.edition import is_cloud, DEPLOYMENT_MODE

logger = logging.getLogger(__name__)


def _ensure_local_edge():
    """Seed the Local Edge system records in dev / self-host mode.

    Creates three is_system=True records (idempotent):
      1. EdgeDatabase  → "Local SQLite"
      2. EdgeCache     → "Local Redis"
      3. EdgeEngine    → "Local Edge" (linked to 1 & 2)

    Skipped in cloud (multi-tenant) mode — the edge container still runs
    for build-time services, but won't appear in the UI or as a publish target.
    """
    # if is_cloud():
    #     return

    from datetime import datetime, timezone
    import uuid
    from app.database.config import SessionLocal
    from app.models.models import EdgeEngine, EdgeDatabase, EdgeCache, EdgeQueue

    edge_url = os.getenv("EDGE_URL", "http://localhost:3002")
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    db = SessionLocal()
    try:
        # --- 1. Local SQLite system database ---
        sys_db = db.query(EdgeDatabase).filter(EdgeDatabase.is_system == True).first()  # noqa: E712
        if not sys_db:
            sys_db = EdgeDatabase(
                id=str(uuid.uuid4()),
                name="Local SQLite",
                provider="sqlite",
                db_url="file:local.db",
                is_default=False,
                is_system=True,
                created_at=now,
                updated_at=now,
            )
            db.add(sys_db)
            db.flush()
            logger.info("[Startup] ✅ Local SQLite DB seeded")
        elif bool(sys_db.is_default):
            # Clear stale default on system resource
            sys_db.is_default = False  # type: ignore[assignment]
            logger.info("[Startup] Cleared is_default on system DB")

        # --- 2. Local Redis system cache ---
        sys_cache = db.query(EdgeCache).filter(EdgeCache.is_system == True).first()  # noqa: E712
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
        if not sys_cache:
            sys_cache = EdgeCache(
                id=str(uuid.uuid4()),
                name="Local Redis",
                provider="redis",
                cache_url=redis_url,
                is_default=False,
                is_system=True,
                created_at=now,
                updated_at=now,
            )
            db.add(sys_cache)
            db.flush()
            logger.info("[Startup] ✅ Local Redis cache seeded")
        else:
            if str(sys_cache.cache_url) == "redis://localhost:6379":
                sys_cache.cache_url = redis_url  # type: ignore[assignment]
                logger.info("[Startup] Patched sys_cache URL to external container reference")
            if bool(sys_cache.is_default):
                # Clear stale default on system resource
                sys_cache.is_default = False  # type: ignore[assignment]
                logger.info("[Startup] Cleared is_default on system cache")

        # --- 2.5 Local BullMQ system queue ---
        sys_queue = db.query(EdgeQueue).filter(EdgeQueue.is_system == True).first()  # noqa: E712
        if not sys_queue:
            sys_queue = EdgeQueue(
                id=str(uuid.uuid4()),
                name="Local BullMQ",
                provider="bullmq",
                queue_url=redis_url,
                is_default=False,
                is_system=True,
                created_at=now,
                updated_at=now,
            )
            db.add(sys_queue)
            db.flush()
            logger.info("[Startup] ✅ Local BullMQ queue seeded")
        else:
            if str(sys_queue.queue_url) == "redis://localhost:6379":
                sys_queue.queue_url = redis_url  # type: ignore[assignment]
                logger.info("[Startup] Patched sys_queue URL to external container reference")
            if bool(sys_queue.is_default):
                # Clear stale default on system resource
                sys_queue.is_default = False  # type: ignore[assignment]
                logger.info("[Startup] Cleared is_default on system queue")

        # --- 3. Local Edge system engine ---
        sys_engine = db.query(EdgeEngine).filter(EdgeEngine.is_system == True).first()  # noqa: E712
        if sys_engine:
            # Update URL and bindings if needed
            changed = False
            if str(sys_engine.url) != edge_url:
                sys_engine.url = edge_url  # type: ignore[assignment]
                changed = True
            if str(sys_engine.edge_db_id or "") != str(sys_db.id):
                sys_engine.edge_db_id = sys_db.id  # type: ignore[assignment]
                changed = True
            if str(sys_engine.edge_cache_id or "") != str(sys_cache.id):
                sys_engine.edge_cache_id = sys_cache.id  # type: ignore[assignment]
                changed = True
            if str(sys_engine.edge_queue_id or "") != str(sys_queue.id):
                sys_engine.edge_queue_id = sys_queue.id  # type: ignore[assignment]
                changed = True
            if changed:
                sys_engine.updated_at = now  # type: ignore[assignment]
                logger.info("[Startup] Local Edge bindings updated")
        else:
            sys_engine = EdgeEngine(
                id=str(uuid.uuid4()),
                name="Local Edge",
                edge_provider_id=None,
                adapter_type="full",
                url=edge_url,
                edge_db_id=sys_db.id,
                edge_cache_id=sys_cache.id,
                edge_queue_id=sys_queue.id,
                is_active=True,
                is_system=True,
                created_at=now,
                updated_at=now,
            )
            db.add(sys_engine)
            logger.info(f"[Startup] ✅ Local Edge seeded at {edge_url}")

        db.commit()
    finally:
        db.close()


def _backfill_engine_bindings():
    """Idempotent backfill to bind existing datasources and storage providers to existing engines.

    If an engine has no entries in `engine_datasources` or `engine_storages` (Phase 2 tables),
    bind it to all active datasources/storages belonging to the same project.

    Supports both cloud/multi-tenant (project-scoped) and self-host/single-tenant (project_id IS NULL) deployments.
    """
    from app.database.config import SessionLocal
    from app.models.edge import EdgeEngine, engine_datasources, engine_storages
    from app.services.sync.models.datasource import Datasource
    from app.models.storage_provider import StorageProvider
    import sqlalchemy as sa
    import sqlalchemy.exc

    db = SessionLocal()
    try:
        engines = db.query(EdgeEngine).all()
        for engine in engines:
            try:
                # Check if this engine already has any datasources bound
                ds_stmt = sa.select(engine_datasources.c.datasource_id).where(engine_datasources.c.engine_id == engine.id)
                existing_ds_ids = list(db.execute(ds_stmt).scalars().all())

                if not existing_ds_ids:
                    # Query all active datasources belonging to the same project (works with None for self-host)
                    datasources = db.query(Datasource).filter(
                        sa.and_(
                            Datasource.project_id == engine.project_id,
                            sa.or_(Datasource.is_active == True, Datasource.is_active == None)
                        )
                    ).all()
                    
                    bound_count = 0
                    for ds in datasources:
                        try:
                            # Use a nested transaction/savepoint to ignore duplicate inserts gracefully
                            with db.begin_nested():
                                db.execute(engine_datasources.insert().values(engine_id=engine.id, datasource_id=ds.id))
                            bound_count += 1
                        except sa.exc.IntegrityError:
                            pass
                    if bound_count > 0:
                        logger.info(f"[Startup] Bound {bound_count} existing datasources to engine '{engine.name}' ({engine.id})")

                # Check if this engine already has any storage providers bound
                store_stmt = sa.select(engine_storages.c.storage_id).where(engine_storages.c.engine_id == engine.id)
                existing_store_ids = list(db.execute(store_stmt).scalars().all())

                if not existing_store_ids:
                    # Query all active storage providers belonging to the same project (works with None for self-host)
                    storages = db.query(StorageProvider).filter(
                        sa.and_(
                            StorageProvider.project_id == engine.project_id,
                            sa.or_(StorageProvider.is_active == True, StorageProvider.is_active == None)
                        )
                    ).all()
                    
                    bound_count = 0
                    for sp in storages:
                        try:
                            with db.begin_nested():
                                db.execute(engine_storages.insert().values(engine_id=engine.id, storage_id=sp.id))
                            bound_count += 1
                        except sa.exc.IntegrityError:
                            pass
                    if bound_count > 0:
                        logger.info(f"[Startup] Bound {bound_count} existing storage providers to engine '{engine.name}' ({engine.id})")

                db.commit()
            except Exception as e:
                db.rollback()
                logger.warning(f"[Startup] Bindings backfill for engine '{engine.name}' failed: {e}")
    except Exception as e:
        logger.error(f"[Startup] Global engine bindings backfill task failed: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(fastapi_app: FastAPI):
    """Application lifespan handler - initializes ALL databases on startup."""
    import asyncio
    
    logger.info("[Main App Startup] Initializing databases...")
    
    # Initialize Sync Service database tables
    # This is critical because mounted sub-apps don't run their own lifespan events
    try:
        from app.services.sync.database import init_db as init_sync_db
        async with asyncio.timeout(30.0):
            await init_sync_db()
            logger.info("[Main App Startup] ✅ Sync DB tables initialized successfully")
    except asyncio.TimeoutError:
        logger.error("[Main App Startup] ❌ Sync DB init timed out after 30s")
    except Exception as e:
        logger.error(f"[Main App Startup] ❌ Sync DB init failed: {e}")

    # Initialize Main App database tables (Project, User, Page, etc.)
    # This is critical for fresh deployments
    try:
        from app.database.config import Base, engine
        # Verify models are imported to register them
        import app.models.models  # noqa
        
        logger.info("[Main App Startup] Initializing Core tables...")
        # Create tables synchronously (SQLite is fast/local)
        Base.metadata.create_all(bind=engine)
        logger.info("[Main App Startup] ✅ Core tables initialized successfully")
    except Exception as e:
        logger.error(f"[Main App Startup] ❌ Core DB init failed: {e}")

    # Run engine bindings backfill for existing deployed engines
    try:
        _backfill_engine_bindings()
        logger.info("[Main App Startup] ✅ Engine bindings backfill completed")
    except Exception as e:
        logger.warning(f"[Main App Startup] Engine bindings backfill failed (non-fatal): {e}")
    
    # Seed the Local Edge system engine (dev / self-host only)
    try:
        _ensure_local_edge()
    except Exception as e:
        logger.warning(f"[Main App Startup] Local Edge seed failed (non-fatal): {e}")

    # Seed Component Themes
    try:
        from app.services.seed_themes import seed_system_themes
        from app.database.config import SessionLocal
        db = SessionLocal()
        seed_system_themes(db)
        db.close()
    except Exception as e:
        logger.warning(f"[Main App Startup] Theme seed failed (non-fatal): {e}")

    # Seed default subscription plans (cloud only)
    if is_cloud():
        try:
            from app.services.plan_limits import seed_default_plans, prune_deprecated_plan_limits
            from app.database.config import SessionLocal
            db = SessionLocal()
            seed_default_plans(db)
            prune_deprecated_plan_limits(db)
            db.close()
        except Exception as e:
            logger.warning(f"[Main App Startup] Plan seed failed (non-fatal): {e}")

    # Multi-project: ensure schema columns + backfill default projects (cloud only)
    if is_cloud():
        try:
            from app.services.project_setup import ensure_multiproject_schema, backfill_default_projects
            from app.database.config import engine, SessionLocal
            ensure_multiproject_schema(engine)
            db = SessionLocal()
            backfill_default_projects(db)
            db.close()
        except Exception as e:
            logger.warning(f"[Main App Startup] Multi-project setup failed (non-fatal): {e}")

    # Load Redis settings for sync service
    try:
        from app.services.sync.redis_client import load_settings_from_db
        async with asyncio.timeout(5.0):
            await load_settings_from_db()
            logger.info("[Main App Startup] ✅ Redis settings loaded")
    except Exception as e:
        logger.warning(f"[Main App Startup] Redis settings load failed (non-fatal): {e}")
    
    logger.info(f"[Main App Startup] 🏷️ Mode: {DEPLOYMENT_MODE}")
    logger.info("[Main App Startup] 🚀 Application ready")
    yield
    logger.info("[Main App Shutdown] Shutting down...")


import ipaddress
import time
import re
from typing import Union, List
from fastapi import Request, Response
from fastapi.responses import JSONResponse

# --- L1/L2 IP Blocklist Cache ---
_L1_BLOCKLIST: List[Union[ipaddress.IPv4Network, ipaddress.IPv6Network]] = []
_L1_LAST_LOADED: float = 0.0
_L1_TTL: float = 10.0  # seconds
# Circuit breaker for an unreachable Redis: after a failure, skip Redis for this
# cooldown so a down/misconfigured Redis (common in local dev) doesn't cost a ~5s
# connect/DNS timeout on every blocklist refresh. The DB fallback still runs.
_REDIS_CIRCUIT_OPEN_UNTIL: float = 0.0
_REDIS_CIRCUIT_COOLDOWN: float = 300.0  # 5 minutes

async def load_blocklist_async() -> List[str]:
    """Asynchronously load the blocklist from Redis (L2) or DB (fallback) and compile it into L1."""
    global _L1_BLOCKLIST, _L1_LAST_LOADED, _REDIS_CIRCUIT_OPEN_UNTIL

    cache_get_fn = None
    cache_set_fn = None
    redis_url = None
    # Skip Redis entirely while the circuit is open (recent failure).
    if time.time() >= _REDIS_CIRCUIT_OPEN_UNTIL:
        try:
            from app.services.sync.redis_client import cache_get, cache_set, get_configured_redis_settings
            cache_get_fn = cache_get
            cache_set_fn = cache_set
            redis_settings = await get_configured_redis_settings()
            redis_url = redis_settings.get("url") if redis_settings and redis_settings.get("enabled") else None
        except Exception:
            pass

    redis_key = "security:ip_blocklist"
    ip_strings = None

    if redis_url and cache_get_fn:
        _redis_t0 = time.time()
        try:
            ip_strings = await cache_get_fn(redis_url, redis_key)
        except Exception as e:
            logger.warning(f"Failed to load blocklist from Redis: {e}")
            ip_strings = None
            _REDIS_CIRCUIT_OPEN_UNTIL = time.time() + _REDIS_CIRCUIT_COOLDOWN
        else:
            # cache_get swallows connection errors and returns None after its
            # internal 5s timeout, so an exception never surfaces. Detect an
            # unreachable Redis by elapsed time (a live Redis answers in ms) and
            # trip the circuit so we stop paying the timeout on every refresh.
            if time.time() - _redis_t0 > 2.0:
                _REDIS_CIRCUIT_OPEN_UNTIL = time.time() + _REDIS_CIRCUIT_COOLDOWN
            
    if ip_strings is None:
        # DB Fallback
        from app.database.config import SessionLocal
        from app.models.models import IPBlocklist
        db = SessionLocal()
        try:
            from datetime import datetime, timezone
            from app.routers.settings import load_settings
            settings_dict = load_settings()
            bot_settings = settings_dict.get("security", {}).get("bot_protection", {})
            lockout_hours = int(bot_settings.get("auto_ban_lockout_hours", 24))
            
            items = db.query(IPBlocklist).all()
            ip_strings = []
            now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
            dirty = False
            for item in items:
                is_temp_ban = False
                hours_limit = 24
                reason_str = str(item.reason) if item.reason is not None else ""
                ip_str = str(item.ip_or_range).strip()
                
                if reason_str == "Bot Protection Auto-Ban (Repeated Failures)":
                    is_temp_ban = True
                    hours_limit = lockout_hours
                elif reason_str == "WAF Auto-Ban (3 strikes)":
                    is_temp_ban = True
                    hours_limit = 24
                    
                if is_temp_ban:
                    try:
                        ts_str = str(item.created_at)
                        if ts_str.endswith("Z"):
                            ts_str = ts_str[:-1]
                        if "." in ts_str:
                            created_dt = datetime.fromisoformat(ts_str)
                        else:
                            created_dt = datetime.strptime(ts_str, "%Y-%m-%dT%H:%M:%S")
                            
                        elapsed = now_dt - created_dt
                        if elapsed.total_seconds() > (hours_limit * 3600):
                            logger.warning(f"[Security] Temporary IP ban on {ip_str} expired ({elapsed.total_seconds() / 3600:.1f}h elapsed). Pruning from DB.")
                            db.delete(item)
                            dirty = True
                            continue
                    except Exception as pe:
                        logger.error(f"[Security] Failed to parse created_at for IP {ip_str}: {pe}")
                        
                ip_strings.append(ip_str)
                
            if dirty:
                db.commit()
                
            # Skip the write-back if the GET already tripped the circuit this call.
            if redis_url and cache_set_fn and time.time() >= _REDIS_CIRCUIT_OPEN_UNTIL:
                _set_t0 = time.time()
                try:
                    await cache_set_fn(redis_url, redis_key, ip_strings, ttl=300)
                except Exception as e:
                    logger.warning(f"Failed to cache blocklist in Redis: {e}")
                    _REDIS_CIRCUIT_OPEN_UNTIL = time.time() + _REDIS_CIRCUIT_COOLDOWN
                else:
                    if time.time() - _set_t0 > 2.0:
                        _REDIS_CIRCUIT_OPEN_UNTIL = time.time() + _REDIS_CIRCUIT_COOLDOWN
        except Exception as e:
            logger.error(f"Failed to load blocklist from DB: {e}")
            ip_strings = []
        finally:
            db.close()
            
    # Compile into L1 network objects
    networks = []
    for ip_str in ip_strings:
        try:
            if '/' not in ip_str:
                network = ipaddress.ip_network(ip_str)
            else:
                network = ipaddress.ip_network(ip_str, strict=False)
            networks.append(network)
        except Exception as e:
            logger.warning(f"Failed to parse IP range '{ip_str}': {e}")
            
    _L1_BLOCKLIST = networks
    _L1_LAST_LOADED = time.time()
    return ip_strings

def invalidate_blocklist_cache():
    """Force local cache reload and invalidate Redis L2 cache."""
    global _L1_LAST_LOADED
    _L1_LAST_LOADED = 0.0
    try:
        import asyncio
        from app.services.sync.redis_client import cache_set, get_configured_redis_settings
        async def invalidate():
            redis_settings = await get_configured_redis_settings()
            redis_url = redis_settings.get("url") if redis_settings and redis_settings.get("enabled") else None
            if redis_url:
                await cache_set(redis_url, "security:ip_blocklist", None, ttl=1)
        asyncio.create_task(invalidate())
    except Exception:
        pass

# --- WAF Config Checker ---
def is_waf_enabled() -> bool:
    try:
        from app.routers.settings import load_settings
        settings_dict = load_settings()
        return settings_dict.get("security", {}).get("waf_enabled", False)
    except Exception:
        return False


# --- Smart Anomaly WAF Engine ---
import html
import urllib.parse
from typing import Dict, Any

def _waf_decode(payload: str) -> str:
    """Recursively decode URL encoding and HTML entities, clean comments, and normalize spaces."""
    if not payload:
        return ""
    
    # 1. URL decoding loop (up to 3 passes to prevent evasion via multi-encoding)
    current = payload
    for _ in range(3):
        decoded = urllib.parse.unquote(current)
        if decoded == current:
            break
        current = decoded
        
    # 2. HTML Entity decoding
    current = html.unescape(current)
    
    # 3. Strip SQL inline comments (e.g. SEL/**/ECT -> SELECT)
    # We replace comment patterns with spaces so keywords don't accidentally concatenate
    # e.g., UNION/*...*/SELECT -> UNION SELECT
    current = re.sub(r'/\*.*?\*/', ' ', current, flags=re.DOTALL)
    
    # Also strip SQL single-line comment markers -- and #
    current = re.sub(r'--.*$', ' ', current, flags=re.MULTILINE)
    current = re.sub(r'#.*$', ' ', current, flags=re.MULTILINE)
    
    # 4. Null-byte removal
    current = current.replace("\x00", "")
    
    # 5. Normalize multiple spaces / tabs / newlines into a single space
    current = re.sub(r'\s+', ' ', current).strip()
    
    return current


def _extract_string_values(data: Any) -> List[str]:
    """Recursively extract only string values from any JSON structure."""
    strings: List[str] = []
    if isinstance(data, dict):
        for val in data.values():
            strings.extend(_extract_string_values(val))
    elif isinstance(data, list):
        for val in data:
            strings.extend(_extract_string_values(val))
    elif isinstance(data, str):
        strings.append(data)
    return strings


WAF_RULES = [
    # (weight, compiled_regex, description)
    (5, re.compile(r"('\s*OR\s*'?\w+'?\s*=\s*'?\w+'?)|(true\s*=\s*true)", re.IGNORECASE), "SQLi tautology"),
    (5, re.compile(r"UNION\s+(ALL\s+)?SELECT", re.IGNORECASE), "SQLi union query"),
    (5, re.compile(r"<script\b[^>]*>", re.IGNORECASE), "XSS script tag"),
    (3, re.compile(r"SELECT\s+.*\s+FROM", re.IGNORECASE), "SQLi select query"),
    (3, re.compile(r"\b(DROP|ALTER|TRUNCATE)\s+TABLE\b", re.IGNORECASE), "SQL DDL query"),
    (3, re.compile(r"javascript:", re.IGNORECASE), "XSS javascript scheme"),
    (3, re.compile(r"<iframe\b[^>]*>", re.IGNORECASE), "XSS iframe tag"),
    (2, re.compile(r"\bon(error|load|click|mouseover)\s*=", re.IGNORECASE), "XSS event listener"),
    (1, re.compile(r"\b(INSERT|UPDATE|DELETE)\s+INTO?\b", re.IGNORECASE), "SQL DML keyword"),
]

WAF_BLOCK_THRESHOLD = 5

_WAF_STRIKES: Dict[str, List[float]] = {}
WAF_STRIKE_WINDOW = 600.0  # 10 minutes
WAF_MAX_STRIKES = 3

async def record_waf_strike(client_ip: str) -> bool:
    """Record a WAF block strike for an IP. Auto-ban if strikes exceed limit within window.
    Returns True if IP was banned, False otherwise.
    """
    now = time.time()
    strikes = _WAF_STRIKES.setdefault(client_ip, [])
    # Filter out strikes older than the window
    strikes = [t for t in strikes if now - t < WAF_STRIKE_WINDOW]
    strikes.append(now)
    _WAF_STRIKES[client_ip] = strikes
    
    if len(strikes) >= WAF_MAX_STRIKES:
        # Clear strikes for this IP
        _WAF_STRIKES[client_ip] = []
        try:
            from app.models.models import IPBlocklist
            from app.database.config import SessionLocal
            db = SessionLocal()
            try:
                # Check if already blocked in DB
                exists = db.query(IPBlocklist).filter(IPBlocklist.ip_or_range == client_ip).first()
                if not exists:
                    import uuid
                    from datetime import datetime
                    new_ban = IPBlocklist(
                        id=str(uuid.uuid4()),
                        ip_or_range=client_ip,
                        reason="WAF Auto-Ban (3 strikes)",
                        created_at=datetime.utcnow().isoformat() + "Z"
                    )
                    db.add(new_ban)
                    db.commit()
                    invalidate_blocklist_cache()
                    logger.warning(f"[Security] IP {client_ip} auto-banned after {WAF_MAX_STRIKES} WAF strikes.")
                    return True
            finally:
                db.close()
        except Exception as e:
            logger.error(f"[Security] Failed to auto-ban IP {client_ip}: {e}")
    return False


if is_cloud():
    from app.auth.supertokens import init_supertokens
    init_supertokens()

app = FastAPI(
    title="Frontbase-DBSync API",
    description="Unified API for Frontbase and DB-Sync functionality",
    version="1.0.0",
    lifespan=lifespan,
)

if is_cloud():
    from supertokens_python.framework.fastapi import get_middleware
    app.add_middleware(get_middleware())

# --- Register Advanced Security Middlewares ---

# 1. IP Blocklist Middleware (checks blocked ranges early)
@app.middleware("http")
async def ip_blocklist_middleware(request: Request, call_next):
    if request.url.path in ("/health", "/health/", "/"):
        return await call_next(request)

    client_ip = request.client.host if request.client else None
    if client_ip:
        global _L1_LAST_LOADED
        # Refresh at most once per 10s. An empty blocklist is the normal state
        # (no banned IPs), so it must NOT force a reload — otherwise every request
        # re-hits Redis, which adds a ~5s DNS timeout per request when Redis is
        # unavailable (e.g. local dev). Advance the timestamp before the attempt
        # so a failing load is also rate-limited rather than retried every request.
        if time.time() - _L1_LAST_LOADED > 10.0:
            _L1_LAST_LOADED = time.time()
            try:
                await load_blocklist_async()
            except Exception as e:
                logger.error(f"Error loading blocklist: {e}")
                
        is_blocked = False
        try:
            ip_obj = ipaddress.ip_address(client_ip)
            for network in _L1_BLOCKLIST:
                if ip_obj in network:
                    is_blocked = True
                    break
        except Exception:
            pass
            
        if is_blocked:
            logger.warning(f"Blocked connection from banned client IP: {client_ip}")
            return JSONResponse(status_code=403, content={"detail": "Forbidden: Access denied."})
            
    return await call_next(request)


# 2. Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-Content-Type-Options"] = "nosniff"
    if os.getenv("DEPLOYMENT_MODE") == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
    # Content Security Policy for non-API requests (HTML content)
    if not request.url.path.startswith("/api/"):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob: https:; "
            "font-src 'self' data: https:; "
            "connect-src 'self' https:; "
            "frame-ancestors 'self'"
        )
    return response


# 3. WAF Middleware (scans write payload requests)
@app.middleware("http")
async def waf_middleware(request: Request, call_next):
    if request.method in ("POST", "PUT", "DELETE"):
        if is_waf_enabled():
            client_ip = request.client.host if request.client else "unknown"
            
            # Check Admin Exemption first
            is_admin = False
            admin_user_id = None
            try:
                from app.routers.auth import get_session, SESSION_COOKIE_NAME
                token = request.cookies.get(SESSION_COOKIE_NAME)
                if token:
                    session = get_session(token)
                    if session:
                        is_admin = True
                        admin_user_id = session.get("user_id", "admin-1")
            except Exception:
                pass
                
            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type:
                body_bytes = await request.body()
                
                async def receive():
                    return {"type": "http.request", "body": body_bytes, "more_body": False}
                request._receive = receive
                
                try:
                    body_str = body_bytes.decode("utf-8")
                    
                    # 1. Parse JSON or fall back to raw string
                    import json
                    try:
                        body_data = json.loads(body_str)
                        string_values = _extract_string_values(body_data)
                    except Exception:
                        string_values = [body_str]
                        
                    # 2. Score strings
                    matched_rules = set()
                    for val in string_values:
                        cleaned = _waf_decode(val)
                        if not cleaned:
                            continue
                        for idx, (weight, regex, desc) in enumerate(WAF_RULES):
                            if idx not in matched_rules and regex.search(cleaned):
                                matched_rules.add(idx)
                                
                    total_score = sum(WAF_RULES[idx][0] for idx in matched_rules)
                    
                    # 3. If score triggers threshold
                    if total_score >= WAF_BLOCK_THRESHOLD:
                        triggered_descs = [WAF_RULES[idx][2] for idx in matched_rules]
                        details_str = f"Triggered Rules: {', '.join(triggered_descs)} (score={total_score})"
                        
                        if is_admin and admin_user_id:
                            # Log audit warnings for admin, but allow the request to proceed
                            logger.warning(f"WAF detected suspicious admin payload ({client_ip}): {details_str}. EXEMPTED.")
                            try:
                                from app.routers.auth import log_security_event
                                from app.database.config import SessionLocal
                                db = SessionLocal()
                                try:
                                    await log_security_event(
                                        db=db,
                                        user_id=admin_user_id,
                                        action="WAF_AUDIT_ADMIN",
                                        ip_address=client_ip,
                                        user_agent=request.headers.get("user-agent"),
                                        details=details_str
                                    )
                                finally:
                                    db.close()
                            except Exception as audit_err:
                                logger.error(f"Failed to log admin WAF event: {audit_err}")
                        else:
                            # Non-admin: BLOCK the request and log/record strike
                            logger.warning(f"WAF blocked suspicious request from {client_ip}: {request.method} {request.url.path} (score={total_score}, threshold={WAF_BLOCK_THRESHOLD})")
                            try:
                                from app.routers.auth import log_security_event
                                from app.database.config import SessionLocal
                                db = SessionLocal()
                                try:
                                    await log_security_event(
                                        db=db,
                                        user_id="anonymous",
                                        action="WAF_BLOCKED",
                                        ip_address=client_ip,
                                        user_agent=request.headers.get("user-agent"),
                                        details=details_str
                                    )
                                    # Record strike & check for auto-ban
                                    await record_waf_strike(client_ip)
                                finally:
                                    db.close()
                            except Exception as audit_err:
                                logger.error(f"Failed to log blocked WAF event: {audit_err}")
                                
                            return JSONResponse(
                                status_code=400,
                                content={"detail": "Request blocked by Web Application Firewall (WAF) due to suspicious patterns."}
                            )
                except Exception as e:
                    logger.error(f"WAF evaluation error: {e}")
                    
    return await call_next(request)


# Global exception handler — catch hidden 500s and log full tracebacks
from starlette.requests import Request as StarletteRequest
from starlette.responses import JSONResponse as StarletteJSONResponse
import traceback as _tb

@app.exception_handler(Exception)
async def global_exception_handler(request: StarletteRequest, exc: Exception):
    logger.error(f"[UNHANDLED] {request.method} {request.url.path}: {exc}")
    logger.error(_tb.format_exc())
    return StarletteJSONResponse(
        status_code=500,
        content={"detail": f"Internal error: {str(exc)}"},
    )

# Configure CORS for frontend integration
# Default to allowing everything if not specified (relative domain support)
cors_origins_str = os.getenv("CORS_ORIGINS", "*")
cors_origins = [origin.strip() for origin in cors_origins_str.split(",")]

# Note: allow_credentials=True cannot be used with allow_origins=["*"]
# For local development (Windows), we expand "*" to include explicit localhost origins
# We assume VPS/Production (Linux) manages origins explicitly or uses a proxy
import sys
is_windows = os.name == 'nt' or sys.platform == 'win32'

allow_all = "*" in cors_origins
if allow_all and is_windows:
    # Replace wildcard with specific origins to support credentials
    cors_origins = [
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative port
        "http://localhost:3001",  # Edge service
        "http://localhost:8000",  # FastAPI self
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:8000",
        "http://[::1]:5173",  # IPv6 localhost
        "http://[::1]:8000",
    ]
    allow_all = False  # Now we have explicit origins, can enable credentials

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TEMP: Allow all origins for debugging
    allow_credentials=False,  # Disabled with wildcard
    allow_methods=["*"],
    allow_headers=["*"],
)

# ProxyHeadersMiddleware: trust X-Forwarded-Proto from reverse proxy
# so FastAPI constructs redirects with https:// instead of http://
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])  # type: ignore[arg-type]


# Custom middleware to internally add trailing slash to paths
# This prevents 307 redirects by normalizing paths before routing
from starlette.types import ASGIApp, Receive, Scope, Send

class TrailingSlashMiddleware:
    """
    Middleware that adds trailing slash to paths internally.
    
    Prevents 307 redirect loops: the excluded routers define routes
    WITHOUT trailing slashes, so the middleware must not add one.
    Non-excluded routes get a trailing slash added to match their
    route definitions, preventing a 307 from FastAPI.
    
    Note: some excluded routes may still produce a single benign 307
    redirect (e.g., /api/edge-engines → /api/edge-engines/). This is
    harmless — the client follows it once.
    """
    EXCLUDE_PREFIXES = [
        "/health",
        "/api/test-route",
        "/api/auth",
        "/api/actions",
        "/api/storage",
        "/api/edge-engines",
        "/api/edge-providers",
        "/api/edge-caches",
        "/api/edge-databases",
        "/api/edge-queues",
        "/api/edge-gpu",
        "/api/edge-api-keys",
        "/api/cloudflare",
        "/api/deno",
        "/api/settings",
        "/api/agent",
        "/api/tenants",
        "/api/admin/tenants",
        "/api/admin/plans",
        "/api/admin/plan-requests",
    ]
    
    def __init__(self, app: ASGIApp):
        self.app = app
    
    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] == "http":
            path = scope["path"]
            should_skip = any(path.startswith(prefix) for prefix in self.EXCLUDE_PREFIXES)
            if not should_skip and not path.endswith("/") and "." not in path.split("/")[-1]:
                scope["path"] = path + "/"
        await self.app(scope, receive, send)

app.add_middleware(TrailingSlashMiddleware)

# Add test mode middleware
app.add_middleware(TestModeMiddleware, test_mode=True)

# Include routers — edition-aware registration
if is_cloud():
    try:
        from app.routers import tenants as tenants_router
        app.include_router(tenants_router.router, prefix="/api/tenants", tags=["Tenants"])
    except ImportError:
        pass  # Tenants router not yet available
    try:
        from app.routers import tenant_admin
        app.include_router(tenant_admin.router, prefix="/api/admin/tenants", tags=["Tenant Admin"])
    except ImportError:
        pass  # Tenant admin router not yet available
    try:
        from app.routers import admin_plans
        app.include_router(admin_plans.router, prefix="/api/admin", tags=["Admin Plans"])
    except ImportError:
        pass  # Admin plans router not yet available
    try:
        from app.routers import plans_public
        app.include_router(plans_public.router, prefix="/api/plans", tags=["Plans"])
    except ImportError:
        pass  # Public plans router not yet available
    try:
        from app.routers import projects
        app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
    except ImportError:
        pass  # Projects router not yet available
app.include_router(auth.router)  # Auth (login, logout, /me) — works for both modes
app.include_router(pages.router)
app.include_router(project.router)
app.include_router(variables.router)
app.include_router(database.router)
app.include_router(rls.router)
app.include_router(storage.router)
app.include_router(actions.router, prefix="/api/actions", tags=["Actions"])
app.include_router(auth_forms.router, prefix="/api/auth-forms", tags=["Auth Forms"])
app.include_router(settings.router)  # Privacy & Tracking settings
app.include_router(edge_providers.router)  # Edge provider accounts
app.include_router(edge_engines.router)  # Edge deployed engines
app.include_router(edge_databases.router)  # Edge database connections
app.include_router(edge_caches.router)  # Edge cache connections
app.include_router(edge_queues.router)  # Edge queue connections
app.include_router(cloudflare.router)  # One-click Cloudflare deploy
app.include_router(deno.router)  # Deno Deploy connect + domain mgmt
app.include_router(cloudflare_inspector.router)  # CF Worker inspector (legacy)
app.include_router(engine_inspector.router)  # Multi-provider engine inspector
app.include_router(edge_gpu.router)  # Edge GPU AI inference models
app.include_router(edge_api_keys.router)  # Tenant API keys for /v1/* endpoints
app.include_router(edge_agent_profiles.router)  # CRUD for Agent Personas & Permissions
app.include_router(themes.router, prefix="/api/themes", tags=["Themes"])
app.include_router(agent.router)  # Master Admin Workspace Agent chat

# Mount DB-Synchronizer Service
from app.services.sync.main import sync_app
app.mount("/api/sync", sync_app)

# Mount static assets directory for branding files (favicon, logo, etc.)
from fastapi.staticfiles import StaticFiles
from pathlib import Path
ASSETS_DIR = Path(__file__).parent / "static" / "assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

@app.get("/")
async def root():
    return {"message": "Frontbase-DBSync API is running", "test_mode": True}

@app.get("/health")
@app.get("/health/")
async def health_check():
    return {"status": "healthy", "message": "API is operational", "test_mode": True}

@app.get("/api/queue/health")
async def queue_health():
    from app.services.task_queue import celery_app
    i = celery_app.control.inspect()
    try:
        active = i.active() if i else None
        registered = i.registered() if i else None
        return {"status": "healthy", "active_workers": active is not None, "active": active, "registered": registered}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@app.get("/api/test-route")
async def test_route():
    return {"test": True}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, proxy_headers=True, forwarded_allow_ips="*")# trigger reload
# trigger reload 2
# trigger reload 3
# reload 4
# reload 5
# reload 6
# reload 8 - database migrated check
