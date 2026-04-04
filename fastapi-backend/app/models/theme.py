"""Component Theme models — ComponentTheme."""

import json as _json

from sqlalchemy import Column, String, Boolean, Text
from sqlalchemy.orm import relationship

from ..database.config import Base


class ComponentTheme(Base):
    """Stores custom themes combining visualization parameters and deep CSS selectors."""
    __tablename__ = 'component_themes'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)
    component_type = Column(String(50), nullable=False)  # e.g., 'InfoList', 'DataTable', 'Form'
    styles_data = Column(Text, nullable=False)       # JSON string containing StylesData
    is_system = Column(Boolean, default=False)       # Immutable out-of-the-box themes
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    
    @property
    def styles_data_dict(self):
        """Get styles_data as a dictionary"""
        if self.styles_data:  # type: ignore[truthy-bool]
            return _json.loads(str(self.styles_data))
        return {}
    
    @styles_data_dict.setter
    def styles_data_dict(self, value):
        """Set styles_data from a dictionary"""
        self.styles_data = _json.dumps(value)
