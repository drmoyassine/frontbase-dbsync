from sqlalchemy.orm import Session
from sqlalchemy import text
from ..models.models import User, Page, Project, AppVariable
from .config import SessionLocal
import uuid
from datetime import datetime
import json
import os
from cryptography.fernet import Fernet

def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def generate_uuid():
    """Generate a UUID string"""
    return str(uuid.uuid4())

def get_current_timestamp():
    """Get current timestamp as ISO string"""
    return datetime.now().isoformat()

def create_user(db: Session, username: str, email: str, password_hash: str):
    """Create a new user"""
    user = User(
        id=generate_uuid(),
        username=username,
        email=email,
        password_hash=password_hash,
        created_at=get_current_timestamp(),
        updated_at=get_current_timestamp()
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def get_user_by_username(db: Session, username: str):
    """Get user by username"""
    return db.query(User).filter(User.username == username).first()

def get_user_by_email(db: Session, email: str):
    """Get user by email"""
    return db.query(User).filter(User.email == email).first()

def create_page(db: Session, page_data: dict):
    """Create a new page"""
    page = Page(
        id=generate_uuid(),
        name=page_data['name'],
        slug=page_data['slug'],
        title=page_data.get('title'),
        description=page_data.get('description'),
        keywords=page_data.get('keywords'),
        is_public=page_data.get('is_public', False),
        is_homepage=page_data.get('is_homepage', False),
        layout_data=json.dumps(page_data['layout_data']),
        seo_data=json.dumps(page_data.get('seo_data', {})),
        created_at=get_current_timestamp(),
        updated_at=get_current_timestamp()
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return page

def get_page_by_slug(db: Session, slug: str):
    """Get page by slug"""
    return db.query(Page).filter(Page.slug == slug, Page.deleted_at == None).first()

def get_all_pages(db: Session):
    """Get all pages"""
    return db.query(Page).filter(Page.deleted_at == None).all()

def update_page(db: Session, page_id: str, page_data: dict):
    """Update a page"""
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        return None
    
    # Update fields
    if 'name' in page_data:
        page.name = page_data['name']
    if 'slug' in page_data:
        page.slug = page_data['slug']
    if 'title' in page_data:
        page.title = page_data['title']
    if 'description' in page_data:
        page.description = page_data['description']
    if 'keywords' in page_data:
        page.keywords = page_data['keywords']
    if 'is_public' in page_data:
        page.is_public = page_data['is_public']
    if 'is_homepage' in page_data:
        page.is_homepage = page_data['is_homepage']
    if 'layout_data' in page_data:
        page.layout_data = json.dumps(page_data['layout_data'])
    
    page.updated_at = get_current_timestamp()
    db.commit()
    db.refresh(page)
    return page

def get_project(db: Session):
    """Get the project (there should be only one)"""
    return db.query(Project).first()

def update_project(db: Session, project_data: dict):
    """Update the project"""
    project = get_project(db)
    if not project:
        # Create project if it doesn't exist
        project = Project(
            id=generate_uuid(),
            name=project_data.get('name', 'Default Project'),
            description=project_data.get('description'),
            created_at=get_current_timestamp(),
            updated_at=get_current_timestamp()
        )
        db.add(project)
    else:
        # Update existing project
        if 'name' in project_data:
            project.name = project_data['name']
        if 'description' in project_data:
            project.description = project_data['description']
        if 'users_config' in project_data:
            config = project_data['users_config']
            project.users_config = json.dumps(config) if isinstance(config, (dict, list)) else config
        project.updated_at = get_current_timestamp()
    
    db.commit()
    db.refresh(project)
    return project

def create_variable(db: Session, variable_data: dict):
    """Create a new variable"""
    variable = AppVariable(
        id=generate_uuid(),
        name=variable_data['name'],
        type=variable_data['type'],
        value=variable_data.get('value'),
        formula=variable_data.get('formula'),
        description=variable_data.get('description'),
        created_at=get_current_timestamp()
    )
    db.add(variable)
    db.commit()
    db.refresh(variable)
    return variable

def get_all_variables(db: Session):
    """Get all variables"""
    return db.query(AppVariable).all()

def get_project_settings(db: Session, project_id: str = "default"):
    """Get project settings"""
    try:
        result = db.execute(
            text("SELECT * FROM project WHERE id = :project_id"),
            {"project_id": project_id}
        ).fetchone()
        
        if result:
            # Convert to dict using result._mapping for SQLAlchemy 2.0
            if hasattr(result, '_mapping'):
                return dict(result._mapping)
            else:
                # Fallback for older SQLAlchemy versions
                columns = [column[0] for column in result.cursor.description]
                return dict(zip(columns, result))
        return None
    except Exception as e:
        print(f"Error getting project settings: {e}")
        return None

def update_project_settings(db: Session, project_id: str = "default", settings: dict = None):
    """Update project settings"""
    if settings is None:
        settings = {}
    
    try:
        # Check if project exists
        existing = get_project_settings(db, project_id)
        
        if existing:
            # Build update query dynamically
            update_fields = []
            params = {"project_id": project_id}
            
            for key, value in settings.items():
                # Include all keys, even if value is None (to allow setting fields to NULL)
                update_fields.append(f"{key} = :{key}")
                params[key] = value
            
            if update_fields:
                query = text(f"UPDATE project SET {', '.join(update_fields)}, updated_at = :updated_at WHERE id = :project_id")
                params["updated_at"] = get_current_timestamp()
                db.execute(query, params)
        else:
            # Insert new project (only if it doesn't exist)
            columns = ["id", "name", "created_at", "updated_at"]
            values = [project_id, settings.get("name", "Default Project"), get_current_timestamp(), get_current_timestamp()]
            placeholders = [":id", ":name", ":created_at", ":updated_at"]
            
            for key, value in settings.items():
                if key not in ["id", "name", "created_at", "updated_at"] and value is not None:
                    columns.append(key)
                    values.append(value)
                    placeholders.append(f":{key}")
            
            query = text(f"INSERT INTO project ({', '.join(columns)}) VALUES ({', '.join(placeholders)})")
            params = dict(zip(columns, values))
            db.execute(query, params)
        
        db.commit()
        return True
    except Exception as e:
        print(f"Error updating project settings: {e}")
        db.rollback()
        return False

def _get_encryption_key():
    """Get encryption key from env or file"""
    # Priority 1: Environment Variable (Best for Production if set)
    env_key = os.getenv("ENCRYPTION_KEY")
    if env_key:
        return env_key.encode() if isinstance(env_key, str) else env_key
        
    # Priority 2: Persistent File in /app/data volume (Out-of-the-box fix)
    # We use path.join to be OS-agnostic, though in Docker it's /app/data
    key_file = os.path.join("data", "encryption_key.txt")
    
    if os.path.exists(key_file):
        with open(key_file, "rb") as f:
            return f.read()
            
    # Priority 3: Generate and Save to Persistent Volume
    key = Fernet.generate_key()
    try:
        # Ensure data directory exists (it should, but safety first)
        os.makedirs("data", exist_ok=True)
        with open(key_file, "wb") as f:
            f.write(key)
    except Exception as e:
        print(f"Warning: Could not save generated encryption key to {key_file}: {e}")
    return key

def encrypt_data(data: str):
    """Encrypt data using Fernet"""
    key = _get_encryption_key()
    fernet = Fernet(key)
    encrypted_data = fernet.encrypt(data.encode())
    return encrypted_data.decode()

def decrypt_data(encrypted_data: str):
    """Decrypt data using Fernet"""
    try:
        key = _get_encryption_key()
        fernet = Fernet(key)
        decrypted_data = fernet.decrypt(encrypted_data.encode())
        return decrypted_data.decode()
    except Exception as e:
        print(f"Decryption error: {e}")
        # Return original data if decryption fails (fallback behavior)
        return encrypted_data