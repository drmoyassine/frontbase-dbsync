import os
import sys
import logging
from passlib.context import CryptContext

# Set up basic logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# Must set this env var if it's not set so config.py doesn't crash or connect to wrong DB
os.environ.setdefault("DATABASE", os.getenv("DATABASE", "sqlite"))

try:
    from app.database.config import SessionLocal, engine, Base
    from app.models.models import User
except ImportError as e:
    logger.error(f"Failed to import from app: {e}. Make sure you are running this from the fastapi-backend directory.")
    sys.exit(1)

def hash_password(password: str) -> str:
    pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
    return pwd_context.hash(password)

def main():
    admin_email = os.getenv("ADMIN_EMAIL", "").strip()
    admin_password = os.getenv("ADMIN_PASSWORD", "").strip()

    if not admin_email or not admin_password:
        logger.warning("ADMIN_EMAIL or ADMIN_PASSWORD environment variables are not set. Skipping master admin upsert.")
        sys.exit(0)  # Exit cleanly so the container can still start

    logger.info(f"Upserting master admin: {admin_email}")

    # Ensure tables exist (specifically useful if running standalone on a fresh DB)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Check if the default-admin row already exists
        admin_user = db.query(User).filter(User.id == "default-admin").first()
        
        hashed_pw = hash_password(admin_password)

        if admin_user:
            logger.info("Admin user 'default-admin' exists, updating email and password...")
            admin_user.email = admin_email  # type: ignore[assignment]
            admin_user.username = "admin"  # type: ignore[assignment]
            admin_user.password_hash = hashed_pw  # type: ignore[assignment]
            admin_user.is_active = True  # type: ignore[assignment]
        else:
            logger.info("Admin user 'default-admin' not found, creating...")
            admin_user = User(
                id="default-admin",
                username="admin",
                email=admin_email,
                password_hash=hashed_pw,
                is_active=True
            )
            db.add(admin_user)
        
        db.commit()
        logger.info("✅ Master admin upserted successfully.")

    except Exception as e:
        logger.error(f"❌ Failed to upsert master admin: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()

if __name__ == '__main__':
    main()
