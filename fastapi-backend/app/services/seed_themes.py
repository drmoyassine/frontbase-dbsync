import uuid
from datetime import datetime, timezone
import logging
from sqlalchemy.orm import Session
from app.models.theme import ComponentTheme

logger = logging.getLogger(__name__)

SYSTEM_THEMES = [
    {
        "name": "Horizontal Premium Card",
        "component_type": "InfoList",
        "is_system": True,
        "styles_data": {
            "stylingMode": "css",
            "activeProperties": [],
            "values": {
                "backgroundColor": "var(--card)"
            },
            "rawCSS": "& {\n  background-color: var(--card);\n  border: 1px solid var(--border);\n  border-radius: var(--radius);\n  padding: 1.5rem;\n  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);\n}\n\n& dl {\n  display: grid !important;\n  grid-template-columns: 1fr !important;\n  gap: 0 !important;\n}\n\n& dl > div {\n  display: grid;\n  grid-template-columns: 1fr;\n  gap: 0.25rem;\n  padding-top: 0.75rem;\n  padding-bottom: 0.75rem;\n  border-bottom: 1px solid var(--border);\n}\n\n& dl > div:last-child {\n  border-bottom: none;\n  padding-bottom: 0;\n}\n\n& dt {\n  color: var(--muted-foreground);\n  font-size: 0.875rem;\n  font-weight: 500;\n}\n\n& dd {\n  color: var(--foreground);\n  font-size: 0.875rem;\n}\n\n@media (min-width: 640px) {\n  & dl > div {\n    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);\n    gap: 1rem;\n  }\n}"
        }
    },
    {
        "name": "Flush Minimal",
        "component_type": "InfoList",
        "is_system": True,
        "styles_data": {
            "stylingMode": "css",
            "activeProperties": [],
            "values": {},
            "rawCSS": "& {\n  padding: 0;\n}\n\n& dl {\n  display: grid !important;\n  grid-template-columns: 1fr !important;\n  gap: 0 !important;\n}\n\n& dl > div {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  padding-top: 0.75rem;\n  padding-bottom: 0.75rem;\n  border-bottom: 1px solid var(--border);\n}\n\n& dt {\n  color: var(--muted-foreground);\n  font-size: 0.875rem;\n}\n\n& dd {\n  font-weight: 500;\n  text-align: right;\n}"
        }
    }
]

def seed_system_themes(db: Session):
    for theme_data in SYSTEM_THEMES:
        # Check if it already exists
        existing = db.query(ComponentTheme).filter(
            ComponentTheme.name == theme_data["name"],
            ComponentTheme.component_type == theme_data["component_type"]
        ).first()
        
        if existing:
            # Optionally update existing system themes when codebase changes
            existing.styles_data_dict = theme_data["styles_data"]
            continue
            
        now = datetime.now(timezone.utc).isoformat()
        theme = ComponentTheme(
            id=str(uuid.uuid4()),
            name=theme_data["name"],
            component_type=theme_data["component_type"],
            is_system=True,
            created_at=now,
            updated_at=now
        )
        theme.styles_data_dict = theme_data["styles_data"]
        db.add(theme)
        logger.info(f"[Startup] Seeded System Theme: {theme.name}")
        
    db.commit()
