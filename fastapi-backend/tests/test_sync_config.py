import os
import sys
import importlib
from unittest import mock

# Ensure app package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

def get_real_settings():
    """Bypass conftest.py sys.modules mocking to test the real config module."""
    # Since app.services.sync is a MockModule, we cannot use standard import
    from importlib.machinery import SourceFileLoader
    config_path = os.path.join(os.path.dirname(__file__), "..", "app", "services", "sync", "config.py")
    real_config = SourceFileLoader("app.services.sync.config", config_path).load_module()
    return real_config.Settings

def test_sync_db_url_empty_fallback():
    # If docker-compose passes "", the validator should ignore it
    # and use the default SQLite path (assuming DATABASE environment var isn't "postgresql")
    with mock.patch.dict(os.environ, {"DATABASE_URL": "", "DATABASE": "sqlite"}, clear=True):
        Settings = get_real_settings()
        settings = Settings()
        assert "sqlite+aiosqlite" in settings.database_url
        assert "frontbase.db" in settings.database_url

def test_sync_db_url_postgres_translation():
    # Test strict postgres:// -> postgresql:// transformation AND asyncpg injection
    test_cases = [
        ("postgres://user:pass@localhost/db", "postgresql+asyncpg://user:pass@localhost/db"),
        ("postgresql://user:pass@localhost/db", "postgresql+asyncpg://user:pass@localhost/db"),
        ("postgresql+asyncpg://user:pass@localhost/db", "postgresql+asyncpg://user:pass@localhost/db"),
    ]

    for input_url, expected_url in test_cases:
        with mock.patch.dict(os.environ, {"DATABASE_URL": input_url}, clear=True):
            Settings = get_real_settings()
            settings = Settings()
            assert settings.database_url == expected_url
