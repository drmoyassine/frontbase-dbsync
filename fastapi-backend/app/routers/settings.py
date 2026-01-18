"""
Settings API - Privacy & Tracking Configuration

Manages global settings including visitor tracking configuration.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
import os

router = APIRouter(prefix="/api/settings", tags=["settings"])


# =============================================================================
# Privacy & Tracking Settings
# =============================================================================

class PrivacySettings(BaseModel):
    enableVisitorTracking: bool = False
    cookieExpiryDays: int = 365
    requireCookieConsent: bool = True


# File-based settings storage (simple MVP approach)
# In production, this would be stored in the database (fb_settings table)
SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "settings.json")


def ensure_data_dir():
    """Ensure the data directory exists"""
    data_dir = os.path.dirname(SETTINGS_FILE)
    if not os.path.exists(data_dir):
        os.makedirs(data_dir, exist_ok=True)


def load_settings() -> dict:
    """Load settings from file"""
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, "r") as f:
                return json.load(f)
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


@router.get("/privacy", response_model=PrivacySettings)
async def get_privacy_settings():
    """
    Get privacy and tracking settings.
    
    Returns configuration for visitor tracking cookies.
    """
    settings = load_settings()
    privacy = settings.get("privacy", {})
    
    return PrivacySettings(
        enableVisitorTracking=privacy.get("enableVisitorTracking", False),
        cookieExpiryDays=privacy.get("cookieExpiryDays", 365),
        requireCookieConsent=privacy.get("requireCookieConsent", True),
    )


@router.put("/privacy", response_model=PrivacySettings)
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
