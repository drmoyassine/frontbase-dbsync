"""
Settings API - Privacy & Tracking Configuration + Redis Cache

Manages global settings including visitor tracking configuration and Redis caching.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
import json
import os

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
async def get_redis_settings():
    """
    Get Redis cache settings.
    """
    settings = load_settings()
    redis = settings.get("redis", {})
    
    return RedisSettings(
        redis_url=redis.get("redis_url"),
        redis_token=redis.get("redis_token"),
        redis_type=redis.get("redis_type", "upstash"),
        redis_enabled=redis.get("redis_enabled", False),
        cache_ttl_data=redis.get("cache_ttl_data", 60),
        cache_ttl_count=redis.get("cache_ttl_count", 300),
    )


@router.put("/redis/", response_model=RedisSettings)
async def update_redis_settings(settings_update: RedisSettings):
    """
    Update Redis cache settings.
    """
    settings = load_settings()
    settings["redis"] = settings_update.dict()
    save_settings(settings)
    
    return settings_update


@router.post("/redis/test/", response_model=RedisTestResult)
async def test_redis_connection(settings_update: RedisSettings):
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


def ensure_data_dir():
    """Ensure the data directory exists"""
    data_dir = os.path.dirname(SETTINGS_FILE)
    if not os.path.exists(data_dir):
        os.makedirs(data_dir, exist_ok=True)


def load_settings() -> dict:
    """Load settings from file, with migration from legacy path"""
    try:
        # First try the new persisted path
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, "r") as f:
                return json.load(f)
        
        # Check legacy path and migrate if found
        if os.path.exists(LEGACY_SETTINGS_FILE):
            print(f"[Settings] Migrating settings from legacy path to persisted volume...")
            with open(LEGACY_SETTINGS_FILE, "r") as f:
                settings = json.load(f)
            # Save to new persisted path
            save_settings(settings)
            print(f"[Settings] Migration complete: {SETTINGS_FILE}")
            return settings
            
    except Exception as e:
        print(f"Error loading settings: {e}")
    return {}


def save_settings(settings: dict):
    """Save settings to file"""
    ensure_data_dir()
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(settings, f, indent=2)
    except Exception as e:
        print(f"Error saving settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {e}")


@router.get("/privacy/", response_model=PrivacySettings)
async def get_privacy_settings():
    """
    Get privacy and tracking settings.
    
    Returns configuration for visitor tracking cookies and advanced variables.
    """
    settings = load_settings()
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
async def update_privacy_settings(settings_update: PrivacySettings):
    """
    Update privacy and tracking settings.
    
    Configures visitor tracking behavior:
    - enableVisitorTracking: Enable/disable visitor tracking cookies
    - cookieExpiryDays: Number of days before tracking cookie expires
    - requireCookieConsent: Require user consent before setting tracking cookies
    """
    settings = load_settings()
    settings["privacy"] = settings_update.dict()
    save_settings(settings)
    
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
async def get_general_settings():
    """Get general site settings"""
    settings = load_settings()
    general = settings.get("general", {})
    
    return GeneralSettings(
        siteName=general.get("siteName"),
        siteUrl=general.get("siteUrl"),
        defaultLanguage=general.get("defaultLanguage", "en"),
        timezone=general.get("timezone", "UTC"),
    )


@router.put("/general", response_model=GeneralSettings)
async def update_general_settings(settings_update: GeneralSettings):
    """Update general site settings"""
    settings = load_settings()
    settings["general"] = settings_update.dict()
    save_settings(settings)
    
    return settings_update
