"""
Conflict Resolver - handles data conflicts during sync.
"""

import json
from typing import Any, Dict, List, Optional
import httpx

from app.services.sync.models.sync_config import SyncConfig, ConflictStrategy
from app.services.sync.models.conflict import Conflict, ConflictStatus


class ConflictResolver:
    """
    Resolves conflicts between master and slave data.
    
    Strategies:
    - SOURCE_WINS: Master data always wins
    - TARGET_WINS: Slave data always wins
    - MANUAL: Store for admin review
    - MERGE: Combine non-conflicting fields
    - WEBHOOK: Call external URL for resolution
    """
    
    def __init__(self, config: SyncConfig):
        """Initialize with sync configuration."""
        self.config = config
        self.strategy = config.conflict_strategy
        self.webhook_url = config.webhook_url
    
    async def resolve(
        self,
        record_key: str,
        master_data: Dict[str, Any],
        slave_data: Dict[str, Any],
        conflicting_fields: List[str],
    ) -> Dict[str, Any]:
        """
        Resolve a conflict between master and slave records.
        
        Returns:
            resolved_data: The final data to use
            
        Raises:
            ConflictRequiresManualResolution: If MANUAL strategy and conflict detected
        """
        if self.strategy == ConflictStrategy.SOURCE_WINS:
            return self._resolve_source_wins(master_data, slave_data)
        
        elif self.strategy == ConflictStrategy.TARGET_WINS:
            return self._resolve_target_wins(master_data, slave_data)
        
        elif self.strategy == ConflictStrategy.MERGE:
            return self._resolve_merge(master_data, slave_data, conflicting_fields)
        
        elif self.strategy == ConflictStrategy.WEBHOOK and self.webhook_url:
            return await self._resolve_webhook(
                record_key, master_data, slave_data, conflicting_fields
            )
        
        elif self.strategy == ConflictStrategy.MANUAL:
            # Return None to indicate manual resolution needed
            raise ConflictRequiresManualResolution(
                record_key=record_key,
                master_data=master_data,
                slave_data=slave_data,
                conflicting_fields=conflicting_fields,
            )
        
        # Default to source wins
        return master_data
    
    def _resolve_source_wins(
        self,
        master_data: Dict[str, Any],
        slave_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Master data wins for all fields."""
        return master_data.copy()
    
    def _resolve_target_wins(
        self,
        master_data: Dict[str, Any],
        slave_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Slave data wins for all fields."""
        return slave_data.copy()
    
    def _resolve_merge(
        self,
        master_data: Dict[str, Any],
        slave_data: Dict[str, Any],
        conflicting_fields: List[str],
    ) -> Dict[str, Any]:
        """
        Merge non-conflicting fields from both sources.
        
        For conflicting fields, master wins.
        """
        result = slave_data.copy()
        
        # Update with all master values (master wins for conflicts)
        result.update(master_data)
        
        return result
    
    async def _resolve_webhook(
        self,
        record_key: str,
        master_data: Dict[str, Any],
        slave_data: Dict[str, Any],
        conflicting_fields: List[str],
    ) -> Dict[str, Any]:
        """
        Call external webhook to resolve conflict.
        
        Sends:
        {
            "record_key": "123",
            "master_data": {...},
            "slave_data": {...},
            "conflicting_fields": ["field1", "field2"],
            "config_id": "abc-123"
        }
        
        Expects response:
        {
            "resolved_data": {...}
        }
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    self.webhook_url,
                    json={
                        "record_key": record_key,
                        "master_data": master_data,
                        "slave_data": slave_data,
                        "conflicting_fields": conflicting_fields,
                        "config_id": self.config.id,
                        "config_name": self.config.name,
                    }
                )
                response.raise_for_status()
                
                result = response.json()
                if "resolved_data" in result:
                    return result["resolved_data"]
                
                # If webhook doesn't return resolved_data, fall back to source wins
                return master_data
                
            except httpx.HTTPError as e:
                # Webhook failed, raise for manual handling
                raise ConflictRequiresManualResolution(
                    record_key=record_key,
                    master_data=master_data,
                    slave_data=slave_data,
                    conflicting_fields=conflicting_fields,
                    error=f"Webhook failed: {str(e)}"
                )
    
    def create_conflict_record(
        self,
        job_id: str,
        record_key: str,
        master_data: Dict[str, Any],
        slave_data: Dict[str, Any],
        conflicting_fields: List[str],
    ) -> Conflict:
        """Create a Conflict record for manual review."""
        return Conflict(
            sync_config_id=self.config.id,
            job_id=job_id,
            record_key=str(record_key),
            master_data=json.dumps(master_data),
            slave_data=json.dumps(slave_data),
            conflicting_fields=json.dumps(conflicting_fields),
            status=ConflictStatus.PENDING,
        )


class ConflictRequiresManualResolution(Exception):
    """Raised when a conflict requires manual resolution."""
    
    def __init__(
        self,
        record_key: str,
        master_data: Dict[str, Any],
        slave_data: Dict[str, Any],
        conflicting_fields: List[str],
        error: Optional[str] = None,
    ):
        self.record_key = record_key
        self.master_data = master_data
        self.slave_data = slave_data
        self.conflicting_fields = conflicting_fields
        self.error = error
        super().__init__(f"Conflict on record {record_key} requires manual resolution")
