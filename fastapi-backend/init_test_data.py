from sqlalchemy.orm import Session
from app.database.config import SessionLocal, engine
from app.models.models import Base, User, Page, Project, AppVariable
from app.database.utils import generate_uuid, get_current_timestamp
import json

# Create tables
Base.metadata.create_all(bind=engine)

# Initialize test data
def init_test_data():
    db = SessionLocal()
    try:
        # Check if test user already exists
        existing_user = db.query(User).filter(User.id == "test-user-id").first()
        existing_user_by_email = db.query(User).filter(User.email == "test@example.com").first()
        if not existing_user and not existing_user_by_email:
            # Create a test user
            test_user = User(
                id="test-user-id",
                username="testuser",
                email="test@example.com",
                password_hash="$2b$12$testhash",  # Dummy hash
                created_at=get_current_timestamp(),
                updated_at=get_current_timestamp()
            )
            db.add(test_user)
            print("Created test user")
        else:
            print("Test user already exists")
        
        # Check if test project already exists
        existing_project = db.query(Project).filter(Project.id == "test-project-id").first()
        if not existing_project:
            # Create a test project
            test_project = Project(
                id="test-project-id",
                name="Test Project",
                description="A test project for FastAPI backend",
                created_at=get_current_timestamp(),
                updated_at=get_current_timestamp()
            )
            db.add(test_project)
            print("Created test project")
        else:
            print("Test project already exists")
        
        # Check if test pages already exist
        existing_page1 = db.query(Page).filter(Page.id == "test-page-1-id").first()
        if not existing_page1:
            # Create test pages
            test_page1 = Page(
                id="test-page-1-id",
                name="Home Page",
                slug="home",
                title="Home Page",
                description="The home page",
                is_public=True,
                is_homepage=True,
                layout_data=json.dumps({
                    "type": "container",
                    "props": {},
                    "children": [
                        {
                            "type": "heading",
                            "props": {"level": 1, "text": "Welcome to Frontbase"}
                        },
                        {
                            "type": "text",
                            "props": {"text": "This is a test page created for FastAPI backend testing"}
                        }
                    ]
                }),
                seo_data=json.dumps({}),
                created_at=get_current_timestamp(),
                updated_at=get_current_timestamp()
            )
            db.add(test_page1)
            print("Created test page 1")
        else:
            print("Test page 1 already exists")
        
        existing_page2 = db.query(Page).filter(Page.id == "test-page-2-id").first()
        if not existing_page2:
            test_page2 = Page(
                id="test-page-2-id",
                name="About Page",
                slug="about",
                title="About Us",
                description="About us page",
                is_public=True,
                is_homepage=False,
                layout_data=json.dumps({
                    "type": "container",
                    "props": {},
                    "children": [
                        {
                            "type": "heading",
                            "props": {"level": 1, "text": "About Us"}
                        },
                        {
                            "type": "text",
                            "props": {"text": "This is the about page created for FastAPI backend testing"}
                        }
                    ]
                }),
                seo_data=json.dumps({}),
                created_at=get_current_timestamp(),
                updated_at=get_current_timestamp()
            )
            db.add(test_page2)
            print("Created test page 2")
        else:
            print("Test page 2 already exists")
        
        # Check if test variables already exist
        existing_var1 = db.query(AppVariable).filter(AppVariable.id == "test-var-1-id").first()
        if not existing_var1:
            # Create test variables
            test_var1 = AppVariable(
                id="test-var-1-id",
                name="siteTitle",
                type="variable",
                value="Frontbase Test Site",
                description="The title of the site",
                created_at=get_current_timestamp()
            )
            db.add(test_var1)
            print("Created test variable 1")
        else:
            print("Test variable 1 already exists")
        
        existing_var2 = db.query(AppVariable).filter(AppVariable.id == "test-var-2-id").first()
        if not existing_var2:
            test_var2 = AppVariable(
                id="test-var-2-id",
                name="footerText",
                type="variable",
                value="© 2023 Frontbase Test Site",
                description="Text for the footer",
                created_at=get_current_timestamp()
            )
            db.add(test_var2)
            print("Created test variable 2")
        else:
            print("Test variable 2 already exists")
        
        # Commit all changes
        db.commit()
        
        print("Test data initialization completed!")
        
    except Exception as e:
        print(f"Error initializing test data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    init_test_data()