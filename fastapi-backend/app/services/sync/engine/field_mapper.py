"""
Field Mapper - transforms data between master and slave schemas.
"""

from typing import Any, Dict, List, Optional
import json
import re

from app.services.sync.models.sync_config import FieldMapping


class FieldMapper:
    """
    Maps and transforms fields between master and slave schemas.
    
    Supports:
    - Simple column renaming
    - Type coercion
    - Custom transforms via expressions
    """
    
    def __init__(self, mappings: List[FieldMapping]):
        """Initialize with field mappings."""
        self.mappings = mappings
        self._master_to_slave = {m.master_column: m for m in mappings if not m.skip_sync}
        self._slave_to_master = {m.slave_column: m for m in mappings if not m.skip_sync}
        from app.services.sync.services.expression_engine import ExpressionEngine
        self.engine = ExpressionEngine()
    
    def master_to_slave(self, record: Dict[str, Any], slave_record: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Transform a master record to slave format using ExpressionEngine.
        """
        result = {}
        
        for mapping in self.mappings:
            if mapping.skip_sync:
                continue
            
            value = record.get(mapping.master_column)
            
            # Apply transform via ExpressionEngine if specified
            if mapping.transform:
                # If transform starts with template: or contains {{ or is @
                # it's a dynamic expression. Otherwise it might be a legacy simple transform.
                # ExpressionEngine handles both.
                value = self.engine.evaluate(mapping.transform, record, slave_record)
            
            result[mapping.slave_column] = value
        
        return result
    
    def slave_to_master(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform a slave record to master format.
        
        Args:
            record: Slave record with slave column names
            
        Returns:
            Transformed record with master column names
        """
        result = {}
        
        for mapping in self.mappings:
            if mapping.skip_sync:
                continue
            
            if mapping.slave_column in record:
                value = record[mapping.slave_column]
                # Note: transforms are one-way (master->slave)
                result[mapping.master_column] = value
        
        return result
    
    def get_key_mapping(self) -> Optional[FieldMapping]:
        """Get the key field mapping."""
        for mapping in self.mappings:
            if mapping.is_key_field:
                return mapping
        return None
    
    def get_master_columns(self) -> List[str]:
        """Get list of master columns to sync."""
        return [m.master_column for m in self.mappings if not m.skip_sync]
    
    def get_slave_columns(self) -> List[str]:
        """Get list of slave columns to sync."""
        return [m.slave_column for m in self.mappings if not m.skip_sync]
    
    def find_conflicts(
        self,
        master_record: Dict[str, Any],
        slave_record: Dict[str, Any],
    ) -> List[str]:
        """
        Find fields that have different values between master and slave.
        """
        conflicts = []
        
        for mapping in self.mappings:
            if mapping.skip_sync or mapping.is_key_field:
                continue
            
            master_val = master_record.get(mapping.master_column)
            slave_val = slave_record.get(mapping.slave_column)
            
            # Apply transform for comparison
            if mapping.transform:
                master_val = self.engine.evaluate(mapping.transform, master_record, slave_record)
            
            # Compare values
            if not self._values_equal(master_val, slave_val):
                conflicts.append(mapping.master_column)
        
        return conflicts
    
    def _values_equal(self, a: Any, b: Any) -> bool:
        """Compare two values for equality, handling edge cases."""
        # Handle None vs empty
        if a is None and b == "":
            return True
        if b is None and a == "":
            return True
        if a is None and b is None:
            return True
        
        # Handle numeric comparison
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            return float(a) == float(b)
        
        # String comparison
        return str(a) == str(b)
