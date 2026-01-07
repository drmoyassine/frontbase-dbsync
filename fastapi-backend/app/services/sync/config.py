"""
Application configuration using pydantic-settings
"""

import os
from typing import List, Any, Union
from pydantic import field_validator, AnyHttpUrl
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database - Use DATABASE_URL env var with async driver
    # Default matches main app's default but with async driver for the sync service
    database_url: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./unified.db")
    
    # Security
    secret_key: str = "dev-secret-key-change-in-production"
    
    # CORS
    # Accept str or List[str] to prevent initial validation error before validator runs
    cors_origins: Union[str, List[str]] = ["http://localhost:5173", "http://localhost:3000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> Any:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8001
    debug: bool = False
    
    # Redis (for Celery and Caching)
    redis_url: str = "redis://localhost:6379/0"
    sync_state_ttl: int = 14400  # Default 4 hours
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
