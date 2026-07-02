"""
Test authentication flows with comprehensive coverage.
"""
import pytest
from app.database.config import SessionLocal
from app.database.utils import create_user, get_user_by_username

def test_user_registration_success():
    """Test successful user registration."""
    db = SessionLocal()
    try:
        user = create_user(
            db,
            username="new_user",
            email="new@example.com",
            password_hash="secure_hash"
        )
        assert user.id is not None
        assert user.username == "new_user"
    finally:
        db.close()

def test_user_login_invalid_username():
    """Test login failure with non-existent username."""
    db = SessionLocal()
    try:
        user = get_user_by_username(db, "invalid_user")
        assert user is None
    finally:
        db.close()
