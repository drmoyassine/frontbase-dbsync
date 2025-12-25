#!/usr/bin/env python3

"""
Database initialization script for FastAPI backend
"""

from app.database.config import engine
from app.models.models import Base
import sys

def init_database():
    """Initialize the database with all tables"""
    try:
        # Create all tables defined in the models
        Base.metadata.create_all(bind=engine)
        print("Database initialized successfully!")
        return True
    except Exception as e:
        print(f"Error initializing database: {e}")
        return False

if __name__ == "__main__":
    success = init_database()
    sys.exit(0 if success else 1)