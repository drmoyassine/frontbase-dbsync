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
async def get_redis_settings(db: AsyncSession = Depends(get_db)):
    """Get current Redis settings."""
    result = await db.execute(select(ProjectSettings).limit(1))
    settings = result.scalar_one_or_none()
    
    if not settings:
        # Return defaults
        return RedisSettingsResponse()
    
    return RedisSettingsResponse(
        redis_url=settings.redis_url,
        redis_token=settings.redis_token,
        redis_type=settings.redis_type,
        redis_enabled=settings.redis_enabled,
        cache_ttl_data=settings.cache_ttl_data,
        cache_ttl_count=settings.cache_ttl_count,
    )


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
