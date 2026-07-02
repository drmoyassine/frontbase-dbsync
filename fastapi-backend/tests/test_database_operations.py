"""
Test database operations with proper error handling and coverage.
"""
import pytest
from app.database.config import SessionLocal
from app.database.utils import create_user, get_user_by_username, get_user_by_email

def test_create_user_success():
    """Test successful user creation."""
    db = SessionLocal()
    try:
        user = create_user(
            db,
            username="testuser",
            email="test@example.com", 
            password_hash="hashed_password"
        )
        assert user.id is not None
        assert user.username == "testuser"
    finally:
        db.close()

def test_get_user_by_username_not_found():
    """Test retrieving user by non-existent username."""
    db = SessionLocal()
    try:
        user = get_user_by_username(db, "nonexistent_user")
        assert user is None
    finally:
        db.close()
