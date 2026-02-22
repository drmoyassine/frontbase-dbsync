"""
Router for project settings - Redis configuration, etc.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.sync.database import get_db
from app.services.sync.models.project_settings import ProjectSettings
from app.services.sync.redis_client import test_redis_connection

router = APIRouter()


class RedisSettingsUpdate(BaseModel):
    """Schema for updating Redis settings."""
    redis_url: Optional[str] = None
    redis_token: Optional[str] = None
    redis_type: str = "upstash"  # "upstash" | "self-hosted"
    redis_enabled: bool = False
    cache_ttl_data: int = 60
    cache_ttl_count: int = 300


class RedisSettingsResponse(BaseModel):
    """Schema for Redis settings response."""
    redis_url: Optional[str] = None
    redis_token: Optional[str] = None
    redis_type: str = "upstash"
    redis_enabled: bool = False
    cache_ttl_data: int = 60
    cache_ttl_count: int = 300
    
    class Config:
        from_attributes = True


class RedisTestResult(BaseModel):
    """Schema for Redis connection test result."""
    success: bool
    message: str


@router.get("/redis/", response_model=RedisSettingsResponse)
async def get_redis_settings():
    """Get current Redis settings — delegates to main app's settings.json."""
    import os
    try:
        from app.routers.settings import load_settings
        settings = load_settings()
        redis_cfg = settings.get("redis", {})
        
        saved_type = redis_cfg.get("redis_type")
        saved_url = redis_cfg.get("redis_url")
        saved_token = redis_cfg.get("redis_token")
        
        is_upstash = saved_type == "upstash" and saved_url and saved_token
        
        return RedisSettingsResponse(
            redis_url=saved_url if is_upstash else "http://redis-http:80",
            redis_token=saved_token if is_upstash else os.environ.get("REDIS_TOKEN"),
            redis_type="upstash" if is_upstash else "self-hosted",
            redis_enabled=redis_cfg.get("redis_enabled", False),
            cache_ttl_data=redis_cfg.get("cache_ttl_data", 60),
            cache_ttl_count=redis_cfg.get("cache_ttl_count", 300),
        )
    except Exception:
        return RedisSettingsResponse()


@router.put("/redis/", response_model=RedisSettingsResponse)
async def update_redis_settings(
    data: RedisSettingsUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update Redis settings."""
    result = await db.execute(select(ProjectSettings).limit(1))
    settings = result.scalar_one_or_none()
    
    if not settings:
        # Create new settings record
        settings = ProjectSettings(
            redis_url=data.redis_url,
            redis_token=data.redis_token,
            redis_type=data.redis_type,
            redis_enabled=data.redis_enabled,
            cache_ttl_data=data.cache_ttl_data,
            cache_ttl_count=data.cache_ttl_count,
        )
        db.add(settings)
    else:
        # Update existing
        settings.redis_url = data.redis_url
        settings.redis_token = data.redis_token
        settings.redis_type = data.redis_type
        settings.redis_enabled = data.redis_enabled
        settings.cache_ttl_data = data.cache_ttl_data
        settings.cache_ttl_count = data.cache_ttl_count
    
    await db.commit()
    await db.refresh(settings)
    
    # Invalidate cache so next fetch gets new settings
    from app.services.sync.redis_client import invalidate_settings_cache
    invalidate_settings_cache()
    
    return RedisSettingsResponse(
        redis_url=settings.redis_url,
        redis_token=settings.redis_token,
        redis_type=settings.redis_type,
        redis_enabled=settings.redis_enabled,
        cache_ttl_data=settings.cache_ttl_data,
        cache_ttl_count=settings.cache_ttl_count,
    )


@router.post("/redis/test/", response_model=RedisTestResult)
async def test_redis(data: RedisSettingsUpdate):
    """Test Redis connection with provided URL and token."""
    success, message = await test_redis_connection(
        redis_url=data.redis_url,
        redis_token=data.redis_token,
        redis_type=data.redis_type
    )
    return RedisTestResult(success=success, message=message)
