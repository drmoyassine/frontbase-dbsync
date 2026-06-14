"""
Settings API - Privacy & Tracking Configuration + Redis Cache

Manages global settings including visitor tracking configuration and Redis caching.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Literal
import json
import os

from app.config.edition import is_cloud
from app.middleware.tenant_context import TenantContext, get_tenant_context

router = APIRouter(prefix="/api/settings", tags=["settings"])


# =============================================================================
# Redis Cache Settings
# =============================================================================

class RedisSettings(BaseModel):
    redis_url: Optional[str] = None
    redis_token: Optional[str] = None
    redis_type: Literal["upstash", "self-hosted"] = "upstash"
    redis_enabled: bool = False
    cache_ttl_data: int = 60
    cache_ttl_count: int = 300


class RedisTestResult(BaseModel):
    success: bool
    message: str


@router.get("/redis/", response_model=RedisSettings)
async def get_redis_settings(ctx: TenantContext | None = Depends(get_tenant_context)):
    """
    Get Redis cache settings.
    
    Returns the explicitly configured Upstash instance from UI if present.
    Otherwise, returns the fallback local Redis configuration (powered by env vars).
    """
    tenant_slug = ctx.tenant_slug if ctx else None
    settings = load_settings(tenant_slug)
    redis_settings = settings.get("redis", {})
    
    # 1. Did the user explicitly configure and save an Upstash instance via the UI?
    saved_type = redis_settings.get("redis_type")
    saved_url = redis_settings.get("redis_url")
    saved_token = redis_settings.get("redis_token")
    
    is_upstash_configured = saved_type == "upstash" and saved_url and saved_token
    
    if is_upstash_configured:
        # Return explicitly configured Upstash
        final_url = saved_url
        final_token = saved_token
        effective_type = "upstash"
    else:
        # 2. Fall back to Local Redis (Docker/Env Vars)
        # We ignore any saved URL/Token from old configs if it wasn't Upstash
        final_url = "http://redis-http:80"
        final_token = os.environ.get("REDIS_TOKEN")
        effective_type = "self-hosted"
    
    return RedisSettings(
        redis_url=final_url,
        redis_token=final_token,
        redis_type=effective_type,
        redis_enabled=redis_settings.get("redis_enabled", False),
        cache_ttl_data=redis_settings.get("cache_ttl_data", 60),
        cache_ttl_count=redis_settings.get("cache_ttl_count", 300),
    )


@router.put("/redis/", response_model=RedisSettings)
async def update_redis_settings(settings_update: RedisSettings, ctx: TenantContext | None = Depends(get_tenant_context)):
    """
    Update Redis cache settings.
    """
    tenant_slug = ctx.tenant_slug if ctx else None
    settings = load_settings(tenant_slug)
    settings["redis"] = settings_update.dict()
    save_settings(settings, tenant_slug)
    
    return settings_update


@router.post("/redis/test/", response_model=RedisTestResult)
async def test_redis_connection(
    settings_update: RedisSettings,
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """
    Test Redis connection with provided settings.
    """
    if not settings_update.redis_url or not settings_update.redis_token:
        return RedisTestResult(success=False, message="URL and Token are required")
    
    try:
        import httpx
        
        # Test connection using Upstash REST API format
        async with httpx.AsyncClient() as client:
            response = await client.post(
                settings_update.redis_url,
                headers={
                    "Authorization": f"Bearer {settings_update.redis_token}",
                    "Content-Type": "application/json",
                },
                json=["PING"],
                timeout=10.0,
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("result") == "PONG":
                    return RedisTestResult(success=True, message="Connection successful!")
                else:
                    return RedisTestResult(success=True, message=f"Connected: {data}")
            else:
                return RedisTestResult(success=False, message=f"HTTP {response.status_code}: {response.text}")
    except Exception as e:
        return RedisTestResult(success=False, message=str(e))






# =============================================================================
# Privacy & Tracking Settings
# =============================================================================

class AdvancedVariableConfig(BaseModel):
    collect: bool = True
    expose: bool = True


# Configurable advanced visitor variables (separate from basic always-on variables)
class AdvancedVariables(BaseModel):
    ip: AdvancedVariableConfig = AdvancedVariableConfig(collect=False, expose=False)
    browser: AdvancedVariableConfig = AdvancedVariableConfig()
    os: AdvancedVariableConfig = AdvancedVariableConfig()
    language: AdvancedVariableConfig = AdvancedVariableConfig()
    viewport: AdvancedVariableConfig = AdvancedVariableConfig()
    themePreference: AdvancedVariableConfig = AdvancedVariableConfig()
    connectionType: AdvancedVariableConfig = AdvancedVariableConfig(collect=True, expose=False)
    referrer: AdvancedVariableConfig = AdvancedVariableConfig()
    isBot: AdvancedVariableConfig = AdvancedVariableConfig()


# Cookie-based visitor variables (require enableVisitorTracking)
class CookieVariables(BaseModel):
    isFirstVisit: AdvancedVariableConfig = AdvancedVariableConfig()
    visitCount: AdvancedVariableConfig = AdvancedVariableConfig()
    firstVisitAt: AdvancedVariableConfig = AdvancedVariableConfig()
    landingPage: AdvancedVariableConfig = AdvancedVariableConfig()


class PrivacySettings(BaseModel):
    enableVisitorTracking: bool = False
    cookieExpiryDays: int = 365
    requireCookieConsent: bool = True
    advancedVariables: AdvancedVariables = AdvancedVariables()
    cookieVariables: CookieVariables = CookieVariables()


# File-based settings storage
# IMPORTANT: Use Docker-persisted volume path (/app/data) NOT ephemeral container path
# This ensures settings persist across container rebuilds/deployments
SETTINGS_FILE = "/app/data/settings.json"
# Legacy path for backwards compatibility (ephemeral, will be migrated)
LEGACY_SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "settings.json")


def ensure_data_dir(file_path: str):
    """Ensure the data directory exists"""
    data_dir = os.path.dirname(file_path)
    if not os.path.exists(data_dir):
        os.makedirs(data_dir, exist_ok=True)


def get_settings_file_path(tenant_slug: Optional[str] = None) -> str:
    if is_cloud() and tenant_slug and tenant_slug != "_default":
        return f"/app/data/settings_{tenant_slug}.json"
    return SETTINGS_FILE


# In-process cache: file_path -> (mtime, data). Keyed on the file's mtime so it
# auto-invalidates whenever the file changes (save_settings rewrites it). Avoids a
# disk read on every call — load_settings runs on every mutation via is_waf_enabled().
_SETTINGS_CACHE: dict[str, tuple[float, dict]] = {}


def load_settings(tenant_slug: Optional[str] = None) -> dict:
    """Load settings from file, with migration from legacy path"""
    file_path = get_settings_file_path(tenant_slug)
    try:
        # First try the new persisted path
        if os.path.exists(file_path):
            mtime = os.path.getmtime(file_path)
            cached = _SETTINGS_CACHE.get(file_path)
            if cached is not None and cached[0] == mtime:
                # Return a copy so callers can't mutate the cached dict
                return json.loads(json.dumps(cached[1]))
            with open(file_path, "r") as f:
                data = json.load(f)
            _SETTINGS_CACHE[file_path] = (mtime, data)
            return json.loads(json.dumps(data))

        # Check legacy path and migrate if found (only for default settings)
        if file_path == SETTINGS_FILE and os.path.exists(LEGACY_SETTINGS_FILE):
            print(f"[Settings] Migrating settings from legacy path to persisted volume...")
            with open(LEGACY_SETTINGS_FILE, "r") as f:
                settings = json.load(f)
            # Save to new persisted path
            save_settings(settings, tenant_slug)
            print(f"[Settings] Migration complete: {file_path}")
            return settings
            
    except Exception as e:
        print(f"Error loading settings: {e}")
    return {}


def save_settings(settings: dict, tenant_slug: Optional[str] = None):
    """Save settings to file"""
    file_path = get_settings_file_path(tenant_slug)
    ensure_data_dir(file_path)
    try:
        with open(file_path, "w") as f:
            json.dump(settings, f, indent=2)
        # Evict so the next load_settings re-reads the fresh file
        _SETTINGS_CACHE.pop(file_path, None)
    except Exception as e:
        print(f"Error saving settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {e}")


@router.get("/privacy/", response_model=PrivacySettings)
async def get_privacy_settings(ctx: TenantContext | None = Depends(get_tenant_context)):
    """
    Get privacy and tracking settings.
    
    Returns configuration for visitor tracking cookies and advanced variables.
    """
    tenant_slug = ctx.tenant_slug if ctx else None
    settings = load_settings(tenant_slug)
    privacy = settings.get("privacy", {})
    
    # Parse advancedVariables with defaults
    adv_raw = privacy.get("advancedVariables", {})
    advanced = AdvancedVariables(
        ip=AdvancedVariableConfig(**adv_raw.get("ip", {"collect": False, "expose": False})),
        browser=AdvancedVariableConfig(**adv_raw.get("browser", {})),
        os=AdvancedVariableConfig(**adv_raw.get("os", {})),
        language=AdvancedVariableConfig(**adv_raw.get("language", {})),
        viewport=AdvancedVariableConfig(**adv_raw.get("viewport", {})),
        themePreference=AdvancedVariableConfig(**adv_raw.get("themePreference", {})),
        connectionType=AdvancedVariableConfig(**adv_raw.get("connectionType", {"collect": True, "expose": False})),
        referrer=AdvancedVariableConfig(**adv_raw.get("referrer", {})),
        isBot=AdvancedVariableConfig(**adv_raw.get("isBot", {})),
    )
    
    # Parse cookieVariables with defaults
    cookie_raw = privacy.get("cookieVariables", {})
    cookies = CookieVariables(
        isFirstVisit=AdvancedVariableConfig(**cookie_raw.get("isFirstVisit", {})),
        visitCount=AdvancedVariableConfig(**cookie_raw.get("visitCount", {})),
        firstVisitAt=AdvancedVariableConfig(**cookie_raw.get("firstVisitAt", {})),
        landingPage=AdvancedVariableConfig(**cookie_raw.get("landingPage", {})),
    )
    
    return PrivacySettings(
        enableVisitorTracking=privacy.get("enableVisitorTracking", False),
        cookieExpiryDays=privacy.get("cookieExpiryDays", 365),
        requireCookieConsent=privacy.get("requireCookieConsent", True),
        advancedVariables=advanced,
        cookieVariables=cookies,
    )


@router.put("/privacy/", response_model=PrivacySettings)
async def update_privacy_settings(settings_update: PrivacySettings, ctx: TenantContext | None = Depends(get_tenant_context)):
    """
    Update privacy and tracking settings.
    
    Configures visitor tracking behavior:
    - enableVisitorTracking: Enable/disable visitor tracking cookies
    - cookieExpiryDays: Number of days before tracking cookie expires
    - requireCookieConsent: Require user consent before setting tracking cookies
    """
    tenant_slug = ctx.tenant_slug if ctx else None
    settings = load_settings(tenant_slug)
    settings["privacy"] = settings_update.dict()
    save_settings(settings, tenant_slug)
    
    return settings_update


# =============================================================================
# General Settings (for future use)
# =============================================================================

class GeneralSettings(BaseModel):
    siteName: Optional[str] = None
    siteUrl: Optional[str] = None
    defaultLanguage: str = "en"
    timezone: str = "UTC"


@router.get("/general", response_model=GeneralSettings)
async def get_general_settings(ctx: TenantContext | None = Depends(get_tenant_context)):
    """Get general site settings"""
    tenant_slug = ctx.tenant_slug if ctx else None
    settings = load_settings(tenant_slug)
    general = settings.get("general", {})
    
    return GeneralSettings(
        siteName=general.get("siteName"),
        siteUrl=general.get("siteUrl"),
        defaultLanguage=general.get("defaultLanguage", "en"),
        timezone=general.get("timezone", "UTC"),
    )


@router.put("/general", response_model=GeneralSettings)
async def update_general_settings(settings_update: GeneralSettings, ctx: TenantContext | None = Depends(get_tenant_context)):
    """Update general site settings"""
    tenant_slug = ctx.tenant_slug if ctx else None
    settings = load_settings(tenant_slug)
    settings["general"] = settings_update.dict()
    save_settings(settings, tenant_slug)
    
    return settings_update


# =============================================================================
# Telemetry (SaaS Architecture)
# =============================================================================

class TelemetryData(BaseModel):
    install_id: str
    edition: str
    tier: Optional[str] = None
    page_count: int
    automation_count: int
    data_sources: list[str]
    storage_providers: list[str]
    email_providers: list[str]

@router.post("/telemetry")
async def collect_telemetry(data: TelemetryData):
    """
    Collects anonymized telemetry from self-hosted editions.
    Currently mocked to just log locally.
    """
    print(f"[Telemetry] Received stats for install {data.install_id} ({data.edition}): {data.page_count} pages, {data.automation_count} automations")
    return {"success": True, "message": "Telemetry received"}


# =============================================================================
# License Keys (SaaS Architecture)
# =============================================================================

class LicenseValidationRequest(BaseModel):
    license_key: str
    install_id: str
    
class LicenseValidationResponse(BaseModel):
    valid: bool
    tier: str
    features: list[str]
    message: str

@router.post("/validate-license", response_model=LicenseValidationResponse)
async def validate_license(data: LicenseValidationRequest):
    """
    Validates a license key for Enterprise or Community Free upgrades.
    Currently mocked to accept any key starting with 'fb_'.
    """
    is_valid = data.license_key.startswith("fb_")
    
    if is_valid:
        return LicenseValidationResponse(
            valid=True,
            tier="enterprise",
            features=["supabase", "custom_domains", "telemetry_enabled"],
            message="License activated"
        )
    else:
        return LicenseValidationResponse(
            valid=False,
            tier="community",
            features=[],
            message="Invalid license key"
        )


# =============================================================================
# Admin Invites (SaaS Architecture)
# =============================================================================

class AdminInviteRequest(BaseModel):
    email: str
    role: Literal["admin", "member"] = "admin"

class AdminInviteResponse(BaseModel):
    success: bool
    message: str

@router.post("/invites", response_model=AdminInviteResponse)
async def send_admin_invite(request: AdminInviteRequest):
    """Send an invitation email to a new admin."""
    # In a real implementation:
    # 1. Generate invitation token
    # 2. Store in DB
    # 3. Send email via configured provider
    
    from .auth import ADMIN_USERS, hash_password
    import secrets
    from datetime import datetime
    
    # Check if already exists
    if request.email in ADMIN_USERS:
        return AdminInviteResponse(success=False, message="User already exists")
    
    # Mock creating the user immediately with a random password 
    # (Since there is no /register or set-password flow yet)
    user_id = f"admin-{secrets.token_hex(4)}"
    random_pass = secrets.token_urlsafe(12)
    now = datetime.utcnow().isoformat() + "Z"
    
    ADMIN_USERS[request.email] = {
        "id": user_id,
        "email": request.email,
        "password_hash": hash_password(random_pass),
        "created_at": now,
        "updated_at": now,
    }
    
    # Send invite email via email_service
    from app.services.email_service import send_email
    
    subject = "You have been invited to join Frontbase"
    html = f"""
    <p>Hello,</p>
    <p>You have been invited to join Frontbase as an <strong>{request.role}</strong>.</p>
    <p>Your temporary password is: <code>{random_pass}</code></p>
    <p>Please log in and change your password immediately.</p>
    """
    
    email_result = await send_email(
        to=request.email,
        subject=subject,
        html=html
    )
    if not email_result.success:
        print(f"[Email Provider] Failed to send invite email to {request.email}: {email_result.error}")
    else:
        print(f"[Email Provider] Invite email sent to {request.email} (Message ID: {email_result.message_id})")
    
    return AdminInviteResponse(success=True, message=f"Invitation sent to {request.email}")
