"""
Test field mapper functionality.
"""

import pytest
from app.services.sync.engine.field_mapper import FieldMapper
from app.services.sync.models.sync_config import FieldMapping


def create_mapping(master: str, slave: str, transform: str = None, is_key: bool = False):
    """Helper to create a mock FieldMapping."""
    mapping = FieldMapping()
    mapping.master_column = master
    mapping.slave_column = slave
    mapping.transform = transform
    mapping.is_key_field = is_key
    mapping.skip_sync = False
    return mapping


class TestFieldMapper:
    """Tests for FieldMapper class."""
    
    def test_master_to_slave_simple(self):
        """Test simple column renaming."""
        mappings = [
            create_mapping("title", "post_title"),
            create_mapping("content", "post_content"),
        ]
        mapper = FieldMapper(mappings)
        
        result = mapper.master_to_slave({
            "title": "Hello World",
            "content": "Test content",
        })
        
        assert result == {
            "post_title": "Hello World",
            "post_content": "Test content",
        }
    
    def test_transform_upper(self):
        """Test uppercase transform."""
        mappings = [create_mapping("name", "name", "upper")]
        mapper = FieldMapper(mappings)
        
        result = mapper.master_to_slave({"name": "hello"})
        assert result["name"] == "HELLO"
    
    def test_transform_lower(self):
        """Test lowercase transform."""
        mappings = [create_mapping("name", "name", "lower")]
        mapper = FieldMapper(mappings)
        
        result = mapper.master_to_slave({"name": "HELLO"})
        assert result["name"] == "hello"
    
    def test_transform_default(self):
        """Test default value transform."""
        mappings = [create_mapping("status", "status", "default:draft")]
        mapper = FieldMapper(mappings)
        
        result = mapper.master_to_slave({"status": None})
        assert result["status"] == "draft"
    
    def test_find_conflicts(self):
        """Test conflict detection."""
        mappings = [
            create_mapping("id", "id", is_key=True),
            create_mapping("title", "title"),
            create_mapping("status", "status"),
        ]
        mapper = FieldMapper(mappings)
        
        conflicts = mapper.find_conflicts(
            master_record={"id": 1, "title": "New Title", "status": "published"},
            slave_record={"id": 1, "title": "Old Title", "status": "published"},
        )
        
        assert conflicts == ["title"]
    
    def test_no_conflicts(self):
        """Test when records match."""
        mappings = [
            create_mapping("id", "id", is_key=True),
            create_mapping("title", "title"),
        ]
        mapper = FieldMapper(mappings)
        
        conflicts = mapper.find_conflicts(
            master_record={"id": 1, "title": "Same"},
            slave_record={"id": 1, "title": "Same"},
        )
        
        assert conflicts == []
